import { base32Decode, base32Encode } from './base32.js';
import { parseDomains } from './sites.js';
import { t } from './i18n.js';

export const ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'];

export function createAccount(input) {
  const type = String(input.type || 'totp').toLowerCase();
  if (type !== 'totp' && type !== 'hotp') throw new Error(t('err.unsupportedType', { value: type }));

  const secretBytes = base32Decode(input.secret || '');
  if (secretBytes.length === 0) throw new Error(t('err.emptySecret'));

  const algorithm = String(input.algorithm || 'SHA1').toUpperCase().replace('-', '');
  if (!ALGORITHMS.includes(algorithm)) throw new Error(t('err.unsupportedAlgorithm', { value: algorithm }));

  const digits = Number(input.digits || 6);
  if (![6, 7, 8].includes(digits)) throw new Error(t('err.unsupportedDigits', { value: digits }));

  const period = Number(input.period || 30);
  if (!Number.isInteger(period) || period <= 0) throw new Error(t('err.invalidPeriod'));

  const counter = Number(input.counter || 0);
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error(t('err.invalidCounter'));

  return {
    id: input.id || crypto.randomUUID(),
    type,
    issuer: String(input.issuer || '').trim(),
    account: String(input.account || '').trim(),
    secret: base32Encode(secretBytes),
    algorithm,
    digits,
    period,
    counter,
    domains: parseDomains(input.domains),
    ignoredDomains: parseDomains(input.ignoredDomains), // sitios donde no volver a preguntar
    createdAt: input.createdAt || Date.now(),
  };
}

export function isSameAccount(a, b) {
  return (
    a.secret === b.secret &&
    a.issuer.toLowerCase() === b.issuer.toLowerCase() &&
    a.account.toLowerCase() === b.account.toLowerCase()
  );
}

export function formatCode(code) {
  if (!code) return '';
  const half = Math.floor(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}
