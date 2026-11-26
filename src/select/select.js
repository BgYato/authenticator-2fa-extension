// El popup guarda la captura en storage.session (areaShot) y abre esta página.

import * as vault from '../lib/vault.js';
import { newImport, addToImport, batchStatus } from '../lib/importer.js';
import { decodeQrFromRegion } from '../lib/qr.js';
import { $, t } from '../ui/dom.js';

const MIN_SIZE = 8;

const img = $('#shot');
const stage = $('#stage');
const selection = $('#selection');

let shot = null;
let key = null;
let start = null;
let busy = false;

function setStatus(text, kind = '') {
  const s = $('#status');
  s.textContent = text;
  s.className = kind;
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

async function init() {
  const { areaShot } = await chrome.storage.session.get('areaShot');
  await chrome.storage.session.remove('areaShot'); // la captura puede contener secretos
  if (!areaShot) {
    setStatus(t('select.noShot'), 'err');
    return;
  }
  key = await vault.getSessionKey();
  if (!key) {
    setStatus(t('select.locked'), 'err');
    return;
  }
  shot = areaShot;
  img.src = shot.dataUrl;
  await img.decode();
  img.style.width = `${img.naturalWidth / (shot.dpr || 1)}px`; // mismo tamaño que en la pestaña
  stage.hidden = false;
  setStatus(t('select.drag'));
}

function pointFromEvent(e) {
  const r = img.getBoundingClientRect();
  return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height) };
}

function rectFrom(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function drawRect({ x, y, w, h }) {
  Object.assign(selection.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  selection.hidden = false;
}

stage.addEventListener('pointerdown', (e) => {
  if (busy || e.button !== 0) return;
  e.preventDefault();
  stage.setPointerCapture(e.pointerId);
  start = pointFromEvent(e);
  drawRect(rectFrom(start, start));
});

stage.addEventListener('pointermove', (e) => {
  if (start) drawRect(rectFrom(start, pointFromEvent(e)));
});

stage.addEventListener('pointerup', (e) => {
  if (!start) return;
  const rect = rectFrom(start, pointFromEvent(e));
  start = null;
  if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) {
    selection.hidden = true;
    return;
  }
  scan(rect);
});

async function scan(rect) {
  busy = true;
  stage.classList.add('busy');
  try {
    const sx = img.naturalWidth / img.clientWidth;
    const sy = img.naturalHeight / img.clientHeight;
    const text = await decodeQrFromRegion(img, rect.x * sx, rect.y * sy, rect.w * sx, rect.h * sy);
    if (!text) {
      setStatus(t('select.notFound'), 'err');
      return;
    }

    const accounts = await vault.loadAccounts(key);
    const imp = (await vault.loadPendingImport(key)) ?? newImport();
    const { added, repeated, batch } = addToImport(imp, text, accounts);
    await vault.savePendingImport(key, imp);

    const multi = batch && batch.size > 1;
    let msg;
    if (repeated) msg = t('select.qrRepeated', { i: batch.index + 1, n: batch.size });
    else msg = `${t('common.accountsRead', { n: added })}${multi ? t('scan.fromQr', { i: batch.index + 1, n: batch.size }) : ''}.`;
    const missing = batchStatus(imp).some((b) => b.missing.length > 0);
    setStatus(`${msg} ${t(missing ? 'select.nextTab' : 'select.returning')}`, 'ok');
    setTimeout(() => goBack(true), 1400);
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    busy = false;
    stage.classList.remove('busy');
  }
}

/** Vuelve a la pestaña original, abre el popup si se puede y cierra esta pestaña. */
async function goBack(openPopup) {
  const current = await chrome.tabs.getCurrent();
  if (shot?.tabId != null) await chrome.tabs.update(shot.tabId, { active: true }).catch(() => {});
  if (openPopup) {
    try {
      await chrome.action.openPopup(); // Chrome 127+; si falla, el usuario abre la extensión a mano
    } catch {}
  }
  if (current?.id != null) chrome.tabs.remove(current.id);
}

$('#btn-cancel').addEventListener('click', () => goBack(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') goBack(false);
});

init().catch((err) => {
  console.error(err);
  setStatus(t('common.errorWith', { msg: err.message }), 'err');
});
