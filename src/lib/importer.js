// Una importación en curso acumula cuentas leídas de uno o varios QR:
//   { items: [{ acc, duplicate, error, selected }], batches: { [id]: { size, scanned: [] } } }

import { isMigrationUri, parseMigrationUri } from './migration.js';
import { parseOtpauthUri } from './otpauth.js';
import { createAccount, isSameAccount } from './accounts.js';
import { t } from './i18n.js';

export function newImport() {
  return { items: [], batches: {} };
}

function parseOtpText(text) {
  if (!text) throw new Error(t('import.noQr'));
  const value = text.trim();
  if (isMigrationUri(value)) {
    const { accounts, batch } = parseMigrationUri(value);
    return { raw: accounts, batch };
  }
  if (/^otpauth:\/\//i.test(value)) return { raw: [parseOtpauthUri(value)], batch: null };
  throw new Error(t('import.notOtp'));
}

/**
 * Añade a la importación las cuentas del texto de un QR/enlace.
 * Devuelve { added, repeated, batch } (repeated = ese QR del lote ya se había leído).
 */
export function addToImport(imp, text, existingAccounts) {
  const { raw, batch } = parseOtpText(text);
  if (raw.length === 0) throw new Error(t('import.noAccounts'));

  let repeated = false;
  if (batch && batch.size > 1) {
    const b = (imp.batches[String(batch.id)] ??= { size: batch.size, scanned: [] });
    repeated = b.scanned.includes(batch.index);
    if (!repeated) b.scanned.push(batch.index);
  }

  let added = 0;
  for (const r of raw) {
    let item;
    try {
      const acc = createAccount(r);
      if (imp.items.some((i) => !i.error && isSameAccount(i.acc, acc))) continue;
      const duplicate = existingAccounts.some((a) => isSameAccount(a, acc));
      item = { acc, duplicate, error: null, selected: !duplicate };
    } catch (err) {
      const label = { issuer: r.issuer || '', account: r.account || '' }; // sin el secreto
      if (imp.items.some((i) => i.error && i.acc.issuer === label.issuer && i.acc.account === label.account)) continue;
      item = { acc: label, duplicate: false, error: err.message, selected: false };
    }
    imp.items.push(item);
    added++;
  }
  return { added, repeated, batch };
}

export function refreshDuplicates(imp, existingAccounts) {
  for (const item of imp?.items ?? []) {
    if (item.error) continue;
    const duplicate = existingAccounts.some((a) => isSameAccount(a, item.acc));
    if (duplicate && !item.duplicate) item.selected = false;
    item.duplicate = duplicate;
  }
}

export function selectedAccounts(imp) {
  return (imp?.items ?? []).filter((i) => i.selected && !i.error && !i.duplicate).map((i) => i.acc);
}

/** Estado de los lotes: [{ size, done: [1,3], missing: [2] }] (números desde 1). */
export function batchStatus(imp) {
  return Object.values(imp?.batches ?? {}).map(({ size, scanned }) => {
    const done = [...scanned].sort((a, b) => a - b).map((i) => i + 1);
    const missing = Array.from({ length: size }, (_, i) => i + 1).filter((n) => !done.includes(n));
    return { size, done, missing };
  });
}

export function describeBatches(imp, nextHint) {
  return batchStatus(imp)
    .map(({ size, done, missing }) =>
      missing.length
        ? t('import.batchProgress', { done: done.join(', '), size, missing: missing.join(', '), hint: nextHint })
        : t('import.batchComplete', { size }),
    )
    .join(' ');
}
