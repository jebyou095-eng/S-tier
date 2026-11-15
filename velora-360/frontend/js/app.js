// Velora 360 — app shell: router, API client, shared UI helpers.
import { snapshot, webglOK } from './car3d.js';

export const API_URL = (() => { try { const o = localStorage.getItem('velora.api'); if (o) return o; } catch {} return `${location.protocol}//${location.hostname || 'localhost'}:4200`; })();
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const mad = (n) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(n) + ' MAD';
export const BODY_LABEL = { hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV', coupe: 'Coupé', pickup: 'Pickup' };

// ---------- API ----------
export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(API_URL + '/api' + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  } catch (e) {
    console.error(`[frontend → backend] Cannot reach ${API_URL}/api${path}. Is the backend running?`, e);
    const b = $('#apiBanner'); b.hidden = false;
    b.innerHTML = `⚠ The site can't reach the backend at <code>${esc(API_URL)}</code>. Start it with <code>cd backend && npm start</code>.`;
    const err = new Error('The server is not reachable right now.'); err.kind = 'network'; throw err;
  }
  $('#apiBanner').hidden = true;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn(`[backend error] ${res.status} at ${data.where || path}: ${data.error}`);
    const err = new Error(data.error || `Server error ${res.status}`); err.kind = 'backend'; err.status = res.status; throw err;
  }
  return data;
}

// ---------- Toasts & modal ----------
export function toast(msg, err = false) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' toast--err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3800);
}
export function modal(html) { $('#modalBox').innerHTML = html; $('#modal').hidden = false; return $('#modalBox'); }
export function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', (e) => e.target.matches('[data-close]') && closeModal());

// ---------- Compare list (saved in the browser) ----------
export const compare = {
  ids: (() => { try { return JSON.parse(localStorage.getItem('velora.cmp')) || []; } catch { return []; } })(),
  save() { try { localStorage.setItem('velora.cmp', JSON.stringify(this.ids)); } catch {} renderDock(); },
  has(id) { return this.ids.includes(id); },
  toggle(id) {
    if (this.has(id)) this.ids = this.ids.filter(x => x !== id);
    else { if (this.ids.length >= 3) { toast('You can compare up to 3 cars. Remove one first.', true); return false; } this.ids.push(id); }
    this.save(); return true;
  },
};
const cache = new Map();
export const remember = (items) => items.forEach(m => cache.set(m.id, m));
function renderDock() {
  const n = compare.ids.length, dock = $('#cmpDock');
  $('#cmpCount').hidden = !n; $('#cmpCount').textContent = n;
  dock.hidden = !n || location.hash.startsWith('#/compare');
  dock.innerHTML = `<span>${n} car${n > 1 ? 's' : ''} selected to compare</span><button class="btn btn--sm btn--ghost" id="cmpClear">Clear</button><a class="btn btn--sm btn--blue" href="#/compare">Compare now →</a>`;
  $('#cmpClear').onclick = () => { compare.ids = []; compare.save(); $$('.cmp-btn.on').forEach(b => b.classList.remove('on')); };
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmp]'); if (!b) return;
  e.preventDefault();
  if (compare.toggle(b.dataset.cmp)) { b.classList.toggle('on', compare.has(b.dataset.cmp)); b.textContent = compare.has(b.dataset.cmp) ? '✓ Compare' : '+ Compare'; }
});

// ---------- Car pictures: rendered from the 3D model, lazily, one at a time ----------
const queue = []; let busy = false;
const pump = () => {
  if (busy || !queue.length) return; busy = true;
  const run = () => {
    const img = queue.shift();
    try {
      const m = cache.get(img.dataset.car);
      if (m) { img.src = snapshot(m, img.dataset.color || m.colors[0].hex, { angle: img.dataset.angle || 'three', w: +img.dataset.w || 720, h: +img.dataset.h || 450 }); img.classList.remove('loading'); }
    } catch (e) { console.error('[frontend] Could not render car image', e); }
    busy = false; pump();
  };
  (window.requestIdleCallback || setTimeout)(run, { timeout: 120 });
};
const imgIO = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { imgIO.unobserve(e.target); queue.push(e.target); pump(); } }), { rootMargin: '300px' });
export function carImg(m, { angle = 'three', color, w = 720, h = 450, cls = '' } = {}) {
  cache.set(m.id, m);
  if (!webglOK) return `<div class="v-fallback">${esc(m.brandName || '')} ${esc(m.name)}</div>`;
  return `<img class="loading ${cls}" data-car="${esc(m.id)}" data-angle="${angle}" data-color="${esc(color || '')}" data-w="${w}" data-h="${h}" alt="${esc((m.brandName || '') + ' ' + m.name)}" />`;
}
export function hydrate(root = document) {
  $$('img[data-car].loading', root).forEach(img => { if (!img.dataset.q) { img.dataset.q = 1; imgIO.observe(img); } });
  $$('.reveal:not(.in)', root).forEach(el => revealIO.observe(el));
}
const revealIO = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { threshold: 0.1 });

