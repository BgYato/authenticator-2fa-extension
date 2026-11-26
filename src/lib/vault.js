// Bóveda cifrada de cuentas.
//
// - chrome.storage.local guarda las cuentas cifradas con AES-GCM 256.
// - La clave se deriva de la contraseña maestra con PBKDF2-SHA256.
// - Tras desbloquear, la clave AES se guarda en chrome.storage.session
//   (solo en memoria, se borra al cerrar el navegador, no accesible a content scripts)
//   para no pedir la contraseña cada vez que se abre el popup.

import { t } from './i18n.js';

const PBKDF2_ITERATIONS = 600_000;
// language: 'auto' (el del navegador) o un código de lib/i18n.js
const DEFAULT_SETTINGS = { autoLockMinutes: 15, clipboardClearSeconds: 30, autofill: true, language: 'auto' };

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = {
  encode(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  },
};

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

async function encryptJson(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64.encode(iv), data: b64.encode(data) };
}

async function decryptJson(key, { iv, data }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.decode(iv) }, key, b64.decode(data));
  return JSON.parse(dec.decode(plain));
}

async function getVault() {
  const { vault } = await chrome.storage.local.get('vault');
  return vault || null;
}

async function writeVault(key, kdf, accounts) {
  const payload = await encryptJson(key, { accounts });
  await chrome.storage.local.set({ vault: { version: 1, kdf, ...payload } });
}

async function rememberKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.session.set({ vaultKey: b64.encode(raw), lastActive: Date.now() });
}

function newKdf() {
  return { salt: b64.encode(crypto.getRandomValues(new Uint8Array(16))), iterations: PBKDF2_ITERATIONS };
}

export async function hasVault() {
  return (await getVault()) !== null;
}

export async function createVault(password) {
  const kdf = newKdf();
  const key = await deriveKey(password, b64.decode(kdf.salt), kdf.iterations);
  await writeVault(key, kdf, []);
  await rememberKey(key);
  return key;
}

// Limitación de intentos: tras MAX_FREE_ATTEMPTS fallos seguidos hay que esperar,
// y la espera se duplica con cada fallo adicional (hasta MAX_BLOCK_MS).
const MAX_FREE_ATTEMPTS = 5;
const BASE_BLOCK_MS = 30_000;
const MAX_BLOCK_MS = 15 * 60_000;

async function getUnlockGuard() {
  const { unlockGuard } = await chrome.storage.local.get('unlockGuard');
  return unlockGuard || { failures: 0, blockedUntil: 0 };
}

function waitMessage(ms) {
  const secs = Math.ceil(ms / 1000);
  return secs > 90 ? `${Math.ceil(secs / 60)} min` : `${secs} s`;
}

/** Milisegundos que faltan para poder volver a intentarlo (0 si no hay bloqueo). */
export async function unlockBlockedFor() {
  return Math.max(0, (await getUnlockGuard()).blockedUntil - Date.now());
}

/** Comprueba la contraseña y devuelve { key, accounts } sin guardar nada en la sesión. */
async function openVault(password) {
  const vault = await getVault();
  if (!vault) throw new Error(t('vault.none'));

  const guard = await getUnlockGuard();
  const wait = guard.blockedUntil - Date.now();
  if (wait > 0) throw new Error(t('vault.tooManyAttempts', { wait: waitMessage(wait) }));

  const key = await deriveKey(password, b64.decode(vault.kdf.salt), vault.kdf.iterations);
  let content;
  try {
    content = await decryptJson(key, vault);
  } catch {
    guard.failures += 1;
    const extra = guard.failures - MAX_FREE_ATTEMPTS;
    if (extra >= 0) guard.blockedUntil = Date.now() + Math.min(BASE_BLOCK_MS * 2 ** extra, MAX_BLOCK_MS);
    await chrome.storage.local.set({ unlockGuard: guard });
    const left = MAX_FREE_ATTEMPTS - guard.failures;
    throw new Error(
      left > 0
        ? t('vault.wrongPassword')
        : t('vault.wrongPasswordWait', { wait: waitMessage(guard.blockedUntil - Date.now()) }),
    );
  }
  await chrome.storage.local.remove('unlockGuard');

  // Bóvedas creadas con menos iteraciones se vuelven a cifrar con el valor actual.
  if (vault.kdf.iterations < PBKDF2_ITERATIONS) {
    const kdf = newKdf();
    const upgraded = await deriveKey(password, b64.decode(kdf.salt), kdf.iterations);
    await writeVault(upgraded, kdf, content.accounts);
    return { key: upgraded, accounts: content.accounts };
  }
  return { key, accounts: content.accounts };
}

