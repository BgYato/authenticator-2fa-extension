import * as vault from '../lib/vault.js';
import { generateCode, secondsRemaining } from '../lib/totp.js';
import { formatCode } from '../lib/accounts.js';
import { hostOf, matchAccounts, baseDomain, shouldOfferSite, siteCheck } from '../lib/sites.js';
import { fillInTab } from '../lib/autofill.js';
import { $, el, toast, t } from '../ui/dom.js';
import { state, onShow, persist } from './ui.js';
import { openEdit } from './edit.js';

/** Pestaña activa: con activeTab, su URL solo está disponible tras pulsar el icono o el atajo. */
export async function loadSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.site = { tabId: tab?.id ?? null, host: hostOf(tab?.url) };
  } catch {
    state.site = { tabId: null, host: null };
  }
}

function renderList() {
  const list = $('#account-list');
  const query = $('#search').value.trim().toLowerCase();
  list.replaceChildren();
  state.rows.clear();
  $('#site-offer').hidden = true;
  resolveWarning?.(null);
  $('#site-chip').textContent = state.site.host || '';
  $('#site-chip').hidden = !state.site.host;

  const hasAccounts = state.accounts.length > 0;
  $('#empty').hidden = hasAccounts;
  $('#search').hidden = !hasAccounts;

  const visible = state.accounts.filter((a) =>
    !query || [a.issuer, a.account, ...(a.domains || [])].join(' ').toLowerCase().includes(query),
  );
  // Las cuentas del sitio abierto (que se ve en la cabecera) van primero, y Enter usa la primera.
  const suggested = matchAccounts(visible, state.site.host);
  if (suggested.length) {
    for (const acc of suggested) list.append(renderRow(acc));
    if (suggested.length < visible.length) list.append(el('li', { class: 'group' }, t('main.others')));
  }
  for (const acc of visible) if (!suggested.includes(acc)) list.append(renderRow(acc));
  select(0);
  tick();
}
onShow('main', renderList);

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Tono estable por nombre, para que cada servicio tenga siempre el mismo color. */
function hueOf(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function checkIcon() {
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'check-icon' }, svg('path', { d: 'M20 6 9 17l-5-5' }));
}

function renderRow(acc) {
  const name = acc.issuer || acc.account || t('common.unnamed');
  const avatar = el('span', { class: 'avatar', 'aria-hidden': 'true', style: `--h: ${hueOf(name.toLowerCase())}` },
    [...name][0].toUpperCase());
  const code = el('div', { class: 'code' }, '—');
  const done = el('div', { class: 'done', hidden: true });
  const row = { acc, code, done };
  if (acc.type === 'totp') row.next = el('div', { class: 'next' });

  const main = el(
    'button',
    { class: 'main', title: t('main.useCode'), onclick: () => useCode(acc) },
    avatar,
    el('div', { class: 'text' },
      el('div', { class: 'label' },
        el('span', { class: 'issuer' }, name),
        acc.issuer && acc.account ? el('span', { class: 'name' }, acc.account) : null,
      ),
      // El siguiente código va en la misma línea para que las filas no cambien de alto.
      el('div', { class: 'code-line' }, code, row.next),
      done,
    ),
  );

  let side;
  if (acc.type === 'totp') {
    // Anillo de cuenta atrás con los segundos dentro.
    row.prog = svg('circle', { class: 'prog', cx: 11, cy: 11, r: RING_R, 'stroke-dasharray': RING_C });
    row.secs = el('span');
    side = row.ring = el('span', { class: 'ring' },
      svg('svg', { viewBox: '0 0 22 22', 'aria-hidden': 'true' },
        svg('circle', { class: 'track', cx: 11, cy: 11, r: RING_R }), row.prog),
      row.secs);
  } else {
    side = el('button', { class: 'link', onclick: () => nextHotp(acc) }, t('main.next'));
  }
  const edit = el('button', {
    class: 'more',
    title: t('main.edit'),
    'aria-label': `${t('main.edit')}: ${name}`,
    onclick: () => openEdit(acc.id),
  }, '⋯');

  row.li = el('li', { class: 'account' }, main, el('div', { class: 'side' }, side, edit));
  state.rows.set(acc.id, row);
  return row.li;
}

