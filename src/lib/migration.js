// Decodifica el QR de exportación de Google Authenticator:
//   otpauth-migration://offline?data=<base64 de un protobuf MigrationPayload>
//
// message MigrationPayload {
//   repeated OtpParameters otp_parameters = 1;
//   int32 version = 2; int32 batch_size = 3; int32 batch_index = 4; int32 batch_id = 5;
// }
// message OtpParameters {
//   bytes secret = 1; string name = 2; string issuer = 3;
//   Algorithm algorithm = 4;   // 0 UNSPECIFIED, 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5
//   DigitCount digits = 5;     // 0 UNSPECIFIED, 1 SIX, 2 EIGHT
//   OtpType type = 6;          // 0 UNSPECIFIED, 1 HOTP, 2 TOTP
//   int64 counter = 7;
// }

import { base32Encode } from './base32.js';
import { t } from './i18n.js';

const ALGORITHMS = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512', 4: 'MD5' };
const DIGITS = { 0: 6, 1: 6, 2: 8 };

class ProtoReader {
  constructor(bytes) {
    this.buf = bytes;
    this.pos = 0;
  }

  get done() {
    return this.pos >= this.buf.length;
  }

  varint() {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (this.pos >= this.buf.length) throw new Error(t('err.protoTruncated'));
      const byte = this.buf[this.pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
      if (shift > 63n) throw new Error(t('err.varintTooLong'));
    }
  }

  bytes() {
    const len = Number(this.varint());
    if (this.pos + len > this.buf.length) throw new Error(t('err.protoTruncated'));
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  tag() {
    const tag = Number(this.varint());
    return { field: tag >>> 3, wire: tag & 7 };
  }

  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new Error(t('err.protoWire', { value: wire }));
  }
}

const utf8 = new TextDecoder();

function decodeOtpParameters(bytes) {
  const r = new ProtoReader(bytes);
  const p = { secret: new Uint8Array(), name: '', issuer: '', algorithm: 0, digits: 0, type: 0, counter: 0 };
  while (!r.done) {
    const { field, wire } = r.tag();
    if (field === 1 && wire === 2) p.secret = r.bytes();
    else if (field === 2 && wire === 2) p.name = utf8.decode(r.bytes());
    else if (field === 3 && wire === 2) p.issuer = utf8.decode(r.bytes());
    else if (field === 4 && wire === 0) p.algorithm = Number(r.varint());
    else if (field === 5 && wire === 0) p.digits = Number(r.varint());
    else if (field === 6 && wire === 0) p.type = Number(r.varint());
    else if (field === 7 && wire === 0) p.counter = Number(r.varint());
    else r.skip(wire);
  }
  return p;
}

export function decodeMigrationPayload(bytes) {
  const r = new ProtoReader(bytes);
  const payload = { otpParameters: [], version: 0, batchSize: 1, batchIndex: 0, batchId: 0 };
  while (!r.done) {
    const { field, wire } = r.tag();
    if (field === 1 && wire === 2) payload.otpParameters.push(decodeOtpParameters(r.bytes()));
    else if (field === 2 && wire === 0) payload.version = Number(r.varint());
    else if (field === 3 && wire === 0) payload.batchSize = Number(r.varint());
    else if (field === 4 && wire === 0) payload.batchIndex = Number(r.varint());
    else if (field === 5 && wire === 0) payload.batchId = Number(BigInt.asIntN(32, r.varint()));
    else r.skip(wire);
  }
  return payload;
}

function base64ToBytes(b64) {
  let s = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Separa "Emisor:cuenta" del campo name, usando issuer si viene informado. */
function splitName(name, issuer) {
  const idx = name.indexOf(':');
  if (idx === -1) return { issuer, account: name.trim() };
  const prefix = name.slice(0, idx).trim();
  const rest = name.slice(idx + 1).trim();
  if (!issuer) return { issuer: prefix, account: rest };
  if (prefix.toLowerCase() === issuer.toLowerCase()) return { issuer, account: rest };
  return { issuer, account: name.trim() };
}

export function isMigrationUri(text) {
  return /^otpauth-migration:\/\//i.test(String(text).trim());
}

/**
 * Convierte un enlace otpauth-migration:// en cuentas "crudas"
 * (se validan/normalizan después con createAccount).
 */
export function parseMigrationUri(uri) {
  const text = String(uri).trim();
  if (!isMigrationUri(text)) throw new Error(t('err.notMigration'));

  // Se extrae a mano: URLSearchParams convertiría '+' en espacio y rompería el base64.
  const match = text.match(/[?&]data=([^&#]+)/);
  if (!match) throw new Error(t('err.migrationNoData'));

  let payload;
  try {
    payload = decodeMigrationPayload(base64ToBytes(decodeURIComponent(match[1])));
  } catch (err) {
    throw new Error(t('err.migrationDecode', { msg: err.message }));
  }

  const accounts = payload.otpParameters.map((p) => ({
    type: p.type === 1 ? 'hotp' : 'totp',
    secret: base32Encode(p.secret),
    ...splitName(p.name, p.issuer.trim()),
    algorithm: ALGORITHMS[p.algorithm] ?? `desconocido (${p.algorithm})`,
    digits: DIGITS[p.digits] ?? 6,
    period: 30,
    counter: p.counter,
  }));

  return {
    accounts,
    batch: { size: payload.batchSize || 1, index: payload.batchIndex || 0, id: payload.batchId },
  };
}
