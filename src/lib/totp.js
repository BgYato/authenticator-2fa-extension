// Generación de códigos HOTP (RFC 4226) y TOTP (RFC 6238) con Web Crypto.

import { base32Decode } from './base32.js';
import { t } from './i18n.js';

const HASHES = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

function importHmacKey(secretBytes, algorithm) {
  const hash = HASHES[algorithm];
  if (!hash) throw new Error(t('err.unsupportedAlgorithm', { value: algorithm }));
  return crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash }, false, ['sign']);
}

/** secret: bytes de la clave o una CryptoKey HMAC ya importada. */
export async function hotp(secret, counter, { algorithm = 'SHA1', digits = 6 } = {}) {
  const key = secret instanceof CryptoKey ? secret : await importHmacKey(secret, algorithm);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    (sig[offset + 1] << 16) |
    (sig[offset + 2] << 8) |
    sig[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(secretBytes, { period = 30, timestamp = Date.now(), ...opts } = {}) {
  return hotp(secretBytes, Math.floor(timestamp / 1000 / period), opts);
}

/** Segundos (con decimales) que le quedan al código TOTP actual. */
export function secondsRemaining(period = 30, timestamp = Date.now()) {
  return period - ((timestamp / 1000) % period);
}

// Las claves HMAC se importan una vez por cuenta (no extraíbles) y se reutilizan.
const keyCache = new Map();

function cachedKey(account) {
  const id = `${account.algorithm}:${account.secret}`;
  let key = keyCache.get(id);
  if (!key) {
    key = importHmacKey(base32Decode(account.secret), account.algorithm);
    key.catch(() => keyCache.delete(id));
    keyCache.set(id, key);
  }
  return key;
}

export function clearKeyCache() {
  keyCache.clear();
}

export async function generateCode(account, timestamp = Date.now()) {
  const secret = await cachedKey(account);
  const opts = { algorithm: account.algorithm, digits: account.digits };
  if (account.type === 'hotp') return hotp(secret, account.counter, opts);
  return totp(secret, { ...opts, period: account.period, timestamp });
}