export function card(m, i = 0) {
  const ev = m.fuel === 'Electric';
  return `<article class="card reveal" style="--d:${(i % 3) * 0.08}s">
    <a href="#/car/${m.id}" class="card__img">${carImg(m)}
      <div class="tags"><span class="tag tag--dark">${BODY_LABEL[m.body]}</span>${ev ? '<span class="tag tag--ev">⚡ Electric</span>' : ''}</div>
      <span class="card__360">360°</span></a>
    <div class="card__body">
      <div class="card__brand">${esc(m.brandName)} · ${m.year}</div>
      <a href="#/car/${m.id}"><h3>${esc(m.name)}</h3></a>
      <div class="card__specs"><span><b>${m.power}</b> hp</span><span><b>${m.accel}</b> s 0-100</span><span><b>${m.seats}</b> seats</span><span>${esc(m.fuel)}</span></div>
      <div class="card__foot"><div class="price"><small>From</small><b>${mad(m.price)}</b></div>
        <button class="cmp-btn ${compare.has(m.id) ? 'on' : ''}" data-cmp="${m.id}">${compare.has(m.id) ? '✓ Compare' : '+ Compare'}</button></div>
    </div></article>`;
}
export const skeletons = (n) => Array.from({ length: n }, () => '<div class="skel" style="height:400px"></div>').join('');

// ---------- Router ----------
const routes = [
  [/^\/$/, () => import('./pages/home.js')],
  [/^\/cars$/, () => import('./pages/cars.js')],
  [/^\/brands$/, () => import('./pages/brands.js')],
  [/^\/brand\/([\w-]+)$/, () => import('./pages/cars.js')],
  [/^\/car\/([\w-]+)$/, () => import('./pages/car.js')],
  [/^\/compare$/, () => import('./pages/compare.js')],
  [/^\/admin$/, () => import('./pages/admin.js')],
];
let cleanup = null, token = 0;
export const go = (h) => (location.hash = h);
async function render() {
  const my = ++token;
  const [path = '/', qs = ''] = location.hash.slice(1).split('?');
  const p = path || '/';
  const match = routes.find(([re]) => re.test(p));
  const app = $('#app');
  const bar = $('#progress'); bar.style.opacity = 1; bar.style.width = '60%';
  try { cleanup?.(); } catch {} cleanup = null;
  $('#navLinks').classList.remove('open'); $('#burger').classList.remove('open');
  try {
    if (!match) throw Object.assign(new Error('Page not found'), { kind: '404' });
    const mod = await match[1]();
    if (my !== token) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
    cleanup = await mod.default(app, { params: p.match(match[0]).slice(1), query: new URLSearchParams(qs), path: p });
    hydrate(app);
  } catch (e) {
    if (my !== token) return;
    console.error(`[frontend] Page ${p} failed:`, e);
    app.innerHTML = `<div class="container empty" style="padding:120px 0"><b>${e.kind === '404' || e.status === 404 ? 'Not found' : 'Something went wrong'}</b>
      <p>${e.kind === 'network' ? 'The site could not reach the backend.' : e.kind === 'backend' ? 'The backend returned an error: ' + esc(e.message) : e.kind === '404' || e.status === 404 ? 'This page or car does not exist.' : 'A frontend error: ' + esc(e.message)}</p>
      <p style="margin-top:20px"><a class="btn btn--blue" href="#/">Back home</a></p></div>`;
  } finally {
    bar.style.width = '100%'; setTimeout(() => { bar.style.opacity = 0; bar.style.width = 0; }, 300);
    const navKey = p.startsWith('/compare') ? 'compare' : p.startsWith('/brand') ? 'brands' : qs.includes('fuel=Electric') ? 'ev' : qs.includes('body=suv') ? 'suv' : p.startsWith('/car') ? 'cars' : '';
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
    renderDock();
  }
}

// ---------- Shell ----------
addEventListener('hashchange', render);
addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 10), { passive: true });
$('#burger').onclick = () => { $('#burger').classList.toggle('open'); $('#navLinks').classList.toggle('open'); };
$('#navSearch').onsubmit = (e) => { e.preventDefault(); go('#/cars?q=' + encodeURIComponent(e.target.q.value.trim())); e.target.q.blur(); };
addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());
$('#year').textContent = new Date().getFullYear();
addEventListener('error', (e) => e.message && console.error('[frontend] Uncaught error:', e.message, `${e.filename}:${e.lineno}`));
if (!location.hash) history.replaceState(null, '', '#/');
render();
