// Food tab: calorie & macro diary, barcode scanner, food search, bulking planner.
import { h, uid, dayLabel, toast, modal, confirmDialog } from './ui.js';
import { dayKey, addDays, dayRange, series } from './stats.js';
import { barChart } from './charts.js';
import { searchLocal } from './foods.js';
import {
  ACTIVITY, GOALS, targets, scale, sum, lookupBarcode, searchOnline, agreement, buildPlan, suggestions,
} from './nutrition.js';
import { scanBarcode, canonicalBarcode } from './scanner.js';
import { loadFoodDb, foodDb, foodDbMeta, findByCode, onFoodDb, foodThumb, photosAvailable, ingredientInfo, labelIngredients } from './fooddb.js';
import { recognizeFood, recognitionMode, preparePhoto, RecognitionError } from './recognize.js';
import { prepareScanner, fingerprint, learn, match, confidence } from './foodscan.js';

const MEALS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
const k0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const k1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const LB = 0.45359237;

let sub = 'diary';
let foodDay = dayKey();
let ctx; // { state, commit, render, addTrackerObj }

const F = () => ctx.state.food;

// ---------- data ----------
export function freshFood() {
  return { profile: null, log: [], saved: [], online: false, usdaKey: '', moroccoDb: true, photos: true, myPhotos: {}, scans: {}, ai: false, aiKey: '' };
}

const num = (x, lo, hi) => (Number.isFinite(+x) && +x >= lo && +x <= hi ? +x : null);
const str = (x, max) => String(x ?? '').slice(0, max);

function cleanN(n) {
  if (!n) return null;
  const out = { kcal: num(n.kcal, 0, 1000), p: num(n.p, 0, 100), c: num(n.c, 0, 100), f: num(n.f, 0, 100), fib: num(n.fib, 0, 100) ?? 0 };
  return out.kcal === null || out.p === null || out.c === null || out.f === null ? null : out;
}

function cleanFood(x) {
  const n = cleanN(x?.n);
  if (!n || !x.name) return null;
  return {
    id: str(x.id || uid(), 60), name: str(x.name, 80), brand: str(x.brand, 40), source: str(x.source, 30) || 'You',
    code: str(x.code, 14).replace(/\D/g, ''), n, serving: num(x.serving, 1, 5000) ?? 100, servingLabel: str(x.servingLabel, 30) || '100 g',
    img: /^img\/[\w/-]+\.jpg$/.test(x.img || '') ? x.img : '', emoji: str(x.emoji, 4),
  };
}

export function normalizeFood(raw) {
  const out = freshFood();
  if (!raw || typeof raw !== 'object') return out;
  const p = raw.profile;
  if (p && GOALS[p.goal] && ACTIVITY[p.activity]) {
    const prof = {
      sex: p.sex === 'female' ? 'female' : 'male', age: num(p.age, 13, 110), heightCm: num(p.heightCm, 100, 250), weightKg: num(p.weightKg, 30, 350),
      activity: +p.activity, goal: p.goal, units: p.units === 'imperial' ? 'imperial' : 'metric', diet: p.diet === 'vegetarian' ? 'vegetarian' : 'omnivore',
    };
    if (prof.age && prof.heightCm && prof.weightKg) out.profile = prof;
  }
  for (const e of Array.isArray(raw.log) ? raw.log : []) {
    const food = cleanFood(e);
    if (!food || !/^\d{4}-\d{2}-\d{2}$/.test(e.day) || !num(e.grams, 0.1, 10000)) continue;
    out.log.push({ ...food, id: str(e.id || uid(), 40), day: e.day, ts: Number.isFinite(+e.ts) ? +e.ts : Date.now(), grams: +e.grams, meal: MEALS[e.meal] ? e.meal : 'snack' });
  }
  for (const s of Array.isArray(raw.saved) ? raw.saved : []) {
    const food = cleanFood(s);
    if (food) out.saved.push(food);
  }
  out.online = raw.online === true;
  out.moroccoDb = raw.moroccoDb !== false;
  out.photos = raw.photos !== false;
  out.ai = raw.ai === true;
  out.aiKey = typeof raw.aiKey === 'string' && /^[\w-]{0,200}$/.test(raw.aiKey) ? raw.aiKey : '';
  // Learned food scans (only present in memory and in backups; stored as separate records)
  if (raw.scans && typeof raw.scans === 'object') {
    for (const [k, r] of Object.entries(raw.scans).slice(0, 500)) {
      const food = cleanFood(r?.food);
      const prints = (Array.isArray(r?.prints) ? r.prints : []).filter((p) => Number.isFinite(+p?.s) && typeof p?.q === 'string' && p.q.length <= 2400).slice(-40);
      if (food && prints.length) out.scans[String(k).slice(0, 60)] = { food, prints, lastGrams: num(r.lastGrams, 1, 5000), updated: Number.isFinite(+r.updated) ? +r.updated : 0 };
    }
  }
  if (raw.myPhotos && typeof raw.myPhotos === 'object') {
    for (const [k, v] of Object.entries(raw.myPhotos).slice(0, 300)) {
      if (typeof v === 'string' && v.startsWith('data:image/jpeg;base64,') && v.length < 200000) out.myPhotos[String(k).slice(0, 60)] = v;
    }
  }
  out.usdaKey = /^[A-Za-z0-9]{0,64}$/.test(raw.usdaKey || '') ? raw.usdaKey || '' : '';
  return out;
}

const dayLog = (day) => F().log.filter((e) => e.day === day);
const totals = (list) => sum(list.map((e) => scale(e.n, e.grams)));

function remember(food) {
  if (food.id && !food.id.includes(':')) return; // built-in table, no need to save
  const saved = F().saved;
  const i = saved.findIndex((s) => s.id === food.id || (food.code && s.code === food.code));
  const clean = cleanFood(food);
  if (!clean) return;
  if (i >= 0) saved.splice(i, 1);
  saved.unshift(clean);
  saved.length = Math.min(saved.length, 300);
}

async function addEntry(food, grams, meal) {
  remember(food);
  const ts = foodDay === dayKey() ? Date.now() : new Date(`${foodDay}T12:00`).getTime();
  F().log.push({ ...cleanFood(food), id: uid(), day: foodDay, ts, grams, meal });
  await ctx.commit();
  toast(`Added ${food.name} · ${k0.format(scale(food.n, grams).kcal)} kcal`);
}

function defaultMeal() {
  const hr = new Date().getHours();
  return hr < 11 ? 'breakfast' : hr < 15 ? 'lunch' : hr < 21 ? 'dinner' : 'snack';
}

// ---------- privacy consent ----------
async function ensureOnline() {
  if (globalThis.POCKET_STATS_HOSTED) {
    toast('Online lookups only work in the downloaded app. Built-in foods and label entry work here.');
    return false;
  }
  if (F().online) return true;
  const ok = await modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, 'Look up foods online?'),
    h('p', {}, 'To find a product, the app asks two public food databases:'),
    h('ul', { class: 'bullets' },
      h('li', {}, h('b', {}, 'USDA FoodData Central'), ' (US government)'),
      h('li', {}, h('b', {}, 'Open Food Facts'), ' (non-profit, packaged products worldwide)')),
    h('p', {}, 'Only the barcode number or the words you type are sent. No account, no cookies, no device ID, and nothing from your diary, body stats or other data.'),
    h('p', { class: 'muted small' }, 'Products you add are saved on your phone, so scanning them again works offline. You can turn this off any time in Settings.'),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Not now'),
      h('button', { class: 'btn primary', onclick: () => done(true) }, 'Allow lookups'))));
  if (ok) { F().online = true; await ctx.commit(); }
  return ok;
}

// ---------- dialogs ----------
function sourceBadge(food) {
  const cls = { 'Open Food Facts': 'off', USDA: 'usda', Estimate: 'est', Recipe: 'rec', 'Photo estimate': 'ai' }[food.source] || 'you';
  return h('span', { class: `src src-${cls}`, title: { Estimate: 'Typical home recipe. Values vary; weigh and adjust.', Recipe: 'Calculated from a typical recipe using USDA ingredient values.', 'Photo estimate': "Claude's estimate from your photo." }[food.source] || null }, food.source === 'Estimate' ? 'Estimate' : food.source);
}

function macroLine(n) {
  return `${k0.format(n.kcal)} kcal · P ${k1.format(n.p)} g · C ${k1.format(n.c)} g · F ${k1.format(n.f)} g`;
}

const MULTS = [[0, 'None'], [0.5, '½'], [1, 'Normal'], [2, '2×']];

