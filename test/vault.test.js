import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './chrome-mock.js';
import * as vault from '../src/lib/vault.js';
import { createAccount } from '../src/lib/accounts.js';

const chrome = installChromeMock();
const PASS = 'clave-segura-123';
const sample = () => [createAccount({ issuer: 'GitHub', account: 'dev', secret: 'JBSWY3DPEHPK3PXP' })];

beforeEach(() => {
  chrome.storage.local.clear();
  chrome.storage.session.clear();
});

test('crea, guarda cifrado y desbloquea', async () => {
  const key = await vault.createVault(PASS);
  await vault.saveAccounts(key, sample());
  assert.ok(!JSON.stringify(chrome.storage.local.raw()).includes('JBSWY3DPEHPK3PXP'), 'el secreto no debe estar en claro');
  await vault.lock();
  assert.equal(await vault.getSessionKey(), null);
  const { accounts } = await vault.unlock(PASS);
  assert.equal(accounts[0].issuer, 'GitHub');
  assert.ok(await vault.getSessionKey());
});

test('contraseña incorrecta y bloqueo progresivo tras 5 fallos', async () => {
  await vault.createVault(PASS);
  for (let i = 0; i < 4; i++) await assert.rejects(vault.unlock('mala'), /^Error: Contraseña incorrecta\.$/);
  await assert.rejects(vault.unlock('mala'), /Espera/);
  assert.ok((await vault.unlockBlockedFor()) > 25_000);
  // Bloqueado aunque la contraseña sea correcta
  await assert.rejects(vault.unlock(PASS), /Demasiados intentos/);
  // Al vencer la espera, la correcta funciona y se reinicia el contador
  const { unlockGuard } = await chrome.storage.local.get('unlockGuard');
  await chrome.storage.local.set({ unlockGuard: { ...unlockGuard, blockedUntil: Date.now() - 1 } });
  await vault.unlock(PASS);
  assert.equal(await vault.unlockBlockedFor(), 0);
  assert.equal((await chrome.storage.local.get('unlockGuard')).unlockGuard, undefined);
});

test('borrar datos reinicia el contador de intentos', async () => {
  await vault.createVault(PASS);
  for (let i = 0; i < 5; i++) await vault.unlock('mala').catch(() => {});
  await vault.wipe();
  assert.equal(await vault.hasVault(), false);
  assert.equal(await vault.unlockBlockedFor(), 0);
});

test('autobloqueo por inactividad', async () => {
  await vault.createVault(PASS);
  await vault.saveSettings({ autoLockMinutes: 5 });
  await chrome.storage.session.set({ lastActive: Date.now() - 6 * 60_000 });
  assert.equal(await vault.enforceAutoLock(), false);
  assert.equal(await vault.getSessionKey(), null);
});

test('"al cerrar el navegador" no bloquea por tiempo', async () => {
  await vault.createVault(PASS);
  await vault.saveSettings({ autoLockMinutes: 0 });
  await chrome.storage.session.set({ lastActive: 0 });
  assert.ok(await vault.getSessionKey());
});

test('cambiar contraseña', async () => {
  const key = await vault.createVault(PASS);
  await vault.saveAccounts(key, sample());
  await assert.rejects(vault.changePassword('mala', 'otra-clave-456'), /incorrecta/);
  await vault.changePassword(PASS, 'otra-clave-456');
  await assert.rejects(vault.unlock(PASS), /incorrecta/);
  assert.equal((await vault.unlock('otra-clave-456')).accounts.length, 1);
});

test('copia de seguridad: exportar y restaurar', async () => {
  const key = await vault.createVault(PASS);
  const backup = await vault.exportBackup(key, sample());
  assert.equal(backup.format, 'authenticator-extension-backup');
  assert.ok(!JSON.stringify(backup).includes('JBSWY3DPEHPK3PXP'));
  const restored = await vault.readBackup(JSON.parse(JSON.stringify(backup)), PASS);
  assert.equal(restored[0].secret, 'JBSWY3DPEHPK3PXP');
  await assert.rejects(vault.readBackup(backup, 'mala'), /incorrecta/);
  await assert.rejects(vault.readBackup({ foo: 1 }, PASS), /no es una copia/);
  await assert.rejects(vault.readBackup({ ...backup, kdf: { ...backup.kdf, iterations: 1e9 } }, PASS), /no válidos/);
});

test('importación pendiente cifrada en la sesión', async () => {
  const key = await vault.createVault(PASS);
  await vault.savePendingImport(key, { items: [1, 2], batches: {} });
  assert.deepEqual(await vault.loadPendingImport(key), { items: [1, 2], batches: {} });
  // Con otra clave (p. ej. tras cambiar la contraseña) se descarta
  const other = await vault.changePassword(PASS, 'otra-clave-456');
  assert.notEqual(other, key);
  await chrome.storage.session.set({ pendingImport: (await chrome.storage.session.get('pendingImport')).pendingImport });
  assert.equal(await vault.loadPendingImport(other), null);
});

test('las bóvedas con menos iteraciones se actualizan al desbloquear', async () => {
  const enc = new TextEncoder();
  const b64 = (u8) => Buffer.from(u8).toString('base64');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(PASS), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ accounts: sample() })));
  await chrome.storage.local.set({
    vault: { version: 1, kdf: { salt: b64(salt), iterations: 100_000 }, iv: b64(iv), data: b64(new Uint8Array(data)) },
  });

  const { accounts } = await vault.unlock(PASS);
  assert.equal(accounts.length, 1);
  const { vault: stored } = await chrome.storage.local.get('vault');
  assert.equal(stored.kdf.iterations, 600_000);
  await vault.lock();
  assert.equal((await vault.unlock(PASS)).accounts[0].issuer, 'GitHub');
});
