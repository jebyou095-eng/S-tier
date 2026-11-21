// Languages: English and Arabic (Moroccan reader, Darija food names).
// All UI text lives in lang-en.js and lang-ar.js. Arabic switches the whole app to
// right-to-left and keeps Western digits (0–9), as used in Morocco.
import { EN } from './lang-en.js';
import { AR } from './lang-ar.js';

const KEY = 'pocket-stats-lang';
const DICTS = { en: EN, ar: AR };
const listeners = new Set();

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch { /* storage blocked: follow the phone */ }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return /^ar\b/i.test(langs[0] || '') ? 'ar' : 'en';
}

let cur = initial();

export const lang = () => cur;
/** List separator for the current language. */
export const sep = () => (cur === 'ar' ? '، ' : ', ');
export const isAr = () => cur === 'ar';

/** Translate a key. {name} placeholders are filled from vars. Missing Arabic falls back to English. */
export function t(key, vars) {
  let s = DICTS[cur][key];
  if (s === undefined) s = EN[key];
  if (s === undefined) return key;
  if (typeof s === 'function') return s(vars || {});
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)) : s;
}

/** Plural-aware: uses key.one / key.two / key.few / key.many / key.other (Arabic has all of them). */
const rules = {};
export function tn(key, n, vars = {}) {
  rules[cur] ??= new Intl.PluralRules(cur === 'ar' ? 'ar' : 'en');
  const cat = rules[cur].select(n);
  const d = DICTS[cur];
  const k = d[`${key}.${cat}`] !== undefined ? `${key}.${cat}` : `${key}.other`;
  return t(k, { n: fmt(n), ...vars });
}

/** Western digits, with thousands separators, in both languages. */
const nfs = {};
export function fmt(x, digits = 0) {
  if (x === null || x === undefined || !Number.isFinite(+x)) return '—';
  nfs[digits] ??= new Intl.NumberFormat('en-US', { maximumFractionDigits: digits });
  return nfs[digits].format(x);
}

/** Dates: Moroccan Arabic month names (يناير… نونبر، دجنبر) with Western digits. */
export function dateText(d, opts) {
  return d.toLocaleDateString(cur === 'ar' ? 'ar-MA-u-nu-latn' : 'en-GB', opts);
}
export function timeText(d) {
  return d.toLocaleTimeString(cur === 'ar' ? 'ar-MA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** A food or recipe name in the current language (Arabic/Darija when we have it). */
export function nameOf(x) {
  if (!x) return '';
  return (cur === 'ar' && x.ar) || x.name || x.en || '';
}
/** The name in the other language, for a small second line (or ''). */
export function otherName(x) {
  if (!x) return '';
  return cur === 'ar' ? (x.ar ? x.name || x.en || '' : '') : x.ar || '';
}

export function applyDocument() {
  const root = document.documentElement;
  root.lang = cur;
  root.dir = cur === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app.name');
}

export function setLang(l) {
  if (!DICTS[l] || l === cur) return;
  cur = l;
  try { localStorage.setItem(KEY, l); } catch { /* not remembered: storage blocked */ }
  applyDocument();
  listeners.forEach((fn) => fn(l));
}

export const onLang = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The keys each dictionary has, for the tests. */
export const dictionaries = DICTS;
