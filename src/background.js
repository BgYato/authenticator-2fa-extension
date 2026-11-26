// Service worker: aplica el bloqueo aunque el popup no se abra.
//  - Bloquea la bóveda en cuanto se bloquea la pantalla del equipo.
//  - Comprueba cada minuto el tiempo de inactividad y borra la clave de la sesión al vencer.
//  - Vacía el portapapeles unos segundos después de copiar un código (vía documento offscreen),
//    salvo que ya contenga otra cosa (si se concedió el permiso opcional clipboardRead).

import { lock, enforceAutoLock } from './lib/vault.js';

const ALARM = 'autolock';

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) chrome.alarms.create(ALARM, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) enforceAutoLock();
});

const OFFSCREEN_URL = 'src/offscreen/clipboard.html';
let creating = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['CLIPBOARD'],
      justification: 'Vaciar el portapapeles tras copiar un código 2FA',
    })
    .finally(() => (creating = null));
  await creating;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === 'schedule-clipboard-clear') {
    const delayMs = Math.min(Math.max(Number(msg.seconds) || 0, 5), 600) * 1000;
    // Con el permiso opcional clipboardRead, el documento offscreen comprueba antes de borrar
    // que el portapapeles sigue conteniendo el código (y no algo que se copió después).
    const code = typeof msg.code === 'string' ? msg.code : null;
    Promise.all([ensureOffscreen(), chrome.permissions.contains({ permissions: ['clipboardRead'] })])
      .then(([, canRead]) =>
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'clear-clipboard',
          delayMs,
          expected: canRead ? code : null,
        }),
      );
  } else if (msg?.type === 'clipboard-cleared') {
    chrome.offscreen.closeDocument().catch(() => {});
  }
});

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'locked') lock();
});

// La sesión solo es legible desde páginas de la propia extensión (nunca desde content scripts).
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

ensureAlarm();
