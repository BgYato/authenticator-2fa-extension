// Codificación Base32 (RFC 4648), usada por las claves secretas TOTP/HOTP.

import { t } from './i18n.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=-]/g, '');
  const out = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(t('err.base32Char', { char }));
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
