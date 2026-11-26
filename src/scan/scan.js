// Va en una pestaña propia porque el popup de la extensión no puede mostrar
// el aviso de permiso de cámara. Lo leído se guarda en la misma importación
// pendiente que usa el popup (cifrada en storage.session).

import * as vault from '../lib/vault.js';
import {
  newImport, addToImport, refreshDuplicates, selectedAccounts, describeBatches, batchStatus,
} from '../lib/importer.js';
import { $, el, toast, t, renderImportList } from '../ui/dom.js';

const SCAN_INTERVAL_MS = 150;
const SCAN_MAX_SIDE = 800;
const SAME_QR_COOLDOWN_MS = 4000;

const state = {
  key: null,
  importing: null,
  stream: null,
  busy: false,
  lastText: '',
  lastTextAt: 0,
  lastTouch: 0,
};

const video = $('#video');
const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function showSection(id) {
  for (const s of ['unlock', 'scanner', 'done']) $(`#${s}`).hidden = s !== id;
}

function setStatus(text, kind = '') {
  const s = $('#status');
  s.textContent = text;
  s.className = `status ${kind}`;
}

async function init() {
  if (!(await vault.hasVault())) {
    $('#message').textContent = t('scan.notSetup');
    $('#message').hidden = false;
    return;
  }
  state.key = await vault.getSessionKey();
  if (!state.key) {
    showSection('unlock');
    $('#unlock-form [name=password]').focus();
    return;
  }
  await start();
}

async function start() {
  showSection('scanner');
  state.importing = (await vault.loadPendingImport(state.key)) ?? newImport();
  refreshDuplicates(state.importing, await vault.loadAccounts(state.key));
  renderPending();
  await startCamera();
}

$('#unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorEl = $('[data-error]', form);
  errorEl.textContent = '';
  try {
    ({ key: state.key } = await vault.unlock(form.password.value));
    form.reset();
    await start();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return t('scan.denied');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('scan.noCamera');
    case 'NotReadableError':
      return t('scan.cameraBusy');
    default:
      return t('scan.cameraFailed', { msg: err?.message || err });
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.srcObject = null;
}

async function startCamera(deviceId) {
  stopCamera();
  $('#btn-retry').hidden = true;
  setStatus(t('scan.starting'));

  const constraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
  if (deviceId) constraints.deviceId = { exact: deviceId };
  else constraints.facingMode = { ideal: 'environment' };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  } catch (err) {
    console.error(err);
    setStatus(cameraErrorMessage(err), 'err');
    $('#btn-retry').hidden = false;
    return;
  }

  video.srcObject = state.stream;
  await video.play();
  await listCameras(state.stream.getVideoTracks()[0]?.getSettings().deviceId);
  setStatus(t('scan.placeQr'));
  scanLoop();
}

/** Los nombres de las cámaras solo están disponibles después de conceder el permiso. */
async function listCameras(currentId) {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  $('#camera-select').replaceChildren(
    ...cams.map((d, i) => el('option', { value: d.deviceId, selected: d.deviceId === currentId }, d.label || t('scan.cameraN', { n: i + 1 }))),
  );
  $('#camera-field').hidden = cams.length < 2;
}

$('#camera-select').addEventListener('change', (e) => startCamera(e.target.value));
$('#btn-retry').addEventListener('click', () => startCamera($('#camera-select').value || undefined));
$('#mirror').addEventListener('change', (e) => $('#camera').classList.toggle('mirror', e.target.checked));
window.addEventListener('pagehide', stopCamera);

const decoder = new Worker('decoder.worker.js');
let decoding = false;

decoder.onmessage = ({ data: { text } }) => {
  decoding = false;
  if (text && state.stream) onQr(text);
};
decoder.onerror = (e) => {
  decoding = false;
  console.error('Error en el decodificador de QR', e);
};