/** Confirma en la propia fila que el código se ha rellenado o copiado. */
function flashRow(acc, message) {
  const row = state.rows.get(acc.id);
  if (!row) return;
  row.done.replaceChildren(checkIcon(), message);
  const showDone = (on) => {
    row.done.hidden = !on;
    row.code.parentElement.hidden = on;
  };
  showDone(true);
  clearTimeout(row.doneTimer);
  row.doneTimer = setTimeout(() => showDone(false), 1800);
}

export function tick() {
  if (state.view !== 'main') return;
  const now = Date.now();
  for (const [id, row] of state.rows) {
    const { acc } = row;
    const cached = state.codes.get(id);
    if (acc.type === 'hotp') {
      if (cached?.code) row.code.textContent = formatCode(cached.code);
      continue;
    }
    const counter = Math.floor(now / 1000 / acc.period);
    if (!cached || cached.counter !== counter) {
      state.codes.set(id, { counter, code: null });
      generateCode(acc, now)
        .then((code) => {
          state.codes.set(id, { counter, code });
          row.code.textContent = formatCode(code);
        })
        .catch((err) => {
          row.code.textContent = t('common.error');
          row.code.title = err.message;
        });
    } else if (cached.code) {
      row.code.textContent = formatCode(cached.code);
    }
    const remaining = secondsRemaining(acc.period, now);
    const expiring = remaining <= 5;
    row.secs.textContent = Math.ceil(remaining);
    row.ring.title = t('main.secondsLeft', { n: Math.ceil(remaining) });
    row.prog.style.strokeDashoffset = RING_C * (1 - remaining / acc.period);
    row.li.classList.toggle('expiring', expiring);
    showNextCode(row, counter, expiring, now);
  }
  if (now - state.lastTouch > 30_000) {
    state.lastTouch = now;
    vault.touch();
  }
}

/** En los últimos segundos se muestra el código siguiente, para no tener que esperarlo. */
function showNextCode(row, counter, expiring, now) {
  if (!expiring) {
    row.next.textContent = '';
    return;
  }
  const entry = state.codes.get(row.acc.id);
  if (entry.next) {
    row.next.textContent = t('main.nextCode', { code: formatCode(entry.next) });
  } else if (entry.next === undefined) {
    entry.next = null; // en curso
    generateCode(row.acc, (counter + 1) * row.acc.period * 1000)
      .then((code) => {
        entry.next = code;
        if (state.codes.get(row.acc.id) === entry) row.next.textContent = t('main.nextCode', { code: formatCode(code) });
      })
      .catch(() => {});
  }
}

function select(index) {
  const rows = [...state.rows.values()];
  if (!rows.length) return;
  state.selected = (index + rows.length) % rows.length;
  rows.forEach((r, i) => r.li.classList.toggle('selected', i === state.selected));
  rows[state.selected].li.scrollIntoView({ block: 'nearest' });
}

$('#search').addEventListener('input', renderList);
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    select(state.selected + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter') {
    const row = [...state.rows.values()][state.selected];
    if (row) useCode(row.acc);
  } else if (e.key === 'Escape' && e.target.value) {
    e.preventDefault(); // que Esc no cierre el popup si hay texto
    e.target.value = '';
    renderList();
  }
});

/**
 * Rellena el código en la página si hay un campo para ello; si no, lo copia.
 * Si la web no es la de la cuenta (o se le parece sin serlo), pide confirmación antes.
 */
