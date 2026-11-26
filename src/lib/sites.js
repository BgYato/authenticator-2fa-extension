/** Hostname de una URL http(s), sin "www."; null para otras páginas. */
export function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Convierte "https://www.GitHub.com/login, gitlab.com" en ["github.com", "gitlab.com"]. */
export function parseDomains(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
  const out = [];
  for (const raw of list) {
    let d = String(raw).trim().toLowerCase();
    if (!d) continue;
    d = d.replace(/^[a-z]+:\/\//, '').replace(/[/?#:].*$/, '').replace(/^www\./, '').replace(/^\.+|\.+$/g, '');
    if (/^[a-z0-9.-]+$/.test(d) && d.includes('.') && !out.includes(d)) out.push(d);
  }
  return out;
}

// Segundos niveles habituales en dominios de país (bancolombia.com.co, bbc.co.uk…).
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'gob', 'edu', 'ac', 'mil']);

/** Dominio "principal" de un host: portal.banco-x.com → banco-x.com, a.b.com.co → b.com.co. */
export function baseDomain(host) {
  if (!host || !host.includes('.') || /^[\d.]+$/.test(host)) return host;
  const parts = host.split('.');
  const keep = parts.length >= 3 && parts.at(-1).length === 2 && SECOND_LEVEL.has(parts.at(-2)) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

const normalize = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// Partes del dominio que no identifican al servicio.
const GENERIC = new Set(['com', 'net', 'org', 'co', 'io', 'app', 'dev', 'gov', 'edu', 'www',
  'login', 'accounts', 'account', 'auth', 'secure', 'signin', 'id', 'sso', 'my', 'portal']);

/**
 * Puntuación de coincidencia entre una cuenta y un host (0 = nada).
 *  3: dominio asociado a mano · 2: el emisor es una parte del dominio · 1: coincidencia parcial.
 */
export function siteScore(acc, host) {
  if (!host) return 0;
  if ((acc.domains || []).some((d) => host === d || host.endsWith(`.${d}`))) return 3;

  const issuer = normalize(acc.issuer);
  if (issuer.length < 2) return 0;
  const labels = host.split('.').slice(0, -1).map(normalize).filter((l) => l && !GENERIC.has(l));
  if (labels.includes(issuer)) return 2;
  const partial = labels.some(
    (l) => l.length >= 4 && issuer.length >= 4 && (l.startsWith(issuer) || issuer.startsWith(l)),
  );
  return partial ? 1 : 0;
}

// Sustituciones típicas de los dominios de phishing (g1thub, rnicrosoft, paypa1…).
const canon = (s) =>
  s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[1i]/g, 'l')
    .replace(/0/g, 'o').replace(/3/g, 'e').replace(/5/g, 's').replace(/4/g, 'a').replace(/7/g, 't');

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** ¿Alguna parte del host recuerda al emisor? (github-login.com, g1thub.com, github.evil.com…) */
function looksLike(issuer, host) {
  const target = canon(issuer);
  if (target.length < 4) return false;
  return host.split('.').slice(0, -1).map(normalize)
    .filter((l) => l && !GENERIC.has(l))
    .map(canon)
    .some((l) =>
      l.includes(target) ||
      (l.length >= 4 && target.includes(l)) ||
      editDistance(l, target) <= (target.length >= 8 ? 2 : 1));
}

/**
 * ¿Es seguro usar el código de esta cuenta en este host? Protege del phishing:
 *  'trusted'   es un dominio asociado a la cuenta o, si no tiene ninguno, el emisor es el
 *              nombre del dominio (github.com para «GitHub», accounts.google.com para «Google»).
 *  'mismatch'  la cuenta tiene dominios asociados y este no es ninguno de ellos.
 *  'lookalike' el host se parece al emisor sin ser su dominio (posible web falsa).
 *  'unknown'   sin relación aparente: no se puede saber (se ofrece asociar el sitio).
 */
export function siteCheck(acc, host) {
  if (!host) return 'unknown';
  if (acc.domains?.length) {
    return acc.domains.some((d) => host === d || host.endsWith(`.${d}`)) ? 'trusted' : 'mismatch';
  }
  const issuer = normalize(acc.issuer);
  if (issuer && normalize(baseDomain(host).split('.')[0]) === issuer) return 'trusted';
  return looksLike(issuer, host) ? 'lookalike' : 'unknown';
}

/** ¿Conviene preguntar si asociar la cuenta a este sitio? (sin relación y no se rechazó antes) */
export function shouldOfferSite(acc, host) {
  const base = baseDomain(host);
  if (!base || !base.includes('.') || siteCheck(acc, host) !== 'unknown') return false;
  return !(acc.ignoredDomains || []).includes(base);
}

/** Cuentas que corresponden al host, de mejor a peor coincidencia. */
export function matchAccounts(accounts, host) {
  return accounts
    .map((acc) => ({ acc, score: siteScore(acc, host) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.acc);
}
