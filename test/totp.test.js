import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotp, totp } from '../src/lib/totp.js';
import { base32Decode, base32Encode } from '../src/lib/base32.js';

const ascii = (s) => new TextEncoder().encode(s);

test('base32 ida y vuelta', () => {
  const bytes = ascii('12345678901234567890');
  const encoded = base32Encode(bytes);
  assert.equal(encoded, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode(encoded.toLowerCase().replace(/(.{4})/g, '$1 ')), bytes);
});

test('base32 rechaza caracteres inválidos', () => {
  assert.throws(() => base32Decode('ABC1'), /no válido/);
});

test('HOTP RFC 4226', async () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  const secret = ascii('12345678901234567890');
  for (let i = 0; i < expected.length; i++) assert.equal(await hotp(secret, i), expected[i]);
});

test('TOTP RFC 6238 (SHA1/SHA256/SHA512, 8 dígitos)', async () => {
  const secrets = {
    SHA1: ascii('12345678901234567890'),
    SHA256: ascii('12345678901234567890123456789012'),
    SHA512: ascii('1234567890123456789012345678901234567890123456789012345678901234'),
  };
  const vectors = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [t, sha1, sha256, sha512] of vectors) {
    const ts = t * 1000;
    assert.equal(await totp(secrets.SHA1, { timestamp: ts, digits: 8, algorithm: 'SHA1' }), sha1);
    assert.equal(await totp(secrets.SHA256, { timestamp: ts, digits: 8, algorithm: 'SHA256' }), sha256);
    assert.equal(await totp(secrets.SHA512, { timestamp: ts, digits: 8, algorithm: 'SHA512' }), sha512);
  }
});