/** Nutrition per 100 g of a recipe dish with some ingredients removed or changed. */
function recipeN(food, mult) {
  const out = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const [id, g] of food.ing) {
    const info = ingredientInfo(id);
    if (!info) continue;
    const m = mult[id] ?? 1;
    for (const k of Object.keys(out)) out[k] += (info.n[k] * g * m) / 100;
  }
  return out;
}

function modsLabel(food, mult) {
  const parts = Object.entries(mult).filter(([, m]) => m !== 1).map(([id, m]) => {
    const nm = (ingredientInfo(id)?.name || id).split(' (')[0].toLowerCase();
    return m === 0 ? `no ${nm}` : m === 0.5 ? `½ ${nm}` : `2× ${nm}`;
  });
  return parts.join(', ');
}

/** Add or replace your own photo of a food. Stored privately (encrypted with your passcode). */
async function addMyPhoto(food, box) {
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const { dataUrl } = await preparePhoto(file, 320);
      F().myPhotos[food.id] = dataUrl;
      await ctx.savePhoto(food.id, dataUrl);
      box.replaceWith(foodThumb(food, { size: 'lg', userPhoto: dataUrl }));
      toast('Photo saved on your phone');
    } catch {
      toast("Couldn't read that photo.");
    }
  });
  input.click();
}

function portionDialog(food, { grams: g0, meal: m0, edit = false, okLabel } = {}) {
  return modal((done) => {
    const mult = {};
    const hasRecipe = Array.isArray(food.ing) && food.ing.length && food.ing.every(([id]) => ingredientInfo(id));
    const grams = h('input', { type: 'text', inputmode: 'decimal', value: String(g0 ?? food.serving), 'aria-label': 'Amount in grams', autofocus: true });
    const meal = h('select', { 'aria-label': 'Meal' }, ...Object.entries(MEALS).map(([k, v]) => h('option', { value: k, selected: k === (m0 || defaultMeal()) }, v)));
    const preview = h('div', { class: 'preview' });
    const ingList = h('ul', { class: 'ing-list' });
    const val = () => parseFloat(grams.value.replace(',', '.'));
    const changed = () => hasRecipe && Object.keys(mult).length > 0;
    const currentN = () => (changed() ? recipeN(food, mult) : food.n);
    const update = () => {
      const g = val();
      if (!(g > 0)) { preview.replaceChildren(h('span', { class: 'muted' }, 'Enter an amount')); return; }
      const n = scale(currentN(), g);
      const base = scale(food.n, g);
      const diff = changed() ? Math.round(n.kcal - base.kcal) : 0;
      preview.replaceChildren(
        h('div', { class: 'big' }, `${k0.format(n.kcal)} kcal`,
          diff ? h('span', { class: `delta ${diff < 0 ? 'ok' : 'warn'}` }, ` ${diff > 0 ? '+' : '−'}${k0.format(Math.abs(diff))} vs usual recipe`) : null),
        h('div', { class: 'macros' },
          h('span', { class: 'm-p' }, `P ${k1.format(n.p)} g`), h('span', { class: 'm-c' }, `C ${k1.format(n.c)} g`), h('span', { class: 'm-f' }, `F ${k1.format(n.f)} g`)));
      if (hasRecipe) {
        ingList.replaceChildren(...food.ing.map(([id, per100]) => {
          const info = ingredientInfo(id);
          const m = mult[id] ?? 1;
          const ig = (per100 * g) / 100;
          const kcal = (info.n.kcal * ig * m) / 100;
          return h('li', { class: m === 0 ? 'removed' : '' },
            h('span', { class: 'ing-name' }, info.name, h('span', { class: 'muted small block' }, `${k0.format(ig * m)} g · ${k0.format(kcal)} kcal`)),
            h('span', { class: 'ing-mult', role: 'group', 'aria-label': `${info.name} amount` }, ...MULTS.map(([v, l]) => h('button', {
              type: 'button', class: `mult${m === v ? ' on' : ''}`, 'aria-pressed': String(m === v),
              onclick: () => { if (v === 1) delete mult[id]; else mult[id] = v; update(); },
            }, l))));
        }));
      }
    };
    grams.addEventListener('input', update);
    const quick = [
      [food.servingLabel !== '100 g' ? `${food.servingLabel}` : null, food.serving],
      ['½ serving', food.serving / 2], ['2 servings', food.serving * 2], ['100 g', 100],
    ].filter(([l]) => l).map(([l, g]) => h('button', { type: 'button', class: 'chip', onclick: () => { grams.value = String(Math.round(g * 10) / 10); update(); } }, l === food.servingLabel && !/\bg\b/.test(l) ? `${l} (${k0.format(g)} g)` : l));
    update();
    const thumb = foodThumb(food, { size: 'lg', photos: photosOn(), userPhoto: F().myPhotos[food.id] });
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        const g = val();
        if (!(g > 0 && g < 10000)) return;
        let chosen = food;
        const label = hasRecipe ? modsLabel(food, mult) : '';
        if (label) {
          chosen = { ...food, id: `${food.id}~${uid().slice(0, 6)}`, name: `${food.name} (${label})`.slice(0, 80), n: recipeN(food, mult), ing: null };
        }
        done({ grams: g, meal: meal.value, food: chosen });
      },
    },
    h('div', { class: 'portion-head' },
      h('div', { class: 'thumb-col' }, thumb,
        h('button', { type: 'button', class: 'link small', onclick: () => addMyPhoto(food, thumb) }, F().myPhotos[food.id] ? '📷 Change photo' : '📷 Add photo')),
      h('div', { class: 'grow-wrap' },
        h('h2', {}, food.name),
        food.fr || food.ar ? h('p', { class: 'muted small' }, food.fr || '', food.ar ? h('span', { lang: 'ar', dir: 'rtl' }, ` · ${food.ar}`) : null) : null,
        h('p', { class: 'muted small' }, food.brand ? `${food.brand} · ` : '', food.qty ? `${food.qty} · ` : '', sourceBadge(food),
          food.where ? ` · ${WHERE_LABEL[food.where] || ''}` : ''))),
    h('p', { class: 'muted small' }, `Per 100 g: ${macroLine(food.n)}`),
    h('div', { class: 'chips' }, ...quick),
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', {}, 'Grams'), grams), h('label', { class: 'field grow' }, h('span', {}, 'Meal'), meal)),
    preview,
    hasRecipe ? h('details', { class: 'ing-box', open: true },
      h('summary', {}, 'Ingredients in this portion'),
      h('p', { class: 'muted small' }, 'Remove or change an ingredient to see the new calories. Based on a typical recipe (USDA ingredient values).'),
      ingList) : null,
    !hasRecipe && food.hasLabelIngredients ? h('details', {
      class: 'ing-box',
      ontoggle: async (e) => {
        const box = e.currentTarget;
        if (!box.open || box.dataset.loaded) return;
        box.dataset.loaded = '1';
        const text = box.querySelector('.label-ing');
        try { text.textContent = (await labelIngredients(food)) || 'Not available.'; } catch { text.textContent = "Couldn't load the ingredients. Check your connection."; delete box.dataset.loaded; }
      },
    },
    h('summary', {}, 'Ingredients (from the label)'),
    h('p', { class: 'small label-ing' }, 'Loading…'),
    h('p', { class: 'muted small' }, 'Packaged product: the recipe is fixed, so ingredients can’t be removed.')) : null,
    h('div', { class: 'row end' },
      edit ? h('button', { type: 'button', class: 'btn danger', onclick: () => done('delete') }, 'Delete') : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, okLabel || (edit ? 'Save' : 'Add'))));
  });
}

