import * as vault from '../lib/vault.js';
import { createAccount, isSameAccount } from '../lib/accounts.js';
import { LANGUAGES, initI18n, applyI18n } from '../lib/i18n.js';
import { $, el, toast, t } from '../ui/dom.js';
import { state, show, busy, persist, resetSession, requirePassword, fileInputInTab } from './ui.js';
import { savePending } from './import.js';

// Cada idioma aparece con su propio nombre, sin traducir, para encontrarlo siempre.
$('#language').append(
  ...Object.entries(LANGUAGES).map(([code, name]) => el('option', { value: code, lang: code }, name)),
);

export async function openSettings() {
  const { autoLockMinutes, clipboardClearSeconds, autofill, language } = await vault.getSettings();
  $('#language').value = language in LANGUAGES ? language : 'auto';
  $('#autolock').value = String(autoLockMinutes);
  $('#clipboard-clear').value = String(clipboardClearSeconds);
  $('#autofill').checked = autofill;
  $('#clipboard-verify').checked = await chrome.permissions.contains(CLIPBOARD_READ).catch(() => false);
  $('#clipboard-verify').disabled = clipboardClearSeconds === 0;
  const commands = await chrome.commands.getAll().catch(() => []);
  const shortcut = commands.find((c) => c.name === '_execute_action')?.shortcut;
  $('#shortcut').textContent = shortcut || t('settings.unassigned');
  // El nombre del autor va como enlace a homepage_url; se parte el texto traducido por su posición.
  const { version, author, homepage_url: url } = chrome.runtime.getManifest();
  const [before, after = ''] = t('settings.about', { version, author: '\u0000' }).split('\u0000');
  const link = url ? el('a', { href: url, target: '_blank', rel: 'noopener' }, author) : author;
  $('#about').replaceChildren(before, link, after);
  show('settings');
}

// El cambio se aplica al momento: se retraduce el HTML y se vuelve a pintar Ajustes.
$('#language').addEventListener('change', async (e) => {
  await vault.saveSettings({ language: e.target.value });
  await initI18n();
  applyI18n();
  await openSettings();
  $('#language').focus();
  toast(t('common.settingSaved'));
});

$('#autolock').addEventListener('change', async (e) => {
  await vault.saveSettings({ autoLockMinutes: Number(e.target.value) });
  toast(t('common.settingSaved'));
});

$('#autofill').addEventListener('change', async (e) => {
  await vault.saveSettings({ autofill: e.target.checked });
  toast(t('common.settingSaved'));
});

$('#btn-shortcut').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
});

$('#clipboard-clear').addEventListener('change', async (e) => {
  await vault.saveSettings({ clipboardClearSeconds: Number(e.target.value) });
  $('#clipboard-verify').disabled = e.target.value === '0';
  toast(t('common.settingSaved'));
});

// Permiso opcional: no se pide al instalar, solo si se activa esta opción (y se puede retirar).
const CLIPBOARD_READ = { permissions: ['clipboardRead'] };

$('#clipboard-verify').addEventListener('change', async (e) => {
  const box = e.target;
  try {
    const granted = box.checked
      ? await chrome.permissions.request(CLIPBOARD_READ)
      : !(await chrome.permissions.remove(CLIPBOARD_READ));
    box.checked = granted;
    toast(t('common.settingSaved'));
  } catch (err) {
    box.checked = await chrome.permissions.contains(CLIPBOARD_READ).catch(() => false);
    toast(err.message, 3000);
  }
});

$('#password-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const { current, password, confirm } = Object.fromEntries(new FormData(form));
  const errorEl = $('[data-error]', form);
  if (password !== confirm) return (errorEl.textContent = t('settings.newMismatch'));
  busy($('button', form), t('settings.changing'), async () => {
    state.key = await vault.changePassword(current, password);
    if (state.importing) await savePending(); // re-cifrar con la nueva clave
    form.reset();
    form.closest('details').open = false;
    toast(t('settings.passwordUpdated'));
  }, errorEl);
});

$('#btn-export').addEventListener('click', (e) => {
  busy(e.currentTarget, null, async () => {
    if (!(await requirePassword(t('settings.exportPrompt')))) return;
    const backup = await vault.exportBackup(state.key, state.accounts);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const a = el('a', { href: url, download: `${t('settings.backupFilename')}-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(t('settings.exported'));
  });
});

let backupData = null;

fileInputInTab($('#backup-file'), 'settings');
$('#btn-import-backup').addEventListener('click', () => $('#backup-file').click());

$('#backup-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error(t('settings.fileTooBig'));
    backupData = JSON.parse(await file.text());
  } catch (err) {
    toast(err instanceof SyntaxError ? t('settings.invalidFile') : err.message, 3000);
    return;
  }
  const form = $('#backup-form');
  $('#backup-name').textContent = file.name;
  form.hidden = false;
  form.password.focus();
});

$('#btn-backup-cancel').addEventListener('click', () => {
  backupData = null;
  $('#backup-form').reset();
  $('#backup-form').hidden = true;
});

$('#backup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy($('button[type=submit]', form), t('settings.restoring'), async () => {
    const raw = await vault.readBackup(backupData, form.password.value);
    let added = 0;
    for (const r of raw) {
      let acc;
      try {
        acc = createAccount({ ...r, id: state.accounts.some((a) => a.id === r.id) ? undefined : r.id });
      } catch {
        continue;
      }
      if (state.accounts.some((a) => isSameAccount(a, acc))) continue;
      state.accounts.push(acc);
      added++;
    }
    await persist();
    backupData = null;
    form.reset();
    form.hidden = true;
    let msg = t('settings.restored', { n: added });
    if (!raw.length) msg = t('settings.backupEmpty');
    else if (!added) msg = t('settings.nothingNew', { n: raw.length });
    toast(msg, added ? 2500 : 5000);
  }, $('[data-error]', form));
});

$('#btn-wipe').addEventListener('click', async () => {
  if (!(await requirePassword(t('settings.wipePrompt'), { always: true }))) return;
  await vault.wipe();
  resetSession();
  toast(t('settings.wiped'));
  show('setup');
});
