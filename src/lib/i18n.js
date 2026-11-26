// Traducciones de la interfaz. Se usa un sistema propio en vez de chrome.i18n porque
// chrome.i18n solo sigue el idioma del navegador y aquí se puede elegir en Ajustes.
// Sin llamar a initI18n() el idioma es el español (así funcionan los tests en Node).

import es from '../i18n/es.js';
import en from '../i18n/en.js';
import pt from '../i18n/pt.js';
import fr from '../i18n/fr.js';

const DICTS = { es, en, pt, fr };

/** Idiomas disponibles, con su nombre en ese idioma (para el selector de Ajustes). */
export const LANGUAGES = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français' };

// Si el navegador está en un idioma sin traducción, se usa inglés.
const FALLBACK = 'en';

let locale = 'es';
const pluralRules = new Map();

export const getLocale = () => locale;

/** pref: valor guardado ('auto' o un código); uiLang: idioma del navegador (p. ej. 'pt-BR'). */
export function resolveLanguage(pref, uiLang) {
  if (Object.hasOwn(DICTS, pref)) return pref;
  const base = String(uiLang || '').toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(DICTS, base) ? base : FALLBACK;
}

export function setLocale(lang) {
  locale = Object.hasOwn(DICTS, lang) ? lang : 'es';
  if (globalThis.document) document.documentElement.lang = locale;
}

function pluralForm(n) {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
  return rules.select(Number(n));
}

/** t('main.copiedClears', { n: 30 }) → "Copiado · se borra en 30 s" */
export function t(key, params = {}) {
  let msg = DICTS[locale][key] ?? es[key] ?? key;
  if (typeof msg === 'object') msg = msg[pluralForm(params.n)] ?? msg.other;
  return msg.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/** Lee el idioma elegido en Ajustes ('auto' = el del navegador) y lo aplica. */
export async function initI18n() {
  let pref = 'auto';
  try {
    const { settings } = await chrome.storage.local.get('settings');
    pref = settings?.language ?? 'auto';
  } catch {}
  const uiLang = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language;
  setLocale(resolveLanguage(pref, uiLang));
}

const ATTRS = [
  ['placeholder', 'i18nPlaceholder', 'data-i18n-placeholder'],
  ['title', 'i18nTitle', 'data-i18n-title'],
  ['alt', 'i18nAlt', 'data-i18n-alt'],
  ['aria-label', 'i18nLabel', 'data-i18n-label'], // botones que solo llevan un icono
];

/** Traduce el HTML estático: data-i18n (texto), data-i18n-placeholder, -title, -alt y -label (aria-label). */
export function applyI18n(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const [attr, prop, sel] of ATTRS) {
    for (const node of root.querySelectorAll(`[${sel}]`)) node.setAttribute(attr, t(node.dataset[prop]));
  }
}