/** Manual entry straight from a nutrition label. Values can be per 100 g or per serving. */
function labelDialog({ code = '', name = '' } = {}) {
  return modal((done) => {
    const f = (ph, extra = {}) => h('input', { type: 'text', inputmode: 'decimal', placeholder: ph, ...extra });
    const nm = h('input', { value: name, placeholder: 'e.g. Protein bar', maxlength: 80, autofocus: true, required: true });
    const basis = h('select', {}, h('option', { value: 'serving' }, 'Per serving'), h('option', { value: '100' }, 'Per 100 g / 100 ml'));
    const sg = f('e.g. 60', { value: '' });
    const kcal = f('kcal'); const p = f('g'); const c = f('g'); const fat = f('g'); const fib = f('g (optional)');
    const sgWrap = h('label', { class: 'field' }, h('span', {}, 'Serving size (g)'), sg);
    basis.addEventListener('change', () => { sgWrap.hidden = basis.value === '100'; });
    const err = h('p', { class: 'error', hidden: true });
    const v = (el) => parseFloat(el.value.replace(',', '.'));
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        const per = basis.value === '100' ? 100 : v(sg);
        const vals = [v(kcal), v(p), v(c), v(fat)];
        if (!(per > 0) || vals.some((x) => !(x >= 0))) { err.textContent = 'Fill in serving size, calories, protein, carbs and fat.'; err.hidden = false; return; }
        const k = 100 / per;
        const food = cleanFood({
          id: `you:${uid()}`, code, name: nm.value.trim(), source: 'You',
          n: { kcal: vals[0] * k, p: vals[1] * k, c: vals[2] * k, f: vals[3] * k, fib: (v(fib) || 0) * k },
          serving: per, servingLabel: basis.value === '100' ? '100 g' : `1 serving (${per} g)`,
        });
        if (!food) { err.textContent = 'Those numbers look off. Check the label.'; err.hidden = false; return; }
        done(food);
      },
    },
    h('h2', {}, 'Enter from the label'),
    h('p', { class: 'muted small' }, code ? `Barcode ${code} will be remembered, so next time a scan finds it instantly (offline).` : 'Copy the numbers from the nutrition facts panel.'),
    h('label', { class: 'field' }, h('span', {}, 'Name'), nm),
    h('label', { class: 'field' }, h('span', {}, 'Values are'), basis),
    sgWrap,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, 'Calories'), kcal),
      h('label', { class: 'field' }, h('span', {}, 'Protein'), p),
      h('label', { class: 'field' }, h('span', {}, 'Carbs'), c),
      h('label', { class: 'field' }, h('span', {}, 'Fat'), fat),
      h('label', { class: 'field' }, h('span', {}, 'Fiber'), fib)),
    err,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Save food')));
  });
}

const WHERE_LABEL = { supermarket: 'Supermarket', souk: 'Souk', street: 'Street food', cafe: 'Café', bakery: 'Bakery', home: 'Home cooking' };
const photosOn = () => F().photos !== false;

function resultRow(food, onPick) {
  return h('li', {},
    h('button', { class: 'result with-thumb', type: 'button', onclick: () => onPick(food) },
      foodThumb(food, { photos: photosOn(), userPhoto: F().myPhotos[food.id] }),
      h('span', { class: 'r-text' },
        h('span', { class: 'r-name' }, food.name, food.brand ? h('span', { class: 'muted' }, ` · ${food.brand}`) : null,
          food.ar ? h('span', { class: 'r-ar', lang: 'ar', dir: 'rtl' }, ` ${food.ar}`) : null),
        h('span', { class: 'r-meta' }, sourceBadge(food), food.where ? ` ${WHERE_LABEL[food.where] || ''} ·` : '', ` ${k0.format(food.n.kcal)} kcal · ${k1.format(food.n.p)} g protein /100 g`))));
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

/** Search sheet. Built-in + saved foods instantly; online sources on request. */
function searchDialog(meal) {
  return modal((done) => {
    const q = h('input', { type: 'search', placeholder: 'Search: msemen, Jaouda, harira, banane…', 'aria-label': 'Search foods', autofocus: true, enterkeyhint: 'search' });
    const list = h('ul', { class: 'results' });
    const online = h('ul', { class: 'results' });
    const status = h('p', { class: 'muted small' });
    const pick = (food) => done(food);
    const local = () => {
      const res = dedupe(searchLocal(q.value, F().moroccoDb ? foodDb() : [], F().saved)).slice(0, 30);
      list.replaceChildren(...res.map((f) => resultRow(f, pick)));
      if (!q.value.trim()) {
        const recent = F().saved.slice(0, 8);
        list.replaceChildren(...(recent.length ? [h('li', { class: 'muted small label' }, 'Recent'), ...recent.map((f) => resultRow(f, pick))] : []));
      }
    };
    const goOnline = async () => {
      const term = q.value.trim();
      if (!term) { q.focus(); return; }
      if (!await ensureOnline()) return;
      status.textContent = 'Searching USDA and Open Food Facts…';
      online.replaceChildren();
      const { results, failed } = await searchOnline(term, F().usdaKey);
      status.textContent = results.length
        ? `${results.length} results from online sources${failed ? ' (one source did not respond)' : ''}.`
        : failed === 2 ? "Couldn't reach the databases. Check your connection." : 'No online results. Try simpler words.';
      online.replaceChildren(...results.map((f) => resultRow(f, pick)));
    };
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(local, 120); }); // wait for a pause in typing
    local();
    return h('div', { class: 'sheet-body search' },
      h('h2', {}, `Add to ${MEALS[meal]}`),
      h('form', { onsubmit: (e) => { e.preventDefault(); goOnline(); } }, q),
      list,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost', type: 'button', onclick: goOnline }, '🌐 Search online'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => done('label') }, '✎ Enter from label')),
      status, online,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, 'Close')));
  });
}

function chooseDialog(code, results) {
  const agree = agreement(results);
  return modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, 'Found it'),
    h('p', { class: 'muted small' }, `Barcode ${code}`),
    agree ? h('p', { class: agree.agree ? 'ok' : 'warn' }, agree.agree
      ? `✓ ${results.length} sources agree on calories (${k0.format(agree.lo)}–${k0.format(agree.hi)} kcal/100 g).`
      : `⚠ Sources disagree (${k0.format(agree.lo)}–${k0.format(agree.hi)} kcal/100 g). Compare with the label on the pack and pick the match.`) : null,
    h('ul', { class: 'results' }, ...results.map((f) => resultRow(f, done))),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => done('label') }, 'None match: enter label'),
      h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'))));
}

/** Catalogue of Moroccan foods from the repo database, by where they're sold. */
function browseDialog(meal) {
  return modal((done) => {
    let where = 'supermarket'; let cat = ''; let limit = 40;
    const q = h('input', { type: 'search', placeholder: 'Filter (name, brand, Darija…)', 'aria-label': 'Filter Moroccan foods' });
    const whereChips = h('div', { class: 'chips' });
    const catChips = h('div', { class: 'chips cats' });
    const list = h('ul', { class: 'results' });
    const status = h('p', { class: 'muted small' });
    const more = h('button', { class: 'btn ghost wide', type: 'button', hidden: true, onclick: () => { limit += 60; draw(); } }, 'Show more');
    const draw = () => {
      const all = foodDb();
      if (!all.length) { list.replaceChildren(); return; }
      whereChips.replaceChildren(...Object.entries(WHERE_LABEL).filter(([k]) => all.some((f) => f.where === k)).map(([k, l]) => h('button', {
        type: 'button', class: `chip${k === where ? ' on' : ''}`, onclick: () => { where = k; cat = ''; limit = 40; draw(); },
      }, l)));
      const inWhere = all.filter((f) => f.where === where);
      const cats = [...new Set(inWhere.map((f) => f.cat).filter(Boolean))].sort();
      catChips.replaceChildren(...['', ...cats].map((c) => h('button', {
        type: 'button', class: `chip small${c === cat ? ' on' : ''}`, onclick: () => { cat = c; limit = 40; draw(); },
      }, c || 'All')));
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const shown = inWhere.filter((f) => (!cat || f.cat === cat) && words.every((w) => f.hay.includes(w)));
      list.replaceChildren(...shown.slice(0, limit).map((f) => resultRow(f, done)));
      more.hidden = shown.length <= limit;
      status.textContent = `${shown.length} foods`;
    };
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { limit = 40; draw(); }, 120); });
    const off = onFoodDb(draw);
    const close = (v) => { off(); done(v); };
    if (!foodDb().length) {
      status.textContent = 'Downloading the Moroccan food list from GitHub…';
      loadFoodDb({ force: true }).then(draw).catch(() => {
        status.textContent = "Couldn't download the food list. Check your connection and try again.";
      });
    }
    draw();
    const meta = foodDbMeta();
    return h('div', { class: 'sheet-body search browse' },
      h('h2', {}, `Moroccan foods · ${MEALS[meal]}`),
      whereChips, catChips, q, status, list, more,
      h('p', { class: 'muted small' }, meta.attribution || ''),
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Close')));
  });
}

