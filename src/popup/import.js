// Los QR leídos se acumulan en state.importing y se guardan cifrados en la sesión
// en cada paso, porque Chrome cierra el popup al cambiar de pestaña.

import * as vault from '../lib/vault.js';
import { createAccount, isSameAccount } from '../lib/accounts.js';
import { decodeQrFromBlob, decodeQrFromDataUrl } from '../lib/qr.js';
import {
  newImport, addToImport, refreshDuplicates, selectedAccounts, describeBatches,
} from '../lib/importer.js';
import { $, toast, t, renderImportList } from '../ui/dom.js';
import { state, show, busy, persist, fileInputInTab } from './ui.js';

/** Muestra la lista, o retoma la importación si había una a medias. */
export async function showHome() {
  state.importing = await vault.loadPendingImport(state.key);
  if (state.importing?.items.length) {
    refreshDuplicates(state.importing, state.accounts);
    show('add');
    renderPreview();
  } else {
    state.importing = null;
    show('main');
  }
}

export function openAdd() {
  $('#add-error').textContent = '';
  $('#add-status').hidden = true;
  show('add');
  renderPreview();
}

async function resetPreview() {
  state.importing = null;
  await vault.clearPendingImport();
  renderPreview();
}

export function savePending() {
  return vault.savePendingImport(state.key, state.importing);
}

function addError(message) {
  $('#add-error').textContent = message;
}

async function handleOtpText(text) {
  addError('');
  const imp = state.importing ?? newImport();
  const { added, repeated, batch } = addToImport(imp, text, state.accounts);
  state.importing = imp;
  await savePending();
  renderPreview();
  if (repeated) toast(t('add.qrRepeated', { i: batch.index + 1, n: batch.size }), 2500);
  else toast(t('common.accountsRead', { n: added }));
}

function renderPreview() {
  const imp = state.importing;
  const hasItems = !!imp?.items.length;
  $('#import-preview').hidden = !hasItems;
  const info = $('#batch-info');
  if (!hasItems) {
    $('#preview-list').replaceChildren();
    info.hidden = true;
    return;
  }
  const confirmBtn = $('#btn-confirm-import');
  const updateCount = () => {
    const n = selectedAccounts(imp).length;
    confirmBtn.textContent = t('common.importN', { n });
    confirmBtn.disabled = n === 0;
  };
  renderImportList($('#preview-list'), imp, () => {
    updateCount();
    savePending();
  });
  updateCount();
  info.textContent = describeBatches(imp, t('add.nextTabHint'));
  info.hidden = !info.textContent;
}

async function scanBlob(blob) {
  addError('');
  try {
    await handleOtpText(await decodeQrFromBlob(blob));
  } catch (err) {
    addError(err.message);
  }
}

fileInputInTab($('#file-input'), 'add');
// Botón de verdad (alcanzable con el teclado) que abre el selector del campo oculto.
$('#btn-upload').addEventListener('click', () => $('#file-input').click());

$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) await scanBlob(file);
});

async function captureTab(format = 'png') {
  try {
    return await chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format, quality: 95 });
  } catch {
    throw new Error(t('add.captureFailed'));
  }
}

$('#btn-capture').addEventListener('click', (e) => {
  busy(e.currentTarget, t('add.scanning'), async () => {
    const text = await decodeQrFromDataUrl(await captureTab());
    if (!text) throw new Error(t('add.noQrInTab'));
    await handleOtpText(text);
  }, $('#add-error'));
});

// Selección de zona: se captura la pestaña y la captura se abre en una página
// de la extensión donde se marca el recuadro (no hace falta inyectar código en la web).
$('#btn-select-area').addEventListener('click', (e) => {
  busy(e.currentTarget, null, async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let dataUrl = await captureTab();
    if (dataUrl.length > 8_000_000) dataUrl = await captureTab('jpeg'); // límite de storage.session
    await chrome.storage.session.set({ areaShot: { dataUrl, tabId: tab?.id, dpr: devicePixelRatio } });
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/select/select.html'), index: (tab?.index ?? 0) + 1 });
    window.close();
  }, $('#add-error'));
});

// La cámara se usa desde una pestaña propia: el popup no puede mostrar el aviso de permiso.
$('#btn-camera').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/scan/scan.html') });
  window.close();
});

const dropzone = $('#dropzone');
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('over');
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (file) scanBlob(file);
});

document.addEventListener('paste', (e) => {
  if (state.view !== 'add') return;
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (item) {
    e.preventDefault();
    scanBlob(item.getAsFile());
    return;
  }
  // Pegar un enlace fuera del textarea también funciona
  const text = e.clipboardData.getData('text');
  if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT' && /^otpauth/i.test(text.trim())) {
    e.preventDefault();
    handleOtpText(text).catch((err) => addError(err.message));
  }
});

$('#uri-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    await handleOtpText(form.uri.value);
    form.reset();
  } catch (err) {
    addError(err.message);
  }
});

$('#manual-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorEl = $('[data-error]', form);
  errorEl.textContent = '';
  try {
    const acc = createAccount(Object.fromEntries(new FormData(form)));
    if (state.accounts.some((a) => isSameAccount(a, acc))) throw new Error(t('add.exists'));
    state.accounts.push(acc);
    await persist();
    form.reset();
    toast(t('add.added'));
    show('main');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

$('#btn-cancel-import').addEventListener('click', () => resetPreview());

$('#btn-confirm-import').addEventListener('click', (e) => {
  busy(e.currentTarget, t('add.saving'), async () => {
    refreshDuplicates(state.importing, state.accounts);
    const selected = selectedAccounts(state.importing);
    if (selected.length === 0) throw new Error(t('common.noNewSelected'));

    state.accounts.push(...selected);
    await persist();
    await resetPreview();
    toast(t('common.accountsImported', { n: selected.length }));
    show('main');
  }, $('#add-error'));
});
