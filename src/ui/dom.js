import './i18n-boot.js';
import { t } from '../lib/i18n.js';

export { t };

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

let toastTimer;
export function toast(message, ms = 1800) {
  const box = $('#toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), ms);
}

/**
 * Pinta la lista de cuentas de una importación con casillas.
 * onToggle se llama tras marcar/desmarcar una cuenta.
 */
export function renderImportList(listEl, imp, onToggle) {
  listEl.replaceChildren(
    ...imp.items.map((item) => {
      const { acc, duplicate, error } = item;
      const tag = error
        ? el('div', { class: 'tag err' }, error)
        : duplicate
          ? el('div', { class: 'tag' }, t('common.alreadyExists'))
          : null;
      const checkbox = el('input', {
        type: 'checkbox',
        checked: item.selected,
        disabled: !!error || duplicate,
        onchange: (e) => {
          item.selected = e.target.checked;
          onToggle();
        },
      });
      return el('li', {},
        el('label', {},
          checkbox,
          el('div', {},
            el('div', {}, el('strong', {}, acc.issuer || t('common.noIssuer')), ' ', acc.account || ''),
            tag,
          ),
        ),
      );
    }),
  );
}