// ---------- photo recognition ----------
async function ensureAi() {
  const hosted = recognitionMode() === 'sample';
  if (F().ai && (hosted || F().aiKey)) return true;
  const key = h('input', { type: 'password', value: F().aiKey, placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': 'Anthropic API key' });
  const err = h('p', { class: 'error', hidden: true });
  const ok = await modal((done) => h('form', {
    class: 'sheet-body',
    onsubmit: (e) => {
      e.preventDefault();
      if (!hosted && !/^sk-ant-[\w-]{10,}$/.test(key.value.trim())) { err.textContent = 'Paste an Anthropic API key (it starts with sk-ant-).'; err.hidden = false; return; }
      done(true);
    },
  },
  h('h2', {}, 'Recognise food from a photo'),
  h('p', {}, 'Claude looks at your photo, names each food (Moroccan dishes included), estimates the amount and its ingredients, and matches it to the food list. You check and adjust everything before it is logged.'),
  h('div', { class: 'alert warnbox' },
    h('strong', {}, 'This sends the photo off your phone.'),
    h('p', {}, hosted
      ? 'The photo goes to Claude through your claude.ai account. Only the photo and the food list are sent: never your diary, body stats or other data.'
      : 'The photo goes to Anthropic (the company that makes Claude) using your own API key. Only the photo and the food list are sent: never your diary, body stats or other data. Everything else in the app stays offline.')),
  hosted ? null : h('label', { class: 'field' }, h('span', {}, 'Your Anthropic API key'), key),
  hosted ? null : h('p', { class: 'muted small' }, 'Create one at console.anthropic.com (separate from a claude.ai subscription). It costs a few US cents per photo. The key stays on this phone, encrypted if you set a passcode.'),
  err,
  h('div', { class: 'row end' },
    h('button', { type: 'button', class: 'btn ghost', onclick: () => done(false) }, 'Not now'),
    h('button', { type: 'submit', class: 'btn primary' }, 'Turn on'))));
  if (!ok) return false;
  F().ai = true;
  if (!hosted) F().aiKey = key.value.trim();
  await ctx.save();
  return true;
}

function pickPhoto() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment' });
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.click();
  });
}

function busy(text) {
  let close;
  modal((done) => { close = done; return h('div', { class: 'sheet-body center' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, text)); });
  return () => close(null);
}

function resultsDialog(result, meal) {
  const catalog = new Map(foodDb().map((f) => [f.id, f]));
  const items = result.items.map((x) => {
    const match = x.catalogId && catalog.get(x.catalogId);
    const food = match || {
      id: `ai:${uid()}`, name: x.name, source: 'Photo estimate', n: x.n, serving: x.grams || 100,
      servingLabel: `${x.grams || 100} g (from photo)`, emoji: '📸',
    };
    return { ...x, food, grams: x.grams || food.serving, on: x.confidence !== 'low' || result.items.length === 1 };
  });
  return modal((done) => {
    const list = h('ul', { class: 'ai-list' });
    const total = h('p', { class: 'big' });
    const logBtn = h('button', { type: 'button', class: 'btn primary' });
    const draw = () => {
      list.replaceChildren(...items.map((it) => {
        const n = scale(it.food.n, it.grams);
        const gIn = h('input', { type: 'text', inputmode: 'decimal', value: String(it.grams), 'aria-label': `${it.name} grams`, class: 'g-in' });
        gIn.addEventListener('change', () => { const v = parseFloat(gIn.value.replace(',', '.')); if (v > 0) { it.grams = v; draw(); } });
        return h('li', { class: it.on ? '' : 'off' },
          h('input', { type: 'checkbox', checked: it.on, 'aria-label': `Log ${it.name}`, onchange: (e) => { it.on = e.target.checked; draw(); } }),
          foodThumb(it.food, { photos: photosOn(), userPhoto: F().myPhotos[it.food.id] }),
          h('div', { class: 'grow-wrap' },
            h('div', {}, h('strong', {}, it.food.name), ' ', h('span', { class: `conf conf-${it.confidence}` }, it.confidence)),
            it.food.id.startsWith('ai:') ? h('div', { class: 'muted small' }, 'Not in the food list: Claude’s estimate') : h('div', { class: 'muted small' }, `Matched: ${sourceBadge(it.food).textContent}`),
            it.ingredients.length ? h('div', { class: 'muted small' }, `Seen: ${it.ingredients.map((i) => `${i.name} ${i.grams} g`).join(', ')}`) : null,
            h('div', { class: 'row' }, gIn, h('span', { class: 'muted' }, 'g'), h('span', { class: 'ai-kcal' }, `${k0.format(n.kcal)} kcal · P ${k0.format(n.p)} g`),
              h('button', {
                type: 'button', class: 'link small', onclick: async () => {
                  const r = await portionDialog(it.food, { grams: it.grams, meal, okLabel: 'Use' });
                  if (r && r !== 'delete') { it.food = r.food || it.food; it.grams = r.grams; it.on = true; draw(); }
                },
              }, it.food.ing ? 'Ingredients…' : 'Adjust…'))));
      }));
      const sel = items.filter((i) => i.on);
      total.textContent = `${k0.format(sum(sel.map((i) => scale(i.food.n, i.grams))).kcal)} kcal`;
      logBtn.textContent = sel.length ? `Log ${sel.length} item${sel.length > 1 ? 's' : ''}` : 'Nothing selected';
      logBtn.disabled = !sel.length;
    };
    logBtn.addEventListener('click', () => done(items.filter((i) => i.on)));
    draw();
    return h('div', { class: 'sheet-body' },
      h('div', { class: 'row' }, h('img', { src: result.photo, alt: 'Your photo', class: 'ai-photo' }), h('div', { class: 'grow-wrap' }, h('h2', {}, 'What Claude sees'), total)),
      result.items.length ? null : h('p', { class: 'warn' }, 'No food recognised.'),
      result.notes ? h('p', { class: 'muted small' }, result.notes) : null,
      list,
      h('p', { class: 'muted small' }, 'Amounts from a photo are estimates (often ±20–30%). Check the grams, especially oil and sauces you can’t see.'),
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'), logBtn));
  });
}

async function recognizeFlow(meal = defaultMeal()) {
  if (!await ensureAi()) return;
  const file = await pickPhoto();
  if (!file) return;
  const catalog = foodDb().filter((f) => f.where && f.where !== 'supermarket').map((f) => ({ id: f.id, name: f.name, fr: f.fr }));
  const stop = busy('Claude is looking at your photo…');
  let result;
  try {
    result = await recognizeFood(file, catalog, { apiKey: F().aiKey });
  } catch (err) {
    stop();
    toast(err instanceof RecognitionError ? err.message : 'Recognition failed. Try again.');
    if (err?.code === 'auth') { F().ai = false; await ctx.save(); }
    return;
  }
  stop();
  const chosen = await resultsDialog(result, meal);
  if (!chosen?.length) return;
  const ts = foodDay === dayKey() ? Date.now() : new Date(`${foodDay}T12:00`).getTime();
  for (const it of chosen) {
    remember(it.food);
    F().log.push({ ...cleanFood(it.food), id: uid(), day: foodDay, ts, grams: it.grams, meal });
  }
  await ctx.commit();
  toast(`Logged ${chosen.length} item${chosen.length > 1 ? 's' : ''}`);
}

// ---------- Scan & teach: on-device visual memory of your foods ----------
const FRAMES = 10;

/** Full-screen multi-view capture. Resolves {prints, thumb, blob} or null. */
function captureScan() {
  return new Promise((resolve) => {
    let stream = null; let running = true;
    const video = h('video', { playsinline: true, muted: true, autoplay: true, class: 'scan-video' });
    const status = h('p', { class: 'scan-status' }, 'Starting camera…');
    const bar = h('div', { class: 'progress scan-progress' }, h('div', { css: { width: '0%' } }));
    const startBtn = h('button', { class: 'btn primary big-btn', type: 'button', disabled: true }, 'Start scan');
    const photos = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const dlg = h('dialog', { class: 'scanner' });
    const finish = (val) => {
      running = false;
      stream?.getTracks().forEach((t) => t.stop());
      dlg.close(); dlg.remove();
      resolve(val);
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    const canvas = document.createElement('canvas');
    const snap = (src, size) => {
      const w = src.videoWidth || src.naturalWidth; const hgt = src.videoHeight || src.naturalHeight;
      const side = Math.min(w, hgt);
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(src, (w - side) / 2, (hgt - side) / 2, side, side, 0, 0, size, size);
      return canvas;
    };
    const toBlob = () => new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      const prints = []; let thumb = ''; let blob = null;
      for (let i = 0; i < FRAMES && running; i++) {
        status.textContent = i < FRAMES / 2 ? 'Move slowly to the left around the food…' : '…and now slowly to the right';
        prints.push(fingerprint(snap(video, 224)));
        if (i === Math.floor(FRAMES / 2)) { thumb = snap(video, 160).toDataURL('image/jpeg', 0.75); snap(video, 768); blob = await toBlob(); }
        bar.firstChild.style.setProperty('width', `${((i + 1) / FRAMES) * 100}%`);
        await new Promise((r) => setTimeout(r, 280));
      }
      if (running) { navigator.vibrate?.(60); finish({ prints, thumb, blob }); }
    });

    photos.addEventListener('change', async () => {
      const files = [...photos.files].slice(0, 6);
      if (!files.length) return;
      status.textContent = 'Reading photos…';
      try {
        await prepareScanner((t) => { status.textContent = t; });
        const prints = []; let thumb = ''; let blob = null;
        for (const f of files) {
          const url = URL.createObjectURL(f);
          const img = new Image(); img.src = url; await img.decode();
          prints.push(fingerprint(snap(img, 224)));
          if (!thumb) { thumb = snap(img, 160).toDataURL('image/jpeg', 0.75); snap(img, 768); blob = await toBlob(); }
          URL.revokeObjectURL(url);
        }
        finish({ prints, thumb, blob });
      } catch {
        status.textContent = "Couldn't read those photos.";
      }
    });

    dlg.append(
      h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-ring', 'aria-hidden': 'true' })),
      h('div', { class: 'scan-panel' },
        status, bar,
        startBtn,
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => photos.click() }, '🖼 Use photos instead'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, 'Cancel')),
        photos),
    );
    document.body.append(dlg);
    dlg.showModal();

    (async () => {
      try {
        await prepareScanner((t) => { status.textContent = t; });
      } catch {
        status.textContent = "The scanner couldn't load. Check your connection the first time you use it.";
        return;
      }
      if (globalThis.POCKET_STATS_HOSTED || !navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'Live camera is not available here. Use photos instead (2–6 from different angles).';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch {
        status.textContent = 'Camera permission was denied. You can use photos instead.';
        return;
      }
      if (!running) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      status.textContent = 'Put the food inside the circle, then press Start and move slowly around it.';
      startBtn.disabled = false;
    })();
  });
}