function scanLoop() {
  const stream = state.stream;
  const step = () => {
    if (state.stream !== stream) return;
    // No se decodifica con la pestaña oculta ni mientras el fotograma anterior siga en proceso.
    if (!document.hidden && video.readyState >= 2 && !decoding && !state.busy) scanFrame();
    keepAlive();
    setTimeout(step, SCAN_INTERVAL_MS);
  };
  step();
}

function scanFrame() {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh) return;
  const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  decoding = true;
  decoder.postMessage({ buffer: data.buffer, width: w, height: h }, [data.buffer]);
}

function flash() {
  const cam = $('#camera');
  cam.classList.add('flash');
  setTimeout(() => cam.classList.remove('flash'), 600);
}

async function onQr(text) {
  const now = Date.now();
  // Mientras el mismo QR siga delante de la cámara, no se vuelve a procesar.
  if (text === state.lastText && now - state.lastTextAt < SAME_QR_COOLDOWN_MS) {
    state.lastTextAt = now;
    return;
  }
  state.lastText = text;
  state.lastTextAt = now;
  state.busy = true;
  try {
    const accounts = await vault.loadAccounts(state.key);
    const { added, repeated, batch } = addToImport(state.importing, text, accounts);
    await vault.savePendingImport(state.key, state.importing);
    flash();
    renderPending();

    const multi = batch && batch.size > 1;
    if (repeated) {
      setStatus(t('scan.qrRepeated', { i: batch.index + 1, n: batch.size }));
    } else {
      const done = multi && batchStatus(state.importing).every((b) => b.missing.length === 0);
      setStatus(
        `${t('common.accountsRead', { n: added })}${multi ? t('scan.fromQr', { i: batch.index + 1, n: batch.size }) : ''}. ` +
          t(done ? 'scan.allDone' : multi ? 'scan.nextQr' : 'scan.review'),
        'ok',
      );
    }
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    state.busy = false;
  }
}

/** Mientras la página esté abierta, la bóveda no se bloquea por inactividad. */
function keepAlive() {
  const now = Date.now();
  if (now - state.lastTouch > 30_000) {
    state.lastTouch = now;
    vault.touch();
  }
}

function renderPending() {
  const imp = state.importing;
  const hasItems = imp.items.length > 0;
  $('#pending').hidden = !hasItems;
  if (!hasItems) return;

  const importBtn = $('#btn-import');
  const updateCount = () => {
    const n = selectedAccounts(imp).length;
    importBtn.textContent = t('common.importN', { n });
    importBtn.disabled = n === 0;
  };
  renderImportList($('#preview-list'), imp, () => {
    updateCount();
    vault.savePendingImport(state.key, imp);
  });
  updateCount();

  const info = $('#batch-info');
  info.textContent = describeBatches(imp, t('scan.missingHint'));
  info.hidden = !info.textContent;
}

$('#btn-import').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const errorEl = $('#import-error');
  errorEl.textContent = '';
  button.disabled = true;
  try {
    const accounts = await vault.loadAccounts(state.key);
    refreshDuplicates(state.importing, accounts);
    const selected = selectedAccounts(state.importing);
    if (selected.length === 0) throw new Error(t('common.noNewSelected'));
    await vault.saveAccounts(state.key, [...accounts, ...selected]);
    await vault.clearPendingImport();
    stopCamera();
    $('#done-text').textContent = `${t('common.accountsImported', { n: selected.length })}.`;
    showSection('done');
  } catch (err) {
    errorEl.textContent = err.message;
    button.disabled = false;
  }
});

$('#btn-cancel').addEventListener('click', async () => {
  state.importing = newImport();
  state.lastText = '';
  await vault.clearPendingImport();
  renderPending();
  setStatus(t('scan.discarded'));
  toast(t('scan.discardedToast'));
});

$('#btn-close').addEventListener('click', async () => {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id != null) chrome.tabs.remove(tab.id);
  else window.close();
});

init().catch((err) => {
  console.error(err);
  setStatus(t('common.startError', { msg: err.message }), 'err');
});
