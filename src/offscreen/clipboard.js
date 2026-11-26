// Documento offscreen: vacía el portapapeles pasado el tiempo indicado.
// Si recibe el código copiado (permiso opcional clipboardRead), solo lo vacía si aún lo contiene.
// Vive aparte del service worker (que Chrome puede detener), así el temporizador no se pierde.

let timer = null;

function clearClipboard() {
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', '');
    e.preventDefault();
  };
  document.addEventListener('copy', onCopy);
  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', onCopy);
  }
}

/** Texto del portapapeles, o null si no se puede leer (sin el permiso clipboardRead). */
function readClipboard() {
  const area = document.createElement('textarea');
  document.body.append(area);
  area.focus();
  try {
    return document.execCommand('paste') ? area.value : null;
  } finally {
    area.remove();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'clear-clipboard') return;
  clearTimeout(timer); // una copia nueva reinicia la cuenta
  const { expected } = msg; // el código copiado, solo si hay permiso para comprobarlo
  timer = setTimeout(() => {
    // Si no se puede leer, se borra igualmente: es más seguro que dejar el código.
    const current = expected ? readClipboard() : null;
    if (current === null || current.trim() === expected) clearClipboard();
    chrome.runtime.sendMessage({ type: 'clipboard-cleared' });
  }, msg.delayMs);
});
