// Lectura de códigos QR desde imágenes usando jsQR (src/vendor/jsQR.js).
// La librería pesa ~250 KB, así que se carga solo cuando hace falta escanear.

import { t } from './i18n.js';

let loading = null;

export function loadJsQR() {
  if (typeof globalThis.jsQR === 'function') return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/vendor/jsQR.js');
    script.onload = resolve;
    script.onerror = () => {
      loading = null;
      reject(new Error(t('err.qrLoader')));
    };
    document.head.append(script);
  });
  return loading;
}

// Se prueban varios tamaños: las capturas de móvil son grandes y jsQR
// a veces acierta mejor tras reducir la imagen.
const MAX_SIDES = [2000, 1200, 800];

function scanAt(source, width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h); // fondo blanco para PNG con transparencia
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return globalThis.jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
}

/** Devuelve el texto del QR encontrado en la imagen, o null si no hay ninguno. */
export async function decodeQrFromBlob(blob) {
  await loadJsQR();
  const bitmap = await createImageBitmap(blob);
  try {
    for (const side of MAX_SIDES) {
      const result = scanAt(bitmap, bitmap.width, bitmap.height, side);
      if (result?.data) return result.data;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export async function decodeQrFromDataUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return decodeQrFromBlob(blob);
}

/**
 * Lee un QR dentro de una zona (sx, sy, sw, sh) de una imagen.
 * Añade un margen blanco (jsQR necesita la "zona de silencio" alrededor del QR)
 * y prueba a varios tamaños, ampliando los recortes pequeños.
 */
export async function decodeQrFromRegion(source, sx, sy, sw, sh) {
  await loadJsQR();
  const side = Math.max(sw, sh);
  for (const target of [side, 800, 1200, 500]) {
    const scale = target / side;
    const w = Math.round(sw * scale);
    const h = Math.round(sh * scale);
    const pad = Math.round(Math.max(w, h) * 0.1);
    const canvas = new OffscreenCanvas(w + pad * 2, h + pad * 2);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, pad, pad, w, h);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = globalThis.jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    if (result?.data) return result.data;
  }
  return null;
}