function scanResultsDialog(scan, ranked) {
  const lib = F().scans;
  const shown = ranked.map((r, i) => ({ ...r, conf: confidence(r.score, r.score - (ranked[i + 1]?.score ?? 0)) })).filter((r) => r.conf).slice(0, 3);
  return modal((done) => h('div', { class: 'sheet-body' },
    h('div', { class: 'row' }, h('img', { src: scan.thumb, alt: 'Your scan', class: 'ai-photo' }),
      h('div', { class: 'grow-wrap' }, h('h2', {}, shown.length ? 'Is it one of these?' : 'New food'),
        h('p', { class: 'muted small' }, Object.keys(lib).length
          ? `Compared with ${Object.keys(lib).length} food${Object.keys(lib).length > 1 ? 's' : ''} you've taught the app. Nothing left your phone.`
          : 'You haven’t taught the app any foods yet. Link this scan to a food and it will recognise it next time.'))),
    shown.length ? h('ul', { class: 'results' }, ...shown.map((r) => h('li', {},
      h('button', { class: 'result with-thumb', type: 'button', onclick: () => done({ type: 'match', id: r.id }) },
        foodThumb(r.rec.food, { photos: photosOn(), userPhoto: F().myPhotos[r.rec.food.id] }),
        h('span', { class: 'r-text' }, h('span', { class: 'r-name' }, r.rec.food.name),
          h('span', { class: 'r-meta' }, h('span', { class: `conf conf-${r.conf.level}` }, r.conf.label), ` · ${Math.round(r.score * 100)}% similar · taught ${r.rec.prints.length} views`)))))) : null,
    h('div', { class: 'stack' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => done({ type: 'link' }) }, shown.length ? '🔗 No: link it to another food' : '🔗 Link this scan to a food'),
      F().ai ? h('button', { class: 'btn ghost', type: 'button', onclick: () => done({ type: 'claude' }) }, '📸 Ask Claude what it is (sends this photo)') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, 'Cancel'))));
}

function pickOneDialog(items) {
  return modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, 'Which one did you scan?'),
    h('ul', { class: 'results' }, ...items.map((it) => resultRow(it.food, () => done(it)))),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, 'Cancel'))));
}

async function teachAndLog(food, scan, meal, gramsHint) {
  const r = await portionDialog(food, { meal, grams: gramsHint || undefined, okLabel: 'Log & remember' });
  if (!r || r === 'delete') return;
  const rec = learn(F().scans[food.id], food, scan.prints);
  rec.lastGrams = r.grams;
  F().scans[food.id] = rec;
  if (scan.thumb && !F().myPhotos[food.id] && !food.img) { F().myPhotos[food.id] = scan.thumb; await ctx.savePhoto(food.id, scan.thumb); }
  await ctx.saveScan(food.id, rec);
  await addEntry(r.food || food, r.grams, r.meal);
}

async function scanTeachFlow(meal = defaultMeal()) {
  const scan = await captureScan();
  if (!scan) return;
  const ranked = match(F().scans, scan.prints);
  const choice = await scanResultsDialog(scan, ranked);
  if (!choice) return;
  if (choice.type === 'match') {
    const rec = F().scans[choice.id];
    const fresh = foodDb().find((f) => f.id === rec.food.id) || rec.food; // latest values if it's from the food list
    return teachAndLog(fresh, scan, meal, rec.lastGrams);
  }
  if (choice.type === 'link') {
    let food = await searchDialog(meal);
    if (food === 'label') food = await labelDialog();
    if (food) return teachAndLog(food, scan, meal);
    return;
  }
  if (choice.type === 'claude') {
    if (!await ensureAi()) return;
    const stop = busy('Claude is looking at your scan…');
    let result;
    try {
      const catalog = foodDb().filter((f) => f.where && f.where !== 'supermarket').map((f) => ({ id: f.id, name: f.name, fr: f.fr }));
      result = await recognizeFood(scan.blob, catalog, { apiKey: F().aiKey });
    } catch (err) {
      stop(); toast(err instanceof RecognitionError ? err.message : 'Recognition failed. Try again.'); return;
    }
    stop();
    const catalogById = new Map(foodDb().map((f) => [f.id, f]));
    const items = result.items.map((x) => ({ ...x, food: (x.catalogId && catalogById.get(x.catalogId)) || { id: `ai:${uid()}`, name: x.name, source: 'Photo estimate', n: x.n, serving: x.grams || 100, servingLabel: `${x.grams || 100} g (from photo)`, emoji: '📸' } }));
    if (!items.length) { toast('Claude didn’t find food in this scan.'); return; }
    const it = items.length === 1 ? items[0] : await pickOneDialog(items);
    if (it) return teachAndLog(it.food, scan, meal, it.grams);
  }
}

async function browseFlow(meal = defaultMeal()) {
  const food = await browseDialog(meal);
  if (food) return pickAndLog(food, meal);
}

// ---------- flows ----------
async function pickAndLog(food, meal) {
  if (!food) return;
  const r = await portionDialog(food, { meal });
  if (r && r !== 'delete') await addEntry(r.food || food, r.grams, r.meal);
}

async function searchFlow(meal = defaultMeal()) {
  const res = await searchDialog(meal);
  if (res === 'label') { const f = await labelDialog(); return pickAndLog(f, meal); }
  return pickAndLog(res, meal);
}

async function scanFlow() {
  const raw = await scanBarcode();
  if (!raw) return;
  const code = canonicalBarcode(raw);
  const known = F().saved.find((s) => s.code && (s.code === code || s.code === raw));
  if (known) return pickAndLog(known);
  const local = F().moroccoDb ? (findByCode(code) || findByCode(raw)) : null;
  if (local) return pickAndLog(local);
  if (!await ensureOnline()) {
    toast(globalThis.POCKET_STATS_HOSTED ? `Barcode ${code} read. Enter its label once; next time this scan finds it instantly.` : 'Not in your saved foods. Enter it from the label instead.');
    return pickAndLog(await labelDialog({ code }));
  }
  toast('Looking up…');
  const { results, failed } = await lookupBarcode(code, F().usdaKey);
  if (!results.length) {
    toast(failed === 2 ? "Couldn't reach the databases. Enter it from the label." : 'Not in any database yet. Enter it from the label.');
    return pickAndLog(await labelDialog({ code }));
  }
  const choice = results.length === 1 ? results[0] : await chooseDialog(code, results);
  if (choice === 'label') return pickAndLog(await labelDialog({ code, name: results[0]?.name }));
  return pickAndLog(choice);
}

async function editEntry(e) {
  const r = await portionDialog(e, { grams: e.grams, meal: e.meal, edit: true });
  if (!r) return;
  if (r === 'delete') F().log = F().log.filter((x) => x !== e);
  else { e.grams = r.grams; e.meal = r.meal; }
  await ctx.commit();
}

