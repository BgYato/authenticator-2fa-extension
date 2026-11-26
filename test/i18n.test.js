import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLocale, getLocale, resolveLanguage, LANGUAGES } from '../src/lib/i18n.js';
import es from '../src/i18n/es.js';

const ROOT = new URL('..', import.meta.url).pathname;
const placeholders = (v) =>
  [...new Set([v].flat().flatMap((s) => (typeof s === 'object' ? Object.values(s) : [s]))
    .flatMap((s) => s.match(/\{\w+\}/g) ?? []))].sort();

for (const code of Object.keys(LANGUAGES)) {
  test(`${code}: mismas claves, marcadores y plurales que es`, async () => {
    const dict = (await import(`../src/i18n/${code}.js`)).default;
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(es).sort());
    for (const [key, value] of Object.entries(es)) {
      assert.deepEqual(placeholders(dict[key]), placeholders(value), `marcadores de ${key}`);
      assert.equal(typeof dict[key], typeof value, `tipo de ${key}`);
      if (typeof value === 'object') assert.ok(dict[key].one && dict[key].other, `plural de ${key}`);
    }
  });
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'vendor' || name === 'i18n') return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test('todas las claves usadas en HTML y JS existen', () => {
  const used = new Set();
  for (const file of walk(join(ROOT, 'src'))) {
    if (!/\.(js|html)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/data-i18n(?:-\w+)?="([\w.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/'((?:scan|select)\.\w+)'/g)) used.add(m[1]); // t(cond ? 'a' : 'b')
  }
  assert.ok(used.size > 100);
  for (const key of used) assert.ok(key in es, `falta la clave ${key}`);
});

test('resolveLanguage: preferencia, idioma del navegador y respaldo', () => {
  assert.equal(resolveLanguage('fr', 'es-ES'), 'fr');
  assert.equal(resolveLanguage('auto', 'pt-BR'), 'pt');
  assert.equal(resolveLanguage('auto', 'es_419'), 'es');
  assert.equal(resolveLanguage('auto', 'de-DE'), 'en');
  assert.equal(resolveLanguage(undefined, undefined), 'en');
  assert.equal(resolveLanguage('toString', 'fr'), 'fr');
});

test('t: interpolación, plurales y respaldo', () => {
  assert.equal(getLocale(), 'es'); // sin initI18n
  assert.equal(t('main.copiedClears', { n: 30 }), 'Copiado · se borra en 30 s');
  assert.equal(t('common.accountsRead', { n: 1 }), '1 cuenta leída');
  assert.equal(t('common.accountsRead', { n: 3 }), '3 cuentas leídas');
  assert.equal(t('no.existe'), 'no.existe');
  try {
    setLocale('en');
    assert.equal(t('common.accountsImported', { n: 1 }), '1 account imported');
    assert.equal(t('common.accountsImported', { n: 2 }), '2 accounts imported');
    assert.equal(t('main.offerSite', { name: 'GitHub', domain: 'github.com' }), 'Suggest “GitHub” on github.com?');
    setLocale('fr');
    assert.equal(t('common.accountsRead', { n: 0 }), '0 compte lu');
    assert.equal(t('common.accountsRead', { n: 1_000_000 }), '1000000 comptes lus'); // forma "many"
    setLocale('xx');
    assert.equal(getLocale(), 'es');
  } finally {
    setLocale('es');
  }
});
