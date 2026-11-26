// Enlaces estándar otpauth://totp/Emisor:cuenta?secret=...&issuer=...

import { t } from './i18n.js';

export function parseOtpauthUri(uri) {
  let url;
  try {
    url = new URL(String(uri).trim());
  } catch {
    throw new Error(t('err.invalidUri'));
  }
  if (url.protocol !== 'otpauth:') throw new Error(t('err.uriPrefix'));

  const type = url.hostname.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') throw new Error(t('err.unsupportedOtpType', { value: type }));

  const params = url.searchParams;
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
  let issuer = (params.get('issuer') || '').trim();
  let account = label.trim();
  const idx = label.indexOf(':');
  if (idx !== -1) {
    account = label.slice(idx + 1).trim();
    if (!issuer) issuer = label.slice(0, idx).trim();
  }

  return {
    type,
    issuer,
    account,
    secret: params.get('secret') || '',
    algorithm: params.get('algorithm') || 'SHA1',
    digits: params.get('digits') || 6,
    period: params.get('period') || 30,
    counter: params.get('counter') || 0,
  };
}

export function buildOtpauthUri(acc) {
  const label = encodeURIComponent(acc.issuer ? `${acc.issuer}:${acc.account}` : acc.account);
  const params = new URLSearchParams({ secret: acc.secret });
  if (acc.issuer) params.set('issuer', acc.issuer);
  if (acc.algorithm !== 'SHA1') params.set('algorithm', acc.algorithm);
  if (acc.digits !== 6) params.set('digits', String(acc.digits));
  if (acc.type === 'totp' && acc.period !== 30) params.set('period', String(acc.period));
  if (acc.type === 'hotp') params.set('counter', String(acc.counter));
  return `otpauth://${acc.type}/${label}?${params}`;
}