// ---------- profile ----------
function profileDialog() {
  const p = F().profile || { sex: 'male', age: 25, heightCm: 178, weightKg: 75, activity: 1.55, goal: 'lean', units: 'metric', diet: 'omnivore' };
  return modal((done) => {
    let units = p.units;
    const sex = h('select', {}, h('option', { value: 'male', selected: p.sex === 'male' }, 'Male'), h('option', { value: 'female', selected: p.sex === 'female' }, 'Female'));
    const age = h('input', { type: 'text', inputmode: 'numeric', value: String(p.age) });
    const hA = h('input', { type: 'text', inputmode: 'decimal' }); const hB = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'in' });
    const w = h('input', { type: 'text', inputmode: 'decimal' });
    const hLabel = h('span', {}); const wLabel = h('span', {});
    const setUnits = (u, convert) => {
      if (convert) {
        const cur = read();
        units = u;
        fill(cur.heightCm, cur.weightKg);
      } else { units = u; fill(p.heightCm, p.weightKg); }
      seg.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.u === units));
    };
    const fill = (cm, kg) => {
      if (units === 'imperial') {
        const inches = (cm || 0) / 2.54;
        hA.value = String(Math.floor(inches / 12)); hB.value = String(Math.round(inches % 12)); hB.hidden = false;
        hA.placeholder = 'ft'; w.value = String(Math.round((kg || 0) / LB)); hLabel.textContent = 'Height (ft, in)'; wLabel.textContent = 'Weight (lb)';
      } else {
        hA.value = String(Math.round(cm || 0)); hB.hidden = true; hA.placeholder = 'cm';
        w.value = String(Math.round((kg || 0) * 10) / 10); hLabel.textContent = 'Height (cm)'; wLabel.textContent = 'Weight (kg)';
      }
    };
    const n = (el) => parseFloat(String(el.value).replace(',', '.'));
    const read = () => ({
      heightCm: units === 'imperial' ? ((n(hA) || 0) * 12 + (n(hB) || 0)) * 2.54 : n(hA),
      weightKg: units === 'imperial' ? n(w) * LB : n(w),
    });
    const seg = h('div', { class: 'chips seg2' },
      h('button', { type: 'button', class: 'chip', 'data-u': 'metric', onclick: () => setUnits('metric', true) }, 'kg / cm'),
      h('button', { type: 'button', class: 'chip', 'data-u': 'imperial', onclick: () => setUnits('imperial', true) }, 'lb / ft'));
    const activity = h('select', {}, ...Object.entries(ACTIVITY).map(([k, v]) => h('option', { value: k, selected: +k === p.activity }, v)));
    const goal = h('select', {}, ...Object.entries(GOALS).map(([k, v]) => h('option', { value: k, selected: k === p.goal }, v.label)));
    const diet = h('select', {}, h('option', { value: 'omnivore', selected: p.diet === 'omnivore' }, 'I eat everything'), h('option', { value: 'vegetarian', selected: p.diet === 'vegetarian' }, 'Vegetarian'));
    const err = h('p', { class: 'error', hidden: true });
    setUnits(units, false);
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        const { heightCm, weightKg } = read();
        const prof = normalizeFood({ profile: { sex: sex.value, age: n(age), heightCm, weightKg, activity: +activity.value, goal: goal.value, units, diet: diet.value } }).profile;
        if (!prof) { err.textContent = 'Check your age (13+), height and weight.'; err.hidden = false; return; }
        done(prof);
      },
    },
    h('h2', {}, 'Your body & goal'),
    h('p', { class: 'muted small' }, 'Used only to calculate your targets. Stored on this phone (encrypted if you set a passcode).'),
    seg,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, 'Sex'), sex),
      h('label', { class: 'field' }, h('span', {}, 'Age'), age),
      h('div', { class: 'field' }, hLabel, h('div', { class: 'row' }, hA, hB)),
      h('label', { class: 'field' }, wLabel, w)),
    h('label', { class: 'field' }, h('span', {}, 'Activity'), activity),
    h('label', { class: 'field' }, h('span', {}, 'Goal'), goal),
    h('label', { class: 'field' }, h('span', {}, 'Diet'), diet),
    err,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Calculate my targets')));
  });
}

function weightTracker() {
  return ctx.state.trackers.find((t) => t.type === 'number' && /^(body ?)?weight$/i.test(t.name));
}

async function editProfile() {
  const prof = await profileDialog();
  if (!prof) return;
  F().profile = prof;
  // Keep a Weight tracker so progress shows up in Insights and the goal check.
  const unit = prof.units === 'imperial' ? 'lb' : 'kg';
  let wt = weightTracker();
  if (!wt) {
    wt = { id: uid(), name: 'Weight', type: 'number', unit, agg: 'last', goal: null, color: '#5f6b7a' };
    ctx.state.trackers.push(wt);
  }
  const today = dayKey();
  if (!ctx.state.entries.some((e) => e.trackerId === wt.id && e.day === today)) {
    const v = wt.unit === 'lb' ? prof.weightKg / LB : prof.weightKg;
    ctx.state.entries.push({ id: uid(), trackerId: wt.id, day: today, value: Math.round(v * 10) / 10, ts: Date.now() });
  }
  await ctx.commit();
  toast('Targets updated');
}

// ---------- views ----------
function bar(label, val, target, cls, unit = 'g') {
  const pct = target ? Math.min(1, val / target) : 0;
  const over = target && val > target * 1.05;
  return h('div', { class: `mbar ${cls}` },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, label), h('span', { class: over ? 'warn' : '' }, `${k0.format(val)} / ${k0.format(target)} ${unit}`)),
    h('div', { class: 'progress' }, h('div', { css: { width: `${pct * 100}%` } })));
}

function summaryCard(t, tot) {
  const left = t.kcal - tot.kcal;
  return h('article', { class: 'card summary' },
    h('div', { class: 'kcal-row' },
      h('div', {}, h('div', { class: 'big' }, k0.format(tot.kcal)), h('div', { class: 'muted small' }, `of ${k0.format(t.kcal)} kcal`)),
      h('div', { class: 'right' }, h('div', { class: `big ${left < 0 ? 'warn' : ''}` }, k0.format(Math.abs(left))), h('div', { class: 'muted small' }, left >= 0 ? 'kcal left' : 'kcal over'))),
    h('div', { class: 'progress kcal' }, h('div', { css: { width: `${Math.min(100, (tot.kcal / t.kcal) * 100)}%` } })),
    bar('Protein', tot.p, t.protein, 'm-p'),
    bar('Carbs', tot.c, t.carbs, 'm-c'),
    bar('Fat', tot.f, t.fat, 'm-f'),
    h('p', { class: 'muted small' }, `Fiber ${k0.format(tot.fib)} g (aim for 25–38 g)`));
}

function viewDiary() {
  const p = F().profile;
  const today = dayKey();
  const entries = dayLog(foodDay);
  const tot = totals(entries);
  const t = p ? targets(p) : null;

  const nav = h('header', { class: 'day-nav' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => { foodDay = addDays(foodDay, -1); ctx.render(); } }, '‹'),
    h('div', { class: 'day-title' }, h('h1', {}, dayLabel(foodDay)),
      foodDay !== today ? h('button', { class: 'link', onclick: () => { foodDay = today; ctx.render(); } }, 'Back to today') : null),
    h('button', { class: 'icon-btn', 'aria-label': 'Next day', disabled: foodDay >= today, onclick: () => { foodDay = addDays(foodDay, 1); ctx.render(); } }, '›'));

  const actions = h('div', { class: 'scan-actions' },
    h('button', { class: 'btn primary big-btn', onclick: scanFlow }, h('span', { 'aria-hidden': 'true' }, '▥ '), 'Scan barcode'),
    h('button', { class: 'btn ghost big-btn', onclick: () => searchFlow() }, h('span', { 'aria-hidden': 'true' }, '⌕ '), 'Search food'),
    h('button', { class: 'btn ghost big-btn browse-btn', onclick: () => scanTeachFlow() }, h('span', { 'aria-hidden': 'true' }, '🔍 '), 'Scan & teach (on your phone)'),
    h('button', { class: 'btn ghost big-btn browse-btn', onclick: () => recognizeFlow() }, h('span', { 'aria-hidden': 'true' }, '📸 '), 'Recognise food from a photo'),
    F().moroccoDb ? h('button', { class: 'btn ghost big-btn browse-btn', onclick: () => browseFlow() }, h('span', { 'aria-hidden': 'true' }, '🇲🇦 '), 'Moroccan foods: supermarket, souk & street') : null);

  const setup = !p ? h('article', { class: 'card callout' },
    h('h2', {}, 'Set your goal'),
    h('p', { class: 'muted' }, 'Tell the app your body stats and goal (bulk, lean bulk, recomp or cut) and it will calculate calories and protein, and build a meal plan for you.'),
    h('button', { class: 'btn primary wide', onclick: editProfile }, 'Set up my targets')) : null;

  const meals = Object.entries(MEALS).map(([k, label]) => {
    const list = entries.filter((e) => e.meal === k).sort((a, b) => a.ts - b.ts);
    const mt = totals(list);
    return h('article', { class: 'card meal' },
      h('div', { class: 'tracker-head' }, h('h2', {}, label), h('span', { class: 'muted small' }, list.length ? `${k0.format(mt.kcal)} kcal · ${k0.format(mt.p)} g protein` : ''),
        h('button', { class: 'icon-btn small add', 'aria-label': `Add to ${label}`, onclick: () => searchFlow(k) }, '+')),
      list.length ? h('ul', { class: 'entries' }, ...list.map((e) => {
        const n = scale(e.n, e.grams);
        return h('li', {}, h('button', { class: 'entry', onclick: () => editEntry(e) },
          h('span', { class: 'grow' }, e.name, h('span', { class: 'muted small' }, ` · ${k0.format(e.grams)} g`)),
          h('span', { class: 'small' }, `${k0.format(n.kcal)} kcal`)));
      })) : null);
  });

  let sug = null;
  if (t && foodDay === today) {
    const rem = { kcal: t.kcal - tot.kcal, p: t.protein - tot.p };
    const list = suggestions(rem, p.diet === 'vegetarian');
    if (list.length) {
      sug = h('article', { class: 'card' },
        h('h2', {}, `${k0.format(rem.p)} g protein to go`),
        h('p', { class: 'muted small' }, 'Tap to add one of these:'),
        h('ul', { class: 'entries' }, ...list.map((s) => h('li', {}, h('button', { class: 'entry', onclick: () => pickAndLog(s.f) },
          h('span', { class: 'grow' }, s.f.name, h('span', { class: 'muted small' }, ` · ${s.grams} g`)),
          h('span', { class: 'small' }, `+${k0.format(s.n.p)} g P · ${k0.format(s.n.kcal)} kcal`))))));
    }
  }

  return [nav, setup, t ? summaryCard(t, tot) : h('article', { class: 'card' }, h('div', { class: 'big' }, `${k0.format(tot.kcal)} kcal`), h('p', { class: 'muted small' }, macroLine(tot))), actions, ...meals, sug];
}

