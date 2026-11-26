import * as vault from '../lib/vault.js';
import { clearKeyCache } from '../lib/totp.js';
import { $, toast, t } from '../ui/dom.js';

export const state = {
  key: null,
  accounts: [],
  view: 'loading',
  importing: null, // importación en curso (ver lib/importer.js)
  editingId: null,
  rows: new Map(), // id -> elementos de la fila (en orden de pantalla)
  selected: 0, // fila marcada con el teclado
  codes: new Map(), // id -> { counter, code }
  lastTouch: 0,
  verifiedAt: 0, // última vez que se confirmó la contraseña para una acción sensible
  site: { tabId: null, host: null }, // pestaña desde la que se abrió el popup
};

/** true si esta página está abierta en una pestaña en vez de en el popup. */
export const inTab = new URLSearchParams(location.search).has('tab');
if (inTab) document.body.classList.add('in-tab');

/**
 * En Linux y macOS, abrir el selector de archivos desde el popup hace que Chrome lo cierre,
 * y el archivo elegido se pierde sin ningún aviso. Desde el popup, el campo abre la
 * extensión en una pestaña (en la vista indicada), donde el selector sí funciona.
 */
export function fileInputInTab(input, view) {
  if (inTab) return;
  input.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs
      .create({ url: chrome.runtime.getURL(`src/popup/popup.html?tab=1&view=${view}`) })
      .then(() => window.close());
  });
}

const showHooks = {};

export function onShow(view, fn) {
  showHooks[view] = fn;
}

export function show(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((s) => (s.hidden = s.dataset.view !== view));
  showHooks[view]?.();
  const focusable = $(`[data-view="${view}"] input:not([type=hidden]):not([type=file])`);
  if (focusable && !focusable.hidden) focusable.focus(); // en la lista: la búsqueda, para usar Enter
}

/** Desactiva el botón mientras se ejecuta una acción asíncrona y muestra errores. */
export async function busy(button, label, fn, errorEl) {
  const original = button.textContent;
  button.disabled = true;
  if (label) button.textContent = label;
  if (errorEl) errorEl.textContent = '';
  try {
    await fn();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
    else toast(err.message, 3000);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/**
 * Botón que requiere dos clics para confirmar acciones destructivas.
 * confirmLabel es una función para que siga el idioma si se cambia en Ajustes.
 */
export function confirmButton(button, confirmLabel, action) {
  let original;
  let timer;
  button.addEventListener('click', () => {
    if (button.dataset.armed) {
      delete button.dataset.armed;
      button.textContent = original;
      clearTimeout(timer);
      action();
      return;
    }
    original = button.textContent;
    button.dataset.armed = '1';
    button.textContent = confirmLabel();
    timer = setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = original;
    }, 3000);
  });
}

export function persist() {
  return vault.saveAccounts(state.key, state.accounts);
}

export function resetSession() {
  state.key = null;
  state.accounts = [];
  state.codes.clear();
  state.verifiedAt = 0;
  clearKeyCache();
}

// Tras confirmar la contraseña no se vuelve a pedir durante este margen.
const REAUTH_GRACE_MS = 2 * 60_000;

/**
 * Pide la contraseña antes de una acción sensible aunque la bóveda esté abierta,
 * para que quien use el navegador un momento no pueda exportar ni borrar las cuentas.
 * Resuelve true si se confirmó y false si se canceló.
 * always: pedirla aunque se haya confirmado hace poco (acciones irreversibles).
 */
export function requirePassword(message, { always = false } = {}) {
  if (!always && Date.now() - state.verifiedAt < REAUTH_GRACE_MS) return Promise.resolve(true);

  const dialog = $('#reauth');
  const form = $('#reauth-form');
  const errorEl = $('[data-error]', form);
  $('#reauth-text').textContent = message;
  form.reset();
  errorEl.textContent = '';
  dialog.showModal();
  form.password.focus();

  return new Promise((resolve) => {
    const finish = (ok) => {
      form.removeEventListener('submit', onSubmit);
      dialog.removeEventListener('close', onClose);
      $('#reauth-cancel').removeEventListener('click', onCancel);
      if (dialog.open) dialog.close();
      form.reset();
      resolve(ok);
    };
    const onClose = () => finish(false); // Esc
    const onCancel = () => finish(false);
    const onSubmit = (e) => {
      e.preventDefault();
      busy($('button[type=submit]', form), t('common.checking'), async () => {
        state.key = await vault.verifyPassword(form.password.value);
        state.verifiedAt = Date.now();
        finish(true);
      }, errorEl);
    };
    form.addEventListener('submit', onSubmit);
    dialog.addEventListener('close', onClose);
    $('#reauth-cancel').addEventListener('click', onCancel);
  });
}