async function useCode(acc) {
  if (acc.type === 'hotp' && !state.codes.get(acc.id)?.code) return toast(t('main.pressNext'));

  const check = siteCheck(acc, state.site.host);
  if (check === 'mismatch' || check === 'lookalike') {
    const choice = await confirmSite(acc, check);
    if (!choice) return;
    if (choice === 'remember') {
      const domain = baseDomain(state.site.host);
      acc.domains = [...new Set([...(acc.domains || []), domain])];
      acc.ignoredDomains = (acc.ignoredDomains || []).filter((d) => d !== domain);
      await persist();
      renderList();
    }
  }

  // El código se calcula ahora: mientras se confirmaba ha podido cambiar.
  const code = acc.type === 'hotp' ? state.codes.get(acc.id).code : await generateCode(acc);
  const offer = shouldOfferSite(acc, state.site.host);
  const { autofill } = await vault.getSettings();
  if (autofill && state.site.host && (await fillInTab(state.site.tabId, code))) {
    flashRow(acc, t('main.filled'));
    toast(t('main.filled'));
    if (offer) offerSite(acc, { closeAfter: true });
    else setTimeout(() => window.close(), 600);
    return;
  }
  flashRow(acc, await copyCode(code));
  if (offer) offerSite(acc, { closeAfter: false });
}

// Aviso antes de usar un código en una web que no es la de la cuenta.
let resolveWarning = null;

function confirmSite(acc, check) {
  resolveWarning?.(null);
  const name = acc.issuer || acc.account || t('common.unnamed');
  const domain = baseDomain(state.site.host);
  // El dominio sospechoso va resaltado dentro del texto traducido.
  const MARK = '\u0000';
  const text = check === 'mismatch'
    ? t('main.warnMismatch', { name, domain: MARK, expected: acc.domains.join(', ') })
    : t('main.warnLookalike', { name, domain: MARK });
  const parts = text.split(MARK);
  $('#site-warning-text').replaceChildren(
    ...parts.flatMap((part, i) => (i ? [el('b', {}, domain), part] : [part])),
  );
  $('#site-chip').classList.add('warn');
  $('#site-offer').hidden = true;
  $('#site-warning').hidden = false;
  $('#site-warning-cancel').focus(); // Enter no debe usar el código sin querer
  return new Promise((resolve) => {
    resolveWarning = (choice) => {
      resolveWarning = null;
      $('#site-warning').hidden = true;
      $('#site-chip').classList.remove('warn');
      if (!choice) $('#search').focus();
      resolve(choice);
    };
  });
}
$('#site-warning-cancel').addEventListener('click', () => resolveWarning?.(null));
$('#site-warning-once').addEventListener('click', () => resolveWarning?.('once'));
$('#site-warning-remember').addEventListener('click', () => resolveWarning?.('remember'));

async function copyCode(code) {
  await navigator.clipboard.writeText(code);
  const { clipboardClearSeconds: secs } = await vault.getSettings();
  if (secs > 0) {
    // El código va al documento offscreen para no borrar el portapapeles si ya no lo contiene.
    chrome.runtime.sendMessage({ type: 'schedule-clipboard-clear', seconds: secs, code }).catch(() => {});
  }
  const message = secs > 0 ? t('main.copiedClears', { n: secs }) : t('main.copied');
  toast(message);
  return message;
}

async function nextHotp(acc) {
  acc.counter += 1;
  await persist();
  const code = await generateCode(acc);
  state.codes.set(acc.id, { counter: acc.counter, code });
  tick();
}

function offerSite(acc, { closeAfter }) {
  const domain = baseDomain(state.site.host);
  const box = $('#site-offer');
  $('#site-offer-text').textContent = t('main.offerSite', { name: acc.issuer || acc.account, domain });
  box.hidden = false;

  const answer = async (yes) => {
    box.hidden = true;
    const list = yes ? 'domains' : 'ignoredDomains';
    acc[list] = [...new Set([...(acc[list] || []), domain])];
    if (yes) acc.ignoredDomains = (acc.ignoredDomains || []).filter((d) => d !== domain);
    await persist();
    if (yes) toast(t('main.willSuggest', { domain }));
    if (closeAfter) setTimeout(() => window.close(), yes ? 600 : 0);
    else if (yes) renderList();
  };
  $('#site-offer-yes').onclick = () => answer(true);
  $('#site-offer-no').onclick = () => answer(false);
}

// Se refresca justo al cambiar de segundo, en vez de sondear cada medio segundo.
export function startTicker() {
  (function loop() {
    if (!document.hidden) tick();
    setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
  })();
}