const TIPS = {
  bulk: [
    'Eat in a steady surplus: aim to gain about 0.5–0.75% of body weight per week. Faster than that is mostly fat.',
    'Spread protein over 3–5 meals of roughly 0.4 g/kg each (e.g. 25–45 g).',
    'Train each muscle about twice a week and add weight or reps over time (progressive overload). Food builds muscle only with a training stimulus.',
    'Struggling to eat enough? Use liquid calories (milk, smoothies), nuts, oils and bigger carb portions around training.',
  ],
  lean: [
    'Aim to gain about 0.25–0.5% of body weight per week. Slower gain keeps fat low and still builds muscle well.',
    'Keep protein high (≈2 g/kg) and spread it across the day.',
    'Progressive overload is the main driver: log your lifts and beat them gradually.',
    'Sleep 7–9 hours. Poor sleep blunts muscle gain and raises hunger.',
  ],
  recomp: [
    'Eat at maintenance with high protein (≈2.2 g/kg). Works best for beginners or after a break.',
    'Expect the scale to barely move. Judge progress by strength, photos and waist measurements.',
    'Keep training hard and consistent; recomposition is slow but real.',
  ],
  cut: [
    'Lose about 0.5–1% of body weight per week to keep muscle.',
    'Keep protein high (≈2.2 g/kg) and keep lifting heavy to signal your body to keep muscle.',
    'Fill up on vegetables, fruit and lean protein; they’re very filling for few calories.',
  ],
};

function viewPlan() {
  const p = F().profile;
  if (!p) return [h('h1', {}, 'Plan'), h('article', { class: 'card callout' }, h('p', {}, 'Set your goal first, then you’ll get a meal plan sized to your targets.'), h('button', { class: 'btn primary wide', onclick: editProfile }, 'Set up my targets'))];
  const t = targets(p);
  const plan = buildPlan(p.diet, t);
  return [
    h('h1', {}, 'Your plan'),
    h('article', { class: 'card' },
      h('h2', {}, GOALS[p.goal].label),
      h('div', { class: 'stats four' },
        h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, k0.format(t.kcal)), h('div', { class: 'stat-l' }, 'kcal / day')),
        h('div', { class: 'stat m-p' }, h('div', { class: 'stat-v' }, `${t.protein} g`), h('div', { class: 'stat-l' }, 'protein')),
        h('div', { class: 'stat m-c' }, h('div', { class: 'stat-v' }, `${t.carbs} g`), h('div', { class: 'stat-l' }, 'carbs')),
        h('div', { class: 'stat m-f' }, h('div', { class: 'stat-v' }, `${t.fat} g`), h('div', { class: 'stat-l' }, 'fat'))),
      h('p', { class: 'muted small' }, `How: your body burns about ${k0.format(t.bmr)} kcal at rest (Mifflin–St Jeor) and about ${k0.format(t.tdee)} with your activity. `,
        `${p.goal === 'bulk' || p.goal === 'lean' ? 'A small surplus' : p.goal === 'cut' ? 'A moderate deficit' : 'Maintenance calories'} gives ${k0.format(t.kcal)}. Protein is ${GOALS[p.goal].protein} g per kg of body weight, fat at least 25% of calories, and carbs fill the rest to fuel training.`)),
    h('article', { class: 'card' },
      h('h2', {}, 'A sample day that hits your targets'),
      h('p', { class: 'muted small' }, `${macroLine(plan.n)}. Portions are cooked weights. Swap foods freely; the totals are what matter.`),
      ...plan.meals.map((m) => h('div', { class: 'plan-meal' },
        h('div', { class: 'row' }, h('h3', { class: 'grow' }, m.name), h('span', { class: 'muted small' }, `${k0.format(m.n.kcal)} kcal · ${k0.format(m.n.p)} g P`)),
        h('ul', { class: 'entries' }, ...m.rows.map((r) => h('li', {}, h('span', { class: 'grow' }, r.f.name), h('span', { class: 'small' }, `${r.grams} g`)))),
        h('button', {
          class: 'link small',
          onclick: async () => {
            foodDay = dayKey();
            const meal = { Breakfast: 'breakfast', Lunch: 'lunch', Dinner: 'dinner' }[m.name] || 'snack';
            for (const r of m.rows) F().log.push({ ...cleanFood(r.f), id: uid(), day: foodDay, ts: Date.now(), grams: r.grams, meal });
            await ctx.commit();
            toast(`${m.name} logged for today`);
          },
        }, `Log this ${m.name.toLowerCase()} today`)))),
    h('article', { class: 'card' },
      h('h2', {}, 'How to make it work'),
      h('ul', { class: 'bullets' }, ...TIPS[p.goal].map((x) => h('li', {}, x))),
      h('p', { class: 'muted small' }, 'Evidence-based general guidance for healthy adults, not medical advice. If you’re under 18, pregnant, have a medical condition or a history of disordered eating, check with a doctor or dietitian first.')),
  ];
}

