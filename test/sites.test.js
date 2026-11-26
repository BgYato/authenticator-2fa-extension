import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, parseDomains, siteScore, matchAccounts, baseDomain, shouldOfferSite, siteCheck } from '../src/lib/sites.js';
import { createAccount } from '../src/lib/accounts.js';

const acc = (issuer, domains) => createAccount({ secret: 'JBSWY3DPEHPK3PXP', issuer, domains });

test('hostOf solo acepta http(s)', () => {
  assert.equal(hostOf('https://www.GitHub.com/login'), 'github.com');
  assert.equal(hostOf('chrome://extensions'), null);
  assert.equal(hostOf('no es url'), null);
});

test('parseDomains normaliza la lista', () => {
  assert.deepEqual(parseDomains('https://www.GitHub.com/login, gitlab.com;  foo  github.com'), ['github.com', 'gitlab.com']);
});

test('siteScore', () => {
  assert.equal(siteScore(acc('GitHub'), 'github.com'), 2);
  assert.equal(siteScore(acc('Google'), 'accounts.google.com'), 2);
  assert.equal(siteScore(acc('Microsoft'), 'login.microsoftonline.com'), 1);
  assert.equal(siteScore(acc('Amazon Web Services'), 'signin.aws.amazon.com'), 1);
  assert.equal(siteScore(acc('GitHub'), 'gitlab.com'), 0);
  assert.equal(siteScore(acc('Co'), 'example.co'), 0);
  assert.equal(siteScore(acc('Mi banco', ['banco.example.com']), 'login.banco.example.com'), 3);
  assert.equal(siteScore(acc('GitHub'), null), 0);
});

test('matchAccounts ordena por puntuación', () => {
  const a = acc('Microsoft'), b = acc('Trabajo', ['microsoftonline.com']), c = acc('GitHub');
  assert.deepEqual(matchAccounts([a, b, c], 'login.microsoftonline.com'), [b, a]);
});

test('createAccount conserva los dominios', () => {
  assert.deepEqual(acc('X', 'https://x.com/a, y.org').domains, ['x.com', 'y.org']);
  assert.deepEqual(acc('X').domains, []);
});

test('baseDomain', () => {
  assert.equal(baseDomain('portal.banco-x.com'), 'banco-x.com');
  assert.equal(baseDomain('sucursal.bancolombia.com.co'), 'bancolombia.com.co');
  assert.equal(baseDomain('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(baseDomain('github.com'), 'github.com');
  assert.equal(baseDomain('127.0.0.1'), '127.0.0.1');
  assert.equal(baseDomain('localhost'), 'localhost');
});

test('shouldOfferSite', () => {
  const banco = createAccount({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Banco', ignoredDomains: ['otro.com'] });
  assert.equal(shouldOfferSite(banco, 'portal.mibanca.com'), true);
  assert.equal(shouldOfferSite(banco, 'portal.banco-x.com'), false); // ya coincide por nombre
  assert.equal(shouldOfferSite(banco, 'login.otro.com'), false); // rechazado antes
  assert.equal(shouldOfferSite(acc('GitHub'), 'github.com'), false); // ya coincide
  assert.equal(shouldOfferSite(banco, 'localhost'), false);
  assert.equal(shouldOfferSite(banco, null), false);
});

test('siteCheck: dominio propio de la cuenta', () => {
  assert.equal(siteCheck(acc('GitHub'), 'github.com'), 'trusted');
  assert.equal(siteCheck(acc('Google'), 'accounts.google.com'), 'trusted');
  assert.equal(siteCheck(acc('Bancolombia'), 'sucursal.bancolombia.com.co'), 'trusted');
  assert.equal(siteCheck(acc('X'), 'x.com'), 'trusted');
  assert.equal(siteCheck(acc('Mi banco', ['banco.example.com']), 'login.banco.example.com'), 'trusted');
});

test('siteCheck: webs que imitan al servicio', () => {
  for (const host of ['g1thub.com', 'github-login.com', 'github.evil.com', 'githud.com', 'secure-github.co']) {
    assert.equal(siteCheck(acc('GitHub'), host), 'lookalike', host);
  }
  assert.equal(siteCheck(acc('PayPal'), 'paypa1.com'), 'lookalike');
  assert.equal(siteCheck(acc('Microsoft'), 'rnicrosoft.com'), 'lookalike');
  assert.equal(siteCheck(acc('Bancolombia'), 'bancolombia-seguro.com'), 'lookalike');
});

test('siteCheck: con dominios asociados solo valen esos', () => {
  const gh = acc('GitHub', ['github.com']);
  assert.equal(siteCheck(gh, 'github.com'), 'trusted');
  assert.equal(siteCheck(gh, 'github.co'), 'mismatch'); // mismo nombre, otro dominio
  assert.equal(siteCheck(gh, 'gitlab.com'), 'mismatch');
});

test('siteCheck: sin relación o sin web', () => {
  assert.equal(siteCheck(acc('GitHub'), 'gitlab.com'), 'unknown');
  assert.equal(siteCheck(acc('Google'), 'youtube.com'), 'unknown');
  assert.equal(siteCheck(acc('GitHub'), null), 'unknown');
  assert.equal(siteCheck(acc(''), 'github.com'), 'unknown');
});

test('shouldOfferSite no ofrece asociar webs sospechosas', () => {
  assert.equal(shouldOfferSite(acc('GitHub'), 'github-login.com'), false);
  assert.equal(shouldOfferSite(acc('GitHub', ['github.com']), 'gitlab.com'), false);
  assert.equal(shouldOfferSite(acc('GitHub'), 'gitlab.com'), true);
});
