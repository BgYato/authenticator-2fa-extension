import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newImport, addToImport, refreshDuplicates, selectedAccounts, batchStatus, describeBatches } from '../src/lib/importer.js';
import { createAccount } from '../src/lib/accounts.js';

const uri = (issuer, secret) => `otpauth://totp/${issuer}:user?secret=${secret}&issuer=${issuer}`;

test('acumula cuentas y evita duplicados dentro de la importación', () => {
  const imp = newImport();
  assert.equal(addToImport(imp, uri('A', 'JBSWY3DPEHPK3PXP'), []).added, 1);
  assert.equal(addToImport(imp, uri('A', 'JBSWY3DPEHPK3PXP'), []).added, 0);
  assert.equal(addToImport(imp, uri('B', 'KRSXG5CTMVRXEZLU'), []).added, 1);
  assert.equal(selectedAccounts(imp).length, 2);
});

test('marca como existentes las cuentas que ya están en la bóveda', () => {
  const existing = [createAccount({ issuer: 'A', account: 'user', secret: 'JBSWY3DPEHPK3PXP' })];
  const imp = newImport();
  addToImport(imp, uri('A', 'JBSWY3DPEHPK3PXP'), existing);
  assert.equal(imp.items[0].duplicate, true);
  assert.equal(selectedAccounts(imp).length, 0);
  refreshDuplicates(imp, []);
  assert.equal(imp.items[0].duplicate, false);
});

test('las cuentas con error no guardan el secreto', () => {
  const imp = newImport();
  addToImport(imp, 'otpauth://totp/X:y?secret=JBSWY3DPEHPK3PXP&algorithm=MD5', []);
  assert.match(imp.items[0].error, /MD5/);
  assert.equal(imp.items[0].acc.secret, undefined);
});

test('estado de lotes', () => {
  const imp = { items: [], batches: { 7: { size: 3, scanned: [2, 0] } } };
  assert.deepEqual(batchStatus(imp), [{ size: 3, done: [1, 3], missing: [2] }]);
  assert.match(describeBatches(imp, 'sigue'), /Faltan: 2\. sigue/);
  imp.batches[7].scanned.push(1);
  assert.match(describeBatches(imp, ''), /Has leído los 3 QR/);
});

test('rechaza textos que no son otpauth', () => {
  assert.throws(() => addToImport(newImport(), 'https://example.com', []), /otpauth/);
  assert.throws(() => addToImport(newImport(), '', []), /No se encontró/);
});