function viewGoal() {
  const p = F().profile;
  if (!p) return [h('h1', {}, 'Progress'), h('article', { class: 'card callout' }, h('button', { class: 'btn primary wide', onclick: editProfile }, 'Set up my targets'))];
  const t = targets(p);
  const days = dayRange(dayKey(), 14);
  const daily = days.map((d) => { const l = dayLog(d); return l.length ? totals(l) : null; });
  const out = [h('h1', {}, 'Progress')];

  // Weight trend vs goal rate
  const wt = weightTracker();
  let check = h('p', { class: 'muted' }, 'Log your weight (Today tab → Weight) a few mornings a week. After two weeks you’ll see if you’re gaining at the right speed.');
  if (wt) {
    const w = series(ctx.state, wt, dayRange(dayKey(), 14)).map((v) => (v === null ? null : wt.unit === 'lb' ? v * LB : v));
    const a = w.slice(0, 7).filter((v) => v !== null); const b = w.slice(7).filter((v) => v !== null);
    if (a.length >= 2 && b.length >= 2) {
      const avgA = a.reduce((x, y) => x + y, 0) / a.length; const avgB = b.reduce((x, y) => x + y, 0) / b.length;
      const pct = ((avgB - avgA) / avgA) * 100;
      const [lo, hi] = GOALS[p.goal].weekly;
      const kgWeek = avgB - avgA;
      const shown = wt.unit === 'lb' ? `${k1.format(kgWeek / LB)} lb` : `${k1.format(kgWeek)} kg`;
      const adj = Math.round((Math.abs(pct < lo ? lo - pct : pct - hi) / 100) * avgB * 7700 / 7 / 50) * 50; // ≈7700 kcal per kg
      check = h('div', {},
        h('div', { class: 'big' }, `${pct >= 0 ? '+' : ''}${k1.format(pct)}% / week`),
        h('p', { class: 'muted small' }, `${pct >= 0 ? '+' : ''}${shown} this week (7-day average vs the week before). Target: ${lo}% to ${hi}% per week.`),
        h('p', { class: pct < lo || pct > hi ? 'warn' : 'ok' },
          pct < lo ? `Below target. Add about ${Math.max(100, adj)} kcal a day and check again next week.`
            : pct > hi ? `Faster than ideal. Trim about ${Math.max(100, adj)} kcal a day to keep it lean.`
              : '✓ Right on target. Keep going.'));
    }
  }
  out.push(h('article', { class: 'card' }, h('h2', {}, 'Am I on track?'), check));

  if (daily.some(Boolean)) {
    const logged = daily.filter(Boolean);
    const avg = sum(logged); const n = logged.length;
    out.push(h('article', { class: 'card', css: { '--c': '#c08a1e' } },
      h('h2', {}, 'Calories, last 14 days'),
      h('p', { class: 'muted small' }, `Average ${k0.format(avg.kcal / n)} of ${k0.format(t.kcal)} kcal on ${n} logged days.`),
      barChart({ days, values: daily.map((x) => x && x.kcal), color: '#c08a1e', goal: t.kcal, label: 'Calories per day' })));
    out.push(h('article', { class: 'card' },
      h('h2', {}, 'Protein, last 14 days'),
      h('p', { class: 'muted small' }, `Average ${k0.format(avg.p / n)} of ${t.protein} g. Hit on ${daily.filter((x) => x && x.p >= t.protein * 0.95).length} days.`),
      barChart({ days, values: daily.map((x) => x && x.p), color: '#b5523b', goal: t.protein, label: 'Protein per day' })));
  }

  const kg = p.weightKg;
  out.push(h('article', { class: 'card' },
    h('h2', {}, 'Your details'),
    h('p', { class: 'muted small' }, `${p.sex === 'female' ? 'Female' : 'Male'}, ${p.age} · `,
      p.units === 'imperial' ? `${Math.floor(p.heightCm / 30.48)}′${Math.round((p.heightCm / 2.54) % 12)}″ · ${k0.format(kg / LB)} lb` : `${k0.format(p.heightCm)} cm · ${k1.format(kg)} kg`,
      ` · ${ACTIVITY[p.activity]} · ${GOALS[p.goal].label}`),
    h('button', { class: 'btn ghost wide', onclick: editProfile }, 'Update weight, goal or details')));
  return out;
}

export function viewFood(c) {
  ctx = c;
  const seg = h('div', { class: 'chips seg seg3', role: 'tablist' }, ...[['diary', 'Diary'], ['plan', 'Plan'], ['goal', 'Progress']].map(([k, l]) => h('button', {
    class: `chip${k === sub ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === sub), onclick: () => { sub = k; ctx.render(); },
  }, l)));
  const body = sub === 'plan' ? viewPlan() : sub === 'goal' ? viewGoal() : viewDiary();
  return h('section', { class: 'food' }, seg, ...body);
}

export function resetFoodView() { foodDay = dayKey(); }

/** Settings card for online lookups. */
export function foodSettingsCard(c) {
  ctx = c;
  const key = h('input', { value: F().usdaKey, placeholder: 'Optional: your free USDA API key', maxlength: 64, autocomplete: 'off', 'aria-label': 'USDA API key' });
  return h('article', { class: 'card' },
    h('h2', {}, 'Food lookups'),
    globalThis.POCKET_STATS_HOSTED ? h('p', { class: 'muted small' }, 'Online lookups are switched off in the web-link version. Built-in foods (including Moroccan dishes), saved foods and label entry all work. Use the downloaded app for USDA and Open Food Facts lookups.') : null,
    globalThis.POCKET_STATS_HOSTED ? null : h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, 'Look up foods online', h('span', { class: 'muted small block' }, 'Sends only a barcode or search words to USDA and Open Food Facts. Off = built-in and saved foods only.')),
      h('input', { type: 'checkbox', role: 'switch', checked: F().online, onchange: async (e) => { F().online = e.target.checked; await ctx.commit(); } })),
    ...(globalThis.POCKET_STATS_HOSTED ? [] : [h('label', { class: 'field' }, h('span', {}, 'USDA API key'), key),
    h('p', { class: 'muted small' }, 'Without a key, USDA allows a limited number of searches per hour. A free key from api.data.gov raises that limit.'),
    h('button', {
      class: 'btn ghost', onclick: async () => {
        const v = key.value.trim();
        if (!/^[A-Za-z0-9]{0,64}$/.test(v)) { toast("That key doesn't look right."); return; }
        F().usdaKey = v; await ctx.commit(); toast('Saved');
      },
    }, 'Save key')]),
    h('h3', {}, 'Foods you’ve taught the scanner'),
    Object.keys(F().scans).length ? h('ul', { class: 'entries' }, ...Object.entries(F().scans).sort((a, b) => b[1].updated - a[1].updated).map(([id, rec]) => h('li', {},
      foodThumb(rec.food, { userPhoto: F().myPhotos[id] }),
      h('span', { class: 'grow' }, rec.food.name, h('span', { class: 'muted small block' }, `${rec.prints.length} views${rec.lastGrams ? ` · usually ${k0.format(rec.lastGrams)} g` : ''}`)),
      h('button', {
        class: 'icon-btn small', 'aria-label': `Forget ${rec.food.name}`, onclick: async () => {
          if (!await confirmDialog(`Forget ${rec.food.name}?`, 'The scanner will no longer recognise it. Your diary is not affected.', 'Forget', true)) return;
          delete F().scans[id]; await ctx.deleteScan(id); ctx.render();
        },
      }, '✕'))))
      : h('p', { class: 'muted small' }, 'None yet. Use “Scan & teach” in Food: scan a food, link it to its name, and next time the app recognises it on its own. Fingerprints stay on this phone, encrypted with your passcode.'),
    h('h3', {}, 'Photo recognition (Claude)'),
    h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, 'Recognise food from photos', h('span', { class: 'muted small block' },
        recognitionMode() === 'sample' ? 'Sends the photo you take to Claude through your claude.ai account. Nothing else is sent.' : 'Sends the photo you take to Anthropic with your API key. Nothing else is sent. A few US cents per photo.')),
      h('input', { type: 'checkbox', role: 'switch', checked: F().ai, onchange: async (e) => { if (e.target.checked) { if (!await ensureAi()) e.target.checked = false; } else { F().ai = false; await ctx.save(); } } })),
    recognitionMode() === 'api' && F().aiKey ? h('button', {
      class: 'btn ghost', onclick: async () => {
        if (!await confirmDialog('Remove API key?', 'Photo recognition turns off until you add a key again.', 'Remove', true)) return;
        F().aiKey = ''; F().ai = false; await ctx.commit();
      },
    }, 'Remove API key') : null,
    h('h3', {}, 'Moroccan food database'),
    h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, 'Use the Moroccan food list', h('span', { class: 'muted small block' }, 'Supermarket products plus souk, street and home foods. Downloaded from this app’s GitHub repo about once a week; it holds no personal data and nothing about you is sent.')),
      h('input', { type: 'checkbox', role: 'switch', checked: F().moroccoDb, onchange: async (e) => { F().moroccoDb = e.target.checked; await ctx.commit(); if (e.target.checked) loadFoodDb().catch(() => {}); } })),
    photosAvailable() ? h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, 'Show product photos', h('span', { class: 'muted small block' }, 'Each photo downloads from GitHub the first time you see it, then stays on your phone.')),
      h('input', { type: 'checkbox', role: 'switch', checked: F().photos, onchange: async (e) => { F().photos = e.target.checked; await ctx.commit(); } })) : null,
    F().moroccoDb ? h('p', { class: 'muted small' }, foodDb().length
      ? `${foodDb().length.toLocaleString()} foods · list from ${foodDbMeta().version || '?'} · checked ${new Date(foodDbMeta().fetched).toLocaleDateString()}`
      : 'Not downloaded yet.') : null,
    F().moroccoDb ? h('button', {
      class: 'btn ghost', onclick: async () => {
        toast('Updating food list…');
        try { const n = await loadFoodDb({ force: true }); toast(`Food list updated: ${n.toLocaleString()} foods`); ctx.render(); } catch { toast("Couldn't reach GitHub. Try again later."); }
      },
    }, 'Update food list now') : null,
    h('p', { class: 'muted small' }, `${F().saved.length} saved foods · ${F().log.length} diary entries`),
    F().saved.length ? h('button', {
      class: 'btn ghost', onclick: async () => {
        if (!await confirmDialog('Clear saved foods?', 'Your diary stays. Only the list of remembered products is cleared.', 'Clear', true)) return;
        F().saved = []; await ctx.commit();
      },
    }, 'Clear saved foods') : null);
}
