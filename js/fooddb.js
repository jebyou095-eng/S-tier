// Moroccan food database, served from the app's GitHub repo (data/ folder).
// The whole list downloads once (about 1–2 MB) and is then searched offline.
// Product photos load only when shown, then stay cached on the phone.
// Nothing about you is sent: GitHub only sees that the public list or a photo was requested.
import { cacheGet, cacheSet } from './db.js';

const RAW = 'https://raw.githubusercontent.com/jebyou095-eng/S-tier/';
const LATEST = 'https://api.github.com/repos/jebyou095-eng/S-tier/commits/HEAD';
const HOSTED = !!globalThis.POCKET_STATS_HOSTED;
const MAX_AGE = 24 * 3600 * 1000; // check for a new version once a day (cheap: one tiny request)
// Files are read by exact commit id: GitHub's CDN can serve a stale copy of the 'HEAD' alias for a long time.
let ref = 'HEAD';
const base = () => (HOSTED ? 'data/' : `${RAW}${ref}/data/`); // web-link version ships the list next to the page

/** The repo's current commit id, or null. */
async function latestCommit() {
  try {
    const r = await fetch(LATEST, { ...FETCH, headers: { Accept: 'application/vnd.github.sha' } });
    const sha = r.ok ? (await r.text()).trim() : '';
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

const FETCH = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
let foods = [];
let ingredientTable = {};
let byCode = new Map();
let meta = { version: null, fetched: 0, attribution: '', where: {} };
let loading = null;
const listeners = new Set();



function adopt(json, fetched) {
  const list = Array.isArray(json?.foods) ? json.foods : [];
  foods = list.filter((x) => x && x.n && Number.isFinite(+x.k)).map((x) => ({
    id: String(x.id).slice(0, 40),
    name: String(x.n).slice(0, 80),
    brand: String(x.b || '').slice(0, 40),
    alt: `${x.fr || ''} ${x.ar || ''}`.trim(),
    fr: x.fr || '', ar: x.ar || '',
    source: ['Estimate', 'USDA', 'Recipe'].includes(x.src) ? x.src : 'Open Food Facts',
    n: { kcal: +x.k, p: +x.p || 0, c: +x.c || 0, f: +x.f || 0, fib: +x.fi || 0 },
    serving: +x.s > 0 ? +x.s : 100,
    servingLabel: String(x.sl || '100 g').slice(0, 30),
    code: String(x.code || ''),
    img: typeof x.img === 'string' && /^img\/[\w/-]+\.jpg$/.test(x.img) ? x.img : '',
    emoji: typeof x.e === 'string' ? x.e.slice(0, 4) : '',
    where: String(x.w || ''), cat: String(x.cat || ''), qty: String(x.q || ''), nutri: x.ns || '',
    ing: Array.isArray(x.ing) ? x.ing.filter((i) => Array.isArray(i) && typeof i[0] === 'string' && +i[1] > 0).map((i) => [i[0], +i[1]]) : null,
    hasLabelIngredients: x.hi === 1,
  }));
  ingredientTable = json.ingredients && typeof json.ingredients === 'object' ? json.ingredients : {};
  for (const f of foods) f.hay = `${f.name} ${f.brand} ${f.alt}`.toLowerCase();
  byCode = new Map(foods.filter((f) => f.code).map((f) => [f.code, f]));
  meta = { version: json.version || null, fetched, attribution: json.attribution || '', where: json.where || {} };
  listeners.forEach((fn) => fn());
}

/** Load from the phone's cache, then refresh from GitHub if a week old (or forced). */
export function loadFoodDb({ force = false, allowNetwork = true } = {}) {
  if (loading && !force) return loading;
  loading = (async () => {
    let cached = null;
    try { cached = await cacheGet('fooddb'); } catch { /* storage unavailable */ }
    if (cached?.ref) ref = cached.ref;
    if (cached && !foods.length) adopt(cached.json, cached.fetched);
    const stale = !cached || Date.now() - cached.fetched > MAX_AGE;
    if (allowNetwork && (force || stale)) {
      try {
        const sha = HOSTED ? null : await latestCommit();
        if (sha && cached?.ref === sha && foods.length) {
          // Nothing changed in the repo: keep the copy on the phone, just note that we checked.
          try { await cacheSet('fooddb', { ...cached, fetched: Date.now() }); } catch { /* ignore */ }
          meta.fetched = Date.now();
        } else {
          const useRef = sha || 'HEAD';
          const r = await fetch(`${HOSTED ? 'data/' : `${RAW}${useRef}/data/`}foods-morocco.json`, FETCH);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const json = await r.json();
          const fetched = Date.now();
          ref = useRef;
          adopt(json, fetched);
          try { await cacheSet('fooddb', { json, fetched, ref: useRef }); } catch { /* ignore */ }
        }
      } catch (err) {
        if (!foods.length) throw err;
      }
    }
    return foods.length;
  })();
  return loading.finally(() => { loading = null; });
}

export const foodDb = () => foods;

/** URL of a file in the repo's data/ folder (same version as the food list). */
export const repoFile = (path) => `${base()}${path}`;

/** Base ingredient per 100 g: {name, fr, n:{kcal,p,c,f,fib}} or null. */
export function ingredientInfo(id) {
  const r = ingredientTable[id];
  if (!Array.isArray(r)) return null;
  return { name: String(r[0]), fr: String(r[1]), n: { kcal: +r[2] || 0, p: +r[3] || 0, c: +r[4] || 0, f: +r[5] || 0, fib: +r[6] || 0 } };
}
export const foodDbMeta = () => meta;
export const findByCode = (code) => byCode.get(code) || byCode.get(code.replace(/^0+/, '')) || null;
export const onFoodDb = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const photosAvailable = () => !HOSTED;

// ---------- label ingredients (loaded on demand, ~100 small files) ----------
const shardCache = new Map();
/** Ingredient list printed on a packaged product's label, or '' if unknown. */
export async function labelIngredients(food) {
  if (!food.hasLabelIngredients || !food.code) return '';
  const key = food.code.slice(-2);
  if (!shardCache.has(key)) {
    shardCache.set(key, (async () => {
      const cacheKey = `ing:${ref}:${key}`;
      try { const c = await cacheGet(cacheKey); if (c) return c; } catch { /* ignore */ }
      const r = await fetch(`${base()}ing/${key}.json`, FETCH);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      try { await cacheSet(cacheKey, data); } catch { /* ignore */ }
      return data;
    })().catch((err) => { shardCache.delete(key); throw err; }));
  }
  const data = await shardCache.get(key);
  return typeof data?.[food.code] === 'string' ? data[food.code].slice(0, 600) : '';
}

// ---------- photos ----------
const urls = new Map();
async function photoUrl(path) {
  if (urls.has(path)) return urls.get(path);
  let blob = null;
  try { blob = await cacheGet(`img:${path}`); } catch { /* ignore */ }
  if (!blob) {
    const r = await fetch(`${base()}${path}`, FETCH);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    blob = await r.blob();
    if (!/^image\//.test(blob.type) && blob.type) throw new Error('not an image');
    try { await cacheSet(`img:${path}`, blob); } catch { /* ignore */ }
  }
  const url = URL.createObjectURL(blob);
  urls.set(path, url);
  return url;
}

let observer = null;
function observe(el, fn) {
  if (!('IntersectionObserver' in globalThis)) { fn(); return; }
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      e.target.__load?.();
    }
  }, { rootMargin: '200px' });
  el.__load = fn;
  observer.observe(el);
}

/** A square thumbnail: product photo when available, else the food's icon. */
export function foodThumb(food, { size = 'sm', photos = true, userPhoto = '' } = {}) {
  const box = document.createElement('span');
  box.className = `thumb thumb-${size}`;
  box.setAttribute('aria-hidden', 'true');
  if (userPhoto) { // your own photo, stored privately on the phone
    const img = document.createElement('img');
    img.alt = '';
    img.src = userPhoto;
    box.append(img);
    box.classList.add('has-photo');
    return box;
  }
  box.textContent = food.emoji || (food.source === 'Open Food Facts' ? '🛒' : '🍽️');
  if (food.img && photos && !HOSTED) {
    observe(box, async () => {
      try {
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = await photoUrl(food.img);
        box.textContent = '';
        box.append(img);
        box.classList.add('has-photo');
      } catch { /* keep the icon */ }
    });
  }
  return box;
}
