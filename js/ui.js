// Shared UI helpers.
import { dayKey, parseDay, addDays } from './stats.js';

// ---------- tiny DOM helper (never uses innerHTML, so imported data can't inject markup) ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'css') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}

/**
 * Run a library that a bundled build ships as inert text (<script type="text/plain" id=…>).
 * The browser skips parsing it at startup; it runs only when a feature needs it. The page's
 * security policy still allows exactly that code (by hash) and nothing else. Returns true if run.
 */
export function runBundledLib(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  const s = document.createElement('script');
  s.textContent = el.textContent;
  document.head.append(s);
  el.remove();
  return true;
}

export const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

export function dayLabel(k) {
  const today = dayKey();
  if (k === today) return 'Today';
  if (k === addDays(today, -1)) return 'Yesterday';
  return parseDay(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const $toast = document.getElementById('toast');
export function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $toast.hidden = true; }, 2600);
}

// ---------- dialogs ----------
export function modal(build) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'sheet' });
    const done = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    dlg.append(build(done));
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('[autofocus]')?.focus();
  });
}

export function confirmDialog(title, body, okLabel = 'OK', danger = false) {
  return modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, title),
    body ? h('p', { class: 'muted' }, body) : null,
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Cancel'),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, okLabel))));
}
