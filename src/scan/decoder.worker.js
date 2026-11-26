// Decodifica fotogramas de la cámara fuera del hilo principal para que el vídeo vaya fluido.
importScripts('../vendor/jsQR.js');

self.onmessage = ({ data: { id, buffer, width, height } }) => {
  const result = self.jsQR(new Uint8ClampedArray(buffer), width, height, { inversionAttempts: 'attemptBoth' });
  self.postMessage({ id, text: result?.data ?? null });
};