export async function unlock(password) {
  const result = await openVault(password);
  await rememberKey(result.key);
  return result;
}

/**
 * Vuelve a pedir la contraseña con la bóveda ya abierta (acciones sensibles).
 * Aplica el mismo límite de intentos que el desbloqueo. Devuelve la clave vigente.
 */
export async function verifyPassword(password) {
  return (await unlock(password)).key;
}

/** Bloquea si se superó el tiempo de inactividad. Devuelve true si la sesión sigue abierta. */
export async function enforceAutoLock() {
  const { vaultKey, lastActive } = await chrome.storage.session.get(['vaultKey', 'lastActive']);
  if (!vaultKey) return false;
  const { autoLockMinutes } = await getSettings();
  if (autoLockMinutes > 0 && Date.now() - (lastActive || 0) > autoLockMinutes * 60_000) {
    await lock();
    return false;
  }
  return true;
}

/** Devuelve la clave de la sesión si sigue desbloqueada (respetando el autobloqueo). */
export async function getSessionKey() {
  if (!(await enforceAutoLock())) return null;
  const { vaultKey } = await chrome.storage.session.get('vaultKey');
  await touch();
  return crypto.subtle.importKey('raw', b64.decode(vaultKey), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function touch() {
  await chrome.storage.session.set({ lastActive: Date.now() });
}

export async function loadAccounts(key) {
  const vault = await getVault();
  return (await decryptJson(key, vault)).accounts;
}

export async function saveAccounts(key, accounts) {
  const vault = await getVault();
  await writeVault(key, vault.kdf, accounts);
}

export async function lock() {
  await chrome.storage.session.remove(['vaultKey', 'lastActive']);
}

export async function changePassword(currentPassword, newPassword) {
  const { accounts } = await openVault(currentPassword);
  const kdf = newKdf();
  const key = await deriveKey(newPassword, b64.decode(kdf.salt), kdf.iterations);
  await writeVault(key, kdf, accounts);
  await rememberKey(key);
  return key;
}

// La copia va cifrada con la contraseña maestra vigente al exportarla
// (mismo formato que la bóveda), así que no contiene ningún secreto en claro.

const BACKUP_FORMAT = 'authenticator-extension-backup';

export async function exportBackup(key, accounts) {
  const vault = await getVault();
  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    count: accounts.length,
    kdf: vault.kdf,
    ...(await encryptJson(key, { accounts })),
  };
}

/** Descifra una copia con la contraseña con la que se exportó. Devuelve las cuentas. */
export async function readBackup(backup, password) {
  if (backup?.format !== BACKUP_FORMAT || !backup.kdf || !backup.iv || !backup.data) {
    throw new Error(t('vault.notBackup'));
  }
  const { iterations } = backup.kdf;
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 5_000_000) {
    throw new Error(t('vault.backupParams'));
  }
  const key = await deriveKey(password, b64.decode(backup.kdf.salt), iterations);
  try {
    const { accounts } = await decryptJson(key, backup);
    if (!Array.isArray(accounts)) throw new Error();
    return accounts;
  } catch {
    throw new Error(t('vault.backupWrong'));
  }
}

// Importación en curso (QR escaneados aún sin confirmar). Se guarda cifrada en
// storage.session para sobrevivir al cierre del popup al cambiar de pestaña.

export async function savePendingImport(key, data) {
  await chrome.storage.session.set({ pendingImport: await encryptJson(key, data) });
}

export async function loadPendingImport(key) {
  const { pendingImport } = await chrome.storage.session.get('pendingImport');
  if (!pendingImport) return null;
  try {
    return await decryptJson(key, pendingImport);
  } catch {
    await clearPendingImport(); // cifrado con una clave anterior (p. ej. tras cambiar la contraseña)
    return null;
  }
}

export async function clearPendingImport() {
  await chrome.storage.session.remove('pendingImport');
}

export async function wipe() {
  await chrome.storage.local.remove(['vault', 'unlockGuard']);
  await clearPendingImport();
  await lock();
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}
