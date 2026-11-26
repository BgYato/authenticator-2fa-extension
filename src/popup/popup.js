import * as vault from '../lib/vault.js';
import { $, t, toast } from '../ui/dom.js';
import { state, show, busy, resetSession } from './ui.js';
import { loadSite, startTicker } from './list.js';
import { showHome, openAdd } from './import.js';
import { openSettings } from './settings.js';
import './edit.js';

// Vista a la que ir al abrir la página en una pestaña (ver fileInputInTab en ui.js).
const startView = new URLSearchParams(location.search).get('view');

async function enter() {
  await showHome();
  if (startView === 'settings') {
    await openSettings();
    toast(t('settings.chooseBackupFile'), 4000);
  } else if (startView === 'add' && state.view === 'main') {
    openAdd();
    toast(t('add.chooseImage'), 4000);
  }
}

async function init() {
  await loadSite();
  if (!(await vault.hasVault())) return show('setup');
  const key = await vault.getSessionKey();
  if (!key) return show('unlock');
  state.key = key;
  state.accounts = await vault.loadAccounts(key);
  await enter();
}

$('#setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const { password, confirm } = Object.fromEntries(new FormData(form));
  const errorEl = $('[data-error]', form);
  if (password !== confirm) return (errorEl.textContent = t('setup.mismatch'));
  busy($('button', form), t('setup.encrypting'), async () => {
    state.key = await vault.createVault(password);
    state.accounts = [];
    state.verifiedAt = Date.now();
    form.reset();
    show('add');
  }, errorEl);
});

$('#unlock-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy($('button', form), t('common.unlocking'), async () => {
    const { key, accounts } = await vault.unlock(form.password.value);
    state.key = key;
    state.accounts = accounts;
    state.verifiedAt = Date.now(); // recién escrita: no pedirla otra vez enseguida
    form.reset();
    await enter();
  }, $('[data-error]', form));
});

$('#btn-add').addEventListener('click', () => openAdd());
$('#btn-add-empty').addEventListener('click', () => openAdd());
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-lock').addEventListener('click', async () => {
  await vault.lock();
  resetSession();
  show('unlock');
});
document.querySelectorAll('[data-back]').forEach((b) =>
  b.addEventListener('click', () => show(b.dataset.back)),
);

startTicker();
init().catch((err) => {
  console.error(err);
  document.body.textContent = t('common.startError', { msg: err.message });
});
