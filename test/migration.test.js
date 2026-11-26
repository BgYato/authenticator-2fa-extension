import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMigrationUri, isMigrationUri } from '../src/lib/migration.js';
import { parseOtpauthUri, buildOtpauthUri } from '../src/lib/otpauth.js';
import { createAccount, isSameAccount, formatCode } from '../src/lib/accounts.js';

// --- mini codificador protobuf para generar QR de exportación de prueba ---
const varint = (n) => {
  const out = [];
  let v = BigInt.asUintN(64, BigInt(n));
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return out;
};
const fVarint = (field, n) => [...varint((field << 3) | 0), ...varint(n)];
const fBytes = (field, bytes) => [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes];
const str = (s) => [...new TextEncoder().encode(s)];

function otpParams({ secret, name, issuer, algorithm = 1, digits = 1, type = 2, counter = 0 }) {
  return [
    ...fBytes(1, secret), ...fBytes(2, str(name)), ...fBytes(3, str(issuer)),
    ...fVarint(4, algorithm), ...fVarint(5, digits), ...fVarint(6, type), ...fVarint(7, counter),
  ];
}

function migrationUri(params, { batchSize = 1, batchIndex = 0 } = {}) {
  const bytes = [
    ...params.flatMap((p) => fBytes(1, otpParams(p))),
    ...fVarint(2, 1), ...fVarint(3, batchSize), ...fVarint(4, batchIndex), ...fVarint(5, -12345),
  ];
  const b64 = Buffer.from(bytes).toString('base64');
  return `otpauth-migration://offline?data=${encodeURIComponent(b64)}`;
}

const secret = [...new TextEncoder().encode('12345678901234567890')];

test('decodifica un QR de exportación de Google Authenticator', () => {
  const uri = migrationUri([
    { secret, name: 'GitHub:dev@example.com', issuer: 'GitHub' },
    { secret, name: 'user@gmail.com', issuer: 'Google', algorithm: 2, digits: 2 },
    { secret, name: 'Banco:cliente', issuer: '', type: 1, counter: 7 },
  ], { batchSize: 3, batchIndex: 1 });

  assert.ok(isMigrationUri(uri));
  const { accounts, batch } = parseMigrationUri(uri);
  assert.deepEqual(batch, { size: 3, index: 1, id: -12345 });
  assert.equal(accounts.length, 3);

  assert.deepEqual(accounts[0], {
    type: 'totp', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', issuer: 'GitHub',
    account: 'dev@example.com', algorithm: 'SHA1', digits: 6, period: 30, counter: 0,
  });
  assert.equal(accounts[1].algorithm, 'SHA256');
  assert.equal(accounts[1].digits, 8);
  assert.equal(accounts[1].account, 'user@gmail.com');
  assert.equal(accounts[2].type, 'hotp');
  assert.equal(accounts[2].issuer, 'Banco');
  assert.equal(accounts[2].account, 'cliente');
  assert.equal(accounts[2].counter, 7);
});

test('acepta base64 sin codificar en la URL (con + y /)', () => {
  const uri = migrationUri([{ secret: [0xfb, 0xff, 0xfe, 0xfb, 0xef], name: 'a', issuer: 'b' }]);
  const raw = decodeURIComponent(uri);
  assert.match(raw, /[+/]/);
  assert.equal(parseMigrationUri(raw).accounts[0].secret, parseMigrationUri(uri).accounts[0].secret);
});

test('MD5 se marca como no soportado al crear la cuenta', () => {
  const { accounts } = parseMigrationUri(migrationUri([{ secret, name: 'x', issuer: 'y', algorithm: 4 }]));
  assert.throws(() => createAccount(accounts[0]), /MD5/);
});

test('datos corruptos producen un error legible', () => {
  assert.throws(() => parseMigrationUri('otpauth-migration://offline?data=CgVoaQ'), /No se pudo decodificar/);
  assert.throws(() => parseMigrationUri('otpauth-migration://offline'), /data/);
});

test('otpauth:// ida y vuelta', () => {
  const raw = parseOtpauthUri('otpauth://totp/ACME%20Co:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&digits=8&period=60&algorithm=SHA256');
  const acc = createAccount(raw);
  assert.equal(acc.issuer, 'ACME Co');
  assert.equal(acc.account, 'john@example.com');
  assert.equal(acc.digits, 8);
  assert.equal(acc.period, 60);
  assert.equal(acc.algorithm, 'SHA256');
  const again = createAccount(parseOtpauthUri(buildOtpauthUri(acc)));
  assert.ok(isSameAccount(acc, again));
  assert.equal(again.period, 60);
});

test('formatCode', () => {
  assert.equal(formatCode('123456'), '123 456');
  assert.equal(formatCode('12345678'), '1234 5678');
});
