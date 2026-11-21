// Food tab: today's meals, calorie & macro diary, recipes, barcode scanner, food search.
import { h, uid, dayLabel, toast, modal, confirmDialog, langToggle, iconButton } from './ui.js';
import { t, tn, fmt, isAr, dateText } from './i18n.js';
import { icon } from './icons.js';
import { dayKey, addDays, dayRange, series } from './stats.js';
import { barChart } from './charts.js';
import { searchLocal } from './foods.js';
import {
  ACTIVITY, GOALS, targets, scale, sum, lookupBarcode, searchOnline, agreement, buildPlan, suggestions,
} from './nutrition.js';
import { scanBarcode, canonicalBarcode } from './scanner.js';
import { loadFoodDb, foodDb, foodDbMeta, findByCode, onFoodDb, foodThumb, photosAvailable, ingredientInfo, labelIngredients, LOCAL as DATA_BUILT_IN } from './fooddb.js';
import { recognizeFood, recognitionMode, preparePhoto, RecognitionError } from './recognize.js';
import { prepareScanner, fingerprint, learn, match, confidence, plateCoverage, addSize, estimateGrams, medianOf } from './foodscan.js';
import { freshMeals, normalizeMeals, setCustomRecipes } from './mealplan.js';
import { RECIPES } from './recipes.js';
import { viewMeals, viewRecipes, mealSettings, importStarters, closeRecipe } from './meals.js';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const LB = 0.45359237;

let sub = 'meals';
let foodDay = dayKey();
let ctx; // { state, commit, render, save, savePhoto, … }

const F = () => ctx.state.food;
const k0 = { format: (x) => fmt(x) };
const k1 = { format: (x) => fmt(x, 1) };

// ---------- data ----------
export const DEFAULT_PROFILE = { sex: 'male', age: 22, heightCm: 183, weightKg: 63, activity: 1.55, goal: 'lean', units: 'metric', diet: 'omnivore' };

export function freshFood() {
  return {
    profile: { ...DEFAULT_PROFILE }, log: [], saved: [], online: false, usdaKey: '', moroccoDb: true, photos: true, myPhotos: {}, scans: {}, ai: false, aiKey: '',
    meals: freshMeals(), recipePhotos: {}, myRecipes: [], avoid: ['zucchini'],
  };
}

const num = (x, lo, hi) => (Number.isFinite(+x) && +x >= lo && +x <= hi ? +x : null);
const str = (x, max) => String(x ?? '').slice(0, max);
const isImg = (v, max = 4e6) => typeof v === 'string' && /^data:image\/(jpeg|webp|png);base64,/.test(v) && v.length < max;

function cleanN(n) {
  if (!n) return null;
  const out = { kcal: num(n.kcal, 0, 1000), p: num(n.p, 0, 100), c: num(n.c, 0, 100), f: num(n.f, 0, 100), fib: num(n.fib, 0, 100) ?? 0 };
  return out.kcal === null || out.p === null || out.c === null || out.f === null ? null : out;
}

function cleanFood(x) {
  const n = cleanN(x?.n);
  if (!n || !x.name) return null;
  return {
    id: str(x.id || uid(), 60), name: str(x.name, 80), ar: str(x.ar, 80), brand: str(x.brand, 40), source: str(x.source, 30) || 'You',
    code: str(x.code, 14).replace(/\D/g, ''), n, serving: num(x.serving, 1, 5000) ?? 100, servingLabel: str(x.servingLabel, 30) || '100 g',
    img: /^img\/[\w/-]+\.(jpg|webp)$/.test(x.img || '') ? x.img : '', cat: str(x.cat, 40),
  };
}

/** Your own recipes: same shape as the built-in ones, checked field by field. */
function cleanRecipe(r) {
  if (!r || typeof r !== 'object' || !/^my:[\w-]{1,40}$/.test(r.id || '') || !['breakfast', 'shake', 'lunch', 'snack', 'pregym', 'dinner', 'drink'].includes(r.slot)) return null;
  const ing = (Array.isArray(r.ing) ? r.ing : []).slice(0, 40).map((x) => (Array.isArray(x) && typeof x[0] === 'string' && num(x[1], 0.1, 5000)
    ? [x[0].slice(0, 40), +x[1], { en: str(x[2]?.en, 60), ar: str(x[2]?.ar, 60), u: x[2]?.u === 'ml' ? 'ml' : undefined, n: num(x[2]?.n, 0.5, 50) ?? undefined }] : null)).filter(Boolean);
  if (!ing.length) return null;
  const steps = (lst) => (Array.isArray(lst) ? lst : []).slice(0, 20).map((s) => str(s, 400)).filter(Boolean);
  return {
    id: r.id, slot: r.slot, name: str(r.name, 80) || str(r.ar, 80), ar: str(r.ar, 80), min: num(r.min, 1, 600) ?? 20, tags: [], batch: r.batch === true,
    eggs: ing.filter(([id]) => id === 'egg').reduce((n, [, g]) => n + g / 50, 0), serves: num(r.serves, 1, 20) ?? 1, ing,
    steps: { en: steps(r.steps?.en), ar: steps(r.steps?.ar) }, mine: true,
  };
}

/** A valid profile, or null. */
function cleanProfile(p) {
  if (!p || !GOALS[p.goal] || !ACTIVITY[p.activity]) return null;
  const prof = {
    sex: p.sex === 'female' ? 'female' : 'male', age: num(p.age, 13, 110), heightCm: num(p.heightCm, 100, 250), weightKg: num(p.weightKg, 30, 350),
    activity: +p.activity, goal: p.goal, units: p.units === 'imperial' ? 'imperial' : 'metric', diet: p.diet === 'vegetarian' ? 'vegetarian' : 'omnivore',
  };
  return prof.age && prof.heightCm && prof.weightKg ? prof : null;
}

export function normalizeFood(raw) {
  const out = freshFood();
  if (!raw || typeof raw !== 'object') return out;
  out.profile = cleanProfile(raw.profile) || out.profile;
  for (const e of Array.isArray(raw.log) ? raw.log : []) {
    const food = cleanFood(e);
    if (!food || !/^\d{4}-\d{2}-\d{2}$/.test(e.day) || !num(e.grams, 0.1, 10000)) continue;
    out.log.push({
      ...food, id: str(e.id || uid(), 40), day: e.day, ts: Number.isFinite(+e.ts) ? +e.ts : Date.now(), grams: +e.grams, meal: MEALS.includes(e.meal) ? e.meal : 'snack',
      recipe: typeof e.recipe === 'string' ? e.recipe.slice(0, 60) : undefined, slot: typeof e.slot === 'string' ? e.slot.slice(0, 20) : undefined,
    });
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
      const prints = (Array.isArray(r?.prints) ? r.prints : []).filter((x) => Number.isFinite(+x?.s) && typeof x?.q === 'string' && x.q.length <= 2400).slice(-40);
      const sizes = (Array.isArray(r?.sizes) ? r.sizes : []).filter((x) => num(x?.c, 0.01, 1) && num(x?.g, 1, 5000)).slice(-12).map((x) => ({ c: +x.c, g: +x.g }));
      if (food && prints.length) out.scans[String(k).slice(0, 60)] = { food, prints, sizes, lastGrams: num(r.lastGrams, 1, 5000), updated: Number.isFinite(+r.updated) ? +r.updated : 0 };
    }
  }
  if (raw.myPhotos && typeof raw.myPhotos === 'object') {
    for (const [k, v] of Object.entries(raw.myPhotos).slice(0, 300)) if (isImg(v, 400000)) out.myPhotos[String(k).slice(0, 60)] = v;
  }
  out.myRecipes = (Array.isArray(raw.myRecipes) ? raw.myRecipes : []).map(cleanRecipe).filter(Boolean).slice(0, 200);
  setCustomRecipes(out.myRecipes);
  const ids = new Set([...RECIPES.map((r) => r.id), ...out.myRecipes.map((r) => r.id)]);
  out.meals = normalizeMeals(raw.meals, ids);
  if (raw.recipePhotos && typeof raw.recipePhotos === 'object') {
    for (const [k, v] of Object.entries(raw.recipePhotos).slice(0, 300)) {
      if (!v || !isImg(v.edited) || !isImg(v.thumb, 300000)) continue;
      out.recipePhotos[String(k).slice(0, 60)] = {
        edited: v.edited, thumb: v.thumb, orig: isImg(v.orig, 8e6) ? v.orig : '', mask: isImg(v.mask) ? v.mask : '',
        edit: v.edit && typeof v.edit === 'object' ? JSON.parse(JSON.stringify(v.edit)) : null, made: v.made !== false, starter: v.starter === true, ts: +v.ts || 0,
      };
    }
  }
  out.avoid = Array.isArray(raw.avoid) ? raw.avoid.filter((x) => typeof x === 'string').slice(0, 30) : out.avoid;
  out.usdaKey = /^[A-Za-z0-9]{0,64}$/.test(raw.usdaKey || '') ? raw.usdaKey || '' : '';
  return out;
}

const dayLog = (day) => F().log.filter((e) => e.day === day);
const totals = (list) => sum(list.map((e) => scale(e.n, e.grams)));

// ---------- names ----------
const CAT_KEYS = {
  'Other groceries': 'groceries', 'Chocolate & sweets': 'sweets', Dairy: 'dairy', 'Biscuits & cakes': 'biscuits', Drinks: 'drinks', 'Bread & cereals': 'bread-cereals',
  'Canned & ready meals': 'canned', 'Chips & snacks': 'chips', 'Oils & fats': 'oils', 'Meat & fish': 'meat-fish', Water: 'water', 'Fruit & vegetables': 'fruit-veg',
  Vegetables: 'vegetables', Fruit: 'fruit', Dishes: 'dishes', 'Meat, fish & eggs': 'meat-fish-eggs', 'Sweets & pastries': 'pastries', Bread: 'bread', Sandwiches: 'sandwiches',
  'Nuts & seeds': 'nuts', 'Legumes & grains': 'legumes', 'Olives & oils': 'olives', Soups: 'soups', 'Street snacks': 'street-snacks', Grills: 'grills', Salads: 'salads', Sweet: 'sweet',
};
export const catName = (c) => (CAT_KEYS[c] ? t(`cat.${CAT_KEYS[c]}`) : c);

/** A food's name in your language. Packaged products keep the name printed on the pack. */
export function foodName(food) {
  if (!food) return '';
  // (packaged products keep their printed name; see nameLang)
  if (isAr()) {
    if (food.ar) return food.ar;
    if (food.recipeName) return food.recipeName.ar || food.name;
  }
  return food.name;
}
/** Second line: the other language, or for packaged products in Arabic the category. */
// Serving sizes: common ones translated; any other printed label becomes "1 serving (N g)" in Arabic
const SERVING_AR = {
  '1 bowl': 'زلافة', '1 can': 'حكة', '1 cup': 'كاس', '1 cup dry': 'كاس ناشف', '1 date': 'تمرة', '1 fillet': 'فيلي', '1 glass': 'كاس', '1 handful': 'قبضة',
  '1 large egg': 'بيضة كبيرة', '1 large white': 'بياض بيضة كبيرة', '1 medium': 'وحدة متوسطة', '1 oz': 'أونصة', '1 piece': 'طرف', '1 plate': 'طبسيل', '1 portion': 'حصة',
  '1 pot': 'بوط', '1 scoop': 'مغرفة', '1 slice': 'طرف', '1 steak': 'ستيك', '1 tbsp': 'معلقة كبيرة', '1 thigh': 'فخذ', '1 tortilla': 'تورتيا', '2 squares': 'جوج مربعات',
  '2 tbsp': 'جوج معالق كبار', '4 skewers': '4 قضبان', '8 olives': '8 زيتونات', 'small box': 'علبة صغيرة', '¼ cup': 'ربع كاس', '¼ loaf': 'ربع خبزة', '½ avocado': 'نص لافوكا',
  '½ block': 'نص قالب', '½ cup': 'نص كاس', '1 egg': 'بيضة', '1 clove': 'فص', '1 fruit': 'حبة', '1 lemon': 'حامضة', '1 bun': 'خبيزة', '1 sandwich': 'صندويتش', '1 cookie': 'بيسكويتة',
};
function servingText(food) {
  const l = food.servingLabel || '';
  if (!isAr() || /^[\d.,]+ ?(g|ml)$/i.test(l)) return l.replace(/\bg\b/, t('unit.g')).replace(/\bml\b/, t('unit.ml'));
  return SERVING_AR[l] || t('food.servingN', { g: fmt(food.serving) });
}

const altLang = (food) => (isAr() ? (food.ar ? 'en' : 'ar') : 'ar');
function foodAlt(food) {
  if (isAr()) return food.ar ? food.name : food.cat ? catName(food.cat) : '';
  return food.ar || '';
}

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

async function addEntry(food, grams, meal, extra = {}) {
  if (!food.recipe) remember(food);
  const ts = foodDay === dayKey() ? Date.now() : new Date(`${foodDay}T12:00`).getTime();
  const entry = { ...cleanFood(food), id: uid(), day: extra.day || foodDay, ts, grams, meal, ...extra };
  F().log.push(entry);
  await ctx.commit();
  toast(t('food.added', { name: foodName(food), kcal: fmt(scale(food.n, grams).kcal) }));
  return entry;
}

function defaultMeal() {
  const hr = new Date().getHours();
  return hr < 11 ? 'breakfast' : hr < 15 ? 'lunch' : hr < 21 ? 'dinner' : 'snack';
}

// ---------- privacy consent ----------
async function ensureOnline() {
  if (globalThis.POCKET_STATS_HOSTED) {
    toast(t('online.hosted'));
    return false;
  }
  if (F().online) return true;
  const ok = await modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, t('online.q')),
    h('p', {}, t('online.intro')),
    h('ul', { class: 'bullets' },
      h('li', {}, h('b', {}, 'USDA FoodData Central'), ` (${t('online.usda')})`),
      h('li', {}, h('b', {}, 'Open Food Facts'), ` (${t('online.off')})`)),
    h('p', {}, t('online.sent')),
    h('p', { class: 'muted small' }, t('online.saved')),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => done(false) }, t('notNow')),
      h('button', { class: 'btn primary', onclick: () => done(true) }, t('online.allow')))));
  if (ok) { F().online = true; await ctx.commit(); }
  return ok;
}

// ---------- dialogs ----------
const SOURCE_KEYS = { 'Open Food Facts': 'off', USDA: 'usda', Estimate: 'est', Recipe: 'rec', 'Photo estimate': 'ai', You: 'you', 'My recipe': 'rec' };
function sourceBadge(food) {
  const cls = SOURCE_KEYS[food.source] || 'you';
  return h('span', { class: `src src-${cls}`, title: ['est', 'rec', 'ai'].includes(cls) ? t(`src.${cls}.tip`) : null }, t(`src.${cls}`));
}

function macroLine(n) {
  return t('food.macroLine', { kcal: fmt(n.kcal), p: fmt(n.p, 1), c: fmt(n.c, 1), f: fmt(n.f, 1) });
}

const MULTS = [[0, 'mult.none'], [0.5, 'mult.half'], [1, 'mult.normal'], [2, 'mult.double']];

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

const ingName = (id) => { const i = ingredientInfo(id); return i ? (isAr() && i.ar ? i.ar : i.name.split(' (')[0]) : id; };

function modsLabel(food, mult) {
  return Object.entries(mult).filter(([, m]) => m !== 1).map(([id, m]) => t(m === 0 ? 'mods.no' : m === 0.5 ? 'mods.half' : 'mods.double', { name: ingName(id) })).join(isAr() ? '، ' : ', ');
}

/** Add or replace your own photo of a food. Stored privately (encrypted with your passcode). */
async function addMyPhoto(food, box) {
  const input = h('input', { type: 'file', accept: 'image/*' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const { dataUrl } = await preparePhoto(file, 320);
      F().myPhotos[food.id] = dataUrl;
      await ctx.savePhoto(food.id, dataUrl);
      box.replaceWith(foodThumb(food, { size: 'lg', userPhoto: dataUrl }));
      toast(t('photo.saved'));
    } catch {
      toast(t('photo.unreadable'));
    }
  });
  input.click();
}

const mealSelect = (m0) => h('select', { 'aria-label': t('food.meal') }, ...MEALS.map((k) => h('option', { value: k, selected: k === (m0 || defaultMeal()) }, t(`meal.${k}`))));

function portionDialog(food, { grams: g0, meal: m0, edit = false, okLabel, note } = {}) {
  return modal((done) => {
    const mult = {};
    const hasRecipe = Array.isArray(food.ing) && food.ing.length && food.ing.every(([id]) => ingredientInfo(id));
    const grams = h('input', { type: 'text', inputmode: 'decimal', value: String(g0 ?? food.serving), 'aria-label': t('food.gramsAmount'), autofocus: true });
    const meal = mealSelect(m0);
    const preview = h('div', { class: 'preview' });
    const ingList = h('ul', { class: 'ing-list' });
    const val = () => parseFloat(grams.value.replace(',', '.'));
    const changed = () => hasRecipe && Object.keys(mult).length > 0;
    const currentN = () => (changed() ? recipeN(food, mult) : food.n);
    const update = () => {
      const g = val();
      if (!(g > 0)) { preview.replaceChildren(h('span', { class: 'muted' }, t('food.enterAmount'))); return; }
      const n = scale(currentN(), g);
      const base = scale(food.n, g);
      const diff = changed() ? Math.round(n.kcal - base.kcal) : 0;
      preview.replaceChildren(
        h('div', { class: 'big' }, t('food.kcalN', { n: fmt(n.kcal) }),
          diff ? h('span', { class: `delta ${diff < 0 ? 'ok' : 'warn'}` }, ` ${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} ${t('food.vsUsual')}`) : null),
        h('div', { class: 'macros' },
          h('span', { class: 'm-p' }, t('food.pG', { n: fmt(n.p, 1) })), h('span', { class: 'm-c' }, t('food.cG', { n: fmt(n.c, 1) })), h('span', { class: 'm-f' }, t('food.fG', { n: fmt(n.f, 1) }))));
      if (hasRecipe) {
        ingList.replaceChildren(...food.ing.map(([id, per100]) => {
          const info = ingredientInfo(id);
          const m = mult[id] ?? 1;
          const ig = (per100 * g) / 100;
          const kcal = (info.n.kcal * ig * m) / 100;
          const nm = isAr() && info.ar ? info.ar : info.name;
          return h('li', { class: m === 0 ? 'removed' : '' },
            h('span', { class: 'ing-name' }, nm, h('span', { class: 'muted small block' }, t('food.gKcal', { g: fmt(ig * m), kcal: fmt(kcal) }))),
            h('span', { class: 'ing-mult', role: 'group', 'aria-label': t('food.amountOf', { name: nm }) }, ...MULTS.map(([v, l]) => h('button', {
              type: 'button', class: `mult${m === v ? ' on' : ''}`, 'aria-pressed': String(m === v),
              onclick: () => { if (v === 1) delete mult[id]; else mult[id] = v; update(); },
            }, t(l)))));
        }));
      }
    };
    grams.addEventListener('input', update);
    const quick = [
      [food.servingLabel !== '100 g' ? servingText(food) : null, food.serving],
      [t('food.halfServing'), food.serving / 2], [t('food.twoServings'), food.serving * 2], [t('food.g100'), 100],
    ].filter(([l]) => l).map(([l, g], i) => h('button', { type: 'button', class: 'chip', onclick: () => { grams.value = String(Math.round(g * 10) / 10); update(); } }, i === 0 && !/\d+ ?(g|غ)\b/.test(l) && !/\(/.test(l) ? `${l} (${fmt(g)} ${t('unit.g')})` : l));
    update();
    const thumb = foodThumb(food, { size: 'lg', photos: photosOn(), userPhoto: F().myPhotos[food.id] });
    const alt = foodAlt(food);
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        const g = val();
        if (!(g > 0 && g < 10000)) return;
        let chosen = food;
        const label = hasRecipe ? modsLabel(food, mult) : '';
        if (label) chosen = { ...food, id: `${food.id}~${uid().slice(0, 6)}`, name: `${food.name} (${label})`.slice(0, 80), ar: food.ar ? `${food.ar} (${label})`.slice(0, 80) : '', n: recipeN(food, mult), ing: null };
        done({ grams: g, meal: meal.value, food: chosen });
      },
    },
    h('div', { class: 'portion-head' },
      h('div', { class: 'thumb-col' }, thumb,
        h('button', { type: 'button', class: 'link small row', onclick: () => addMyPhoto(food, thumb) }, icon('camera', 'icon-sm'), F().myPhotos[food.id] ? t('photo.change') : t('photo.add'))),
      h('div', { class: 'grow-wrap' },
        h('h2', { lang: isAr() && !food.ar ? 'fr' : null }, foodName(food)),
        alt ? h('p', { class: 'muted small' }, h('bdi', { lang: altLang(food) }, alt)) : null,
        h('p', { class: 'muted small' }, food.brand ? h('span', { lang: 'fr' }, `${food.brand} · `) : '', food.qty ? `${food.qty} · ` : '', sourceBadge(food),
          food.where ? ` · ${t(`where.${food.where}`)}` : ''))),
    h('p', { class: 'muted small' }, t('food.per100', { line: macroLine(food.n) })),
    note ? h('p', { class: 'tip small' }, note) : null,
    h('div', { class: 'chips' }, ...quick),
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', {}, t('food.grams')), grams), h('label', { class: 'field grow' }, h('span', {}, t('food.meal')), meal)),
    preview,
    hasRecipe ? h('details', { class: 'ing-box', open: true },
      h('summary', {}, t('food.ingInPortion')),
      h('p', { class: 'muted small' }, t('food.ingHint')),
      ingList) : null,
    !hasRecipe && food.hasLabelIngredients ? h('details', {
      class: 'ing-box',
      ontoggle: async (e) => {
        const box = e.currentTarget;
        if (!box.open || box.dataset.loaded) return;
        box.dataset.loaded = '1';
        const text = box.querySelector('.label-ing');
        try { text.textContent = (await labelIngredients(food)) || t('food.notAvailable'); } catch { text.textContent = t('food.ingLoadFail'); delete box.dataset.loaded; }
      },
    },
    h('summary', {}, t('food.labelIng')),
    h('p', { class: 'small label-ing', lang: 'fr' }, t('loading')),
    h('p', { class: 'muted small' }, t('food.packaged'))) : null,
    h('div', { class: 'row end' },
      edit ? h('button', { type: 'button', class: 'btn danger', onclick: () => done('delete') }, t('delete')) : null,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, okLabel || (edit ? t('save') : t('add')))));
  });
}

/** Manual entry straight from a nutrition label. Values can be per 100 g or per serving. */
function labelDialog({ code = '', name = '' } = {}) {
  return modal((done) => {
    const f = (ph, extra = {}) => h('input', { type: 'text', inputmode: 'decimal', placeholder: ph, ...extra });
    const nm = h('input', { value: name, placeholder: t('label.namePh'), maxlength: 80, autofocus: true, required: true });
    const basis = h('select', {}, h('option', { value: 'serving' }, t('label.perServing')), h('option', { value: '100' }, t('label.per100')));
    const sg = f(t('label.egServing'));
    const kcal = f(t('unit.kcal')); const p = f(t('unit.g')); const c = f(t('unit.g')); const fat = f(t('unit.g')); const fib = f(t('label.gOptional'));
    const sgWrap = h('label', { class: 'field' }, h('span', {}, t('label.servingSize')), sg);
    basis.addEventListener('change', () => { sgWrap.hidden = basis.value === '100'; });
    const err = h('p', { class: 'error', hidden: true });
    const v = (el) => parseFloat(el.value.replace(',', '.'));
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        const per = basis.value === '100' ? 100 : v(sg);
        const vals = [v(kcal), v(p), v(c), v(fat)];
        if (!(per > 0) || vals.some((x) => !(x >= 0))) { err.textContent = t('label.fillAll'); err.hidden = false; return; }
        const k = 100 / per;
        const food = cleanFood({
          id: `you:${uid()}`, code, name: nm.value.trim(), source: 'You',
          n: { kcal: vals[0] * k, p: vals[1] * k, c: vals[2] * k, f: vals[3] * k, fib: (v(fib) || 0) * k },
          serving: per, servingLabel: basis.value === '100' ? '100 g' : `1 × ${per} g`,
        });
        if (!food) { err.textContent = t('label.looksOff'); err.hidden = false; return; }
        done(food);
      },
    },
    h('h2', {}, t('label.title')),
    h('p', { class: 'muted small' }, code ? t('label.codeRemembered', { code }) : t('label.copy')),
    h('label', { class: 'field' }, h('span', {}, t('tr.name')), nm),
    h('label', { class: 'field' }, h('span', {}, t('label.valuesAre')), basis),
    sgWrap,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('macro.kcal')), kcal),
      h('label', { class: 'field' }, h('span', {}, t('macro.protein')), p),
      h('label', { class: 'field' }, h('span', {}, t('macro.carbs')), c),
      h('label', { class: 'field' }, h('span', {}, t('macro.fat')), fat),
      h('label', { class: 'field' }, h('span', {}, t('macro.fiber')), fib)),
    err,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('label.save'))));
  });
}

const WHERE = ['supermarket', 'souk', 'street', 'cafe', 'bakery', 'home'];
const photosOn = () => F().photos !== false;

function resultRow(food, onPick) {
  const alt = foodAlt(food);
  return h('li', {},
    h('button', { class: 'result with-thumb', type: 'button', onclick: () => onPick(food) },
      foodThumb(food, { photos: photosOn(), userPhoto: F().myPhotos[food.id] }),
      h('span', { class: 'r-text' },
        h('span', { class: 'r-name' }, h('span', { lang: isAr() && !food.ar ? 'fr' : null }, foodName(food)), food.brand ? h('span', { class: 'muted', lang: 'fr' }, ` · ${food.brand}`) : null,
          alt ? h('bdi', { class: 'r-ar', lang: altLang(food) }, alt) : null),
        h('span', { class: 'r-meta' }, sourceBadge(food), food.where ? ` ${t(`where.${food.where}`)} ·` : '', ` ${t('food.per100short', { kcal: fmt(food.n.kcal), p: fmt(food.n.p, 1) })}`))));
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

/** Search sheet. Built-in + saved foods instantly; online sources on request. */
function searchDialog(meal) {
  return modal((done) => {
    const q = h('input', { type: 'search', placeholder: t('search.ph'), 'aria-label': t('search.label'), autofocus: true, enterkeyhint: 'search' });
    const list = h('ul', { class: 'results' });
    const online = h('ul', { class: 'results' });
    const status = h('p', { class: 'muted small' });
    const pick = (food) => done(food);
    const local = () => {
      const res = dedupe(searchLocal(q.value, F().moroccoDb ? foodDb() : [], F().saved)).slice(0, 30);
      list.replaceChildren(...res.map((f) => resultRow(f, pick)));
      if (!q.value.trim()) {
        const recent = F().saved.slice(0, 8);
        list.replaceChildren(...(recent.length ? [h('li', { class: 'muted small label' }, t('search.recent')), ...recent.map((f) => resultRow(f, pick))] : []));
      }
    };
    const goOnline = async () => {
      const term = q.value.trim();
      if (!term) { q.focus(); return; }
      if (!await ensureOnline()) return;
      status.textContent = t('search.online');
      online.replaceChildren();
      const { results, failed } = await searchOnline(term, F().usdaKey);
      status.textContent = results.length
        ? `${tn('search.nResults', results.length)}${failed ? ` ${t('search.oneFailed')}` : ''}`
        : failed === 2 ? t('search.unreachable') : t('search.noResults');
      online.replaceChildren(...results.map((f) => resultRow(f, pick)));
    };
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(local, 120); }); // wait for a pause in typing
    local();
    return h('div', { class: 'sheet-body search' },
      h('h2', {}, t('search.addTo', { meal: t(`meal.${meal}`) })),
      h('form', { onsubmit: (e) => { e.preventDefault(); goOnline(); } }, q),
      list,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost', type: 'button', onclick: goOnline }, icon('globe', 'icon-sm'), t('search.onlineBtn')),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => done('label') }, icon('label', 'icon-sm'), t('search.fromLabel'))),
      status, online,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, t('close'))));
  });
}

function chooseDialog(code, results) {
  const agree = agreement(results);
  return modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, t('bc.found')),
    h('p', { class: 'muted small' }, t('bc.code', { code })),
    agree ? h('p', { class: agree.agree ? 'ok' : 'warn' }, agree.agree
      ? t('bc.agree', { n: fmt(results.length), lo: fmt(agree.lo), hi: fmt(agree.hi) })
      : t('bc.disagree', { lo: fmt(agree.lo), hi: fmt(agree.hi) })) : null,
    h('ul', { class: 'results' }, ...results.map((f) => resultRow(f, done))),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => done('label') }, t('bc.noneMatch')),
      h('button', { class: 'btn ghost', onclick: () => done(null) }, t('cancel')))));
}

/** Catalogue of Moroccan foods, by where they're sold. */
function browseDialog(meal) {
  return modal((done) => {
    let where = 'supermarket'; let cat = ''; let limit = 40;
    const q = h('input', { type: 'search', placeholder: t('browse.filterPh'), 'aria-label': t('browse.filter') });
    const whereChips = h('div', { class: 'chips' });
    const catChips = h('div', { class: 'chips cats' });
    const list = h('ul', { class: 'results' });
    const status = h('p', { class: 'muted small' });
    const more = h('button', { class: 'btn ghost wide', type: 'button', hidden: true, onclick: () => { limit += 60; draw(); } }, t('showMore'));
    const draw = () => {
      const all = foodDb();
      if (!all.length) { list.replaceChildren(); return; }
      whereChips.replaceChildren(...WHERE.filter((k) => all.some((f) => f.where === k)).map((k) => h('button', {
        type: 'button', class: `chip${k === where ? ' on' : ''}`, onclick: () => { where = k; cat = ''; limit = 40; draw(); },
      }, t(`where.${k}`))));
      const inWhere = all.filter((f) => f.where === where);
      const cats = [...new Set(inWhere.map((f) => f.cat).filter(Boolean))].sort();
      catChips.replaceChildren(...['', ...cats].map((c) => h('button', {
        type: 'button', class: `chip small${c === cat ? ' on' : ''}`, onclick: () => { cat = c; limit = 40; draw(); },
      }, c ? catName(c) : t('all'))));
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const shown = inWhere.filter((f) => (!cat || f.cat === cat) && words.every((w) => f.hay.includes(w)));
      list.replaceChildren(...shown.slice(0, limit).map((f) => resultRow(f, done)));
      more.hidden = shown.length <= limit;
      status.textContent = tn('browse.nFoods', shown.length);
    };
    let timer = 0;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { limit = 40; draw(); }, 120); });
    const off = onFoodDb(draw);
    const close = (v) => { off(); done(v); };
    if (!foodDb().length) {
      status.textContent = t('browse.loading');
      loadFoodDb({ force: true }).then(draw).catch(() => { status.textContent = t('browse.loadFail'); });
    }
    draw();
    return h('div', { class: 'sheet-body search browse' },
      h('h2', {}, t('browse.title', { meal: t(`meal.${meal}`) })),
      whereChips, catChips, q, status, list, more,
      h('p', { class: 'muted small' }, t('browse.attribution')),
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, t('close'))));
  });
}

// ---------- photo recognition ----------
async function ensureAi() {
  const hosted = recognitionMode() === 'sample';
  if (F().ai && (hosted || F().aiKey)) return true;
  const key = h('input', { type: 'password', value: F().aiKey, placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': t('ai.keyLabel'), dir: 'ltr' });
  const err = h('p', { class: 'error', hidden: true });
  const ok = await modal((done) => h('form', {
    class: 'sheet-body',
    onsubmit: (e) => {
      e.preventDefault();
      if (!hosted && !/^sk-ant-[\w-]{10,}$/.test(key.value.trim())) { err.textContent = t('ai.keyInvalid'); err.hidden = false; return; }
      done(true);
    },
  },
  h('h2', {}, t('ai.title')),
  h('p', {}, t('ai.intro')),
  h('div', { class: 'alert warnbox' },
    h('strong', {}, t('ai.sends')),
    h('p', {}, hosted ? t('ai.sendsHosted') : t('ai.sendsApi'))),
  hosted ? null : h('label', { class: 'field' }, h('span', {}, t('ai.keyLabel')), key),
  hosted ? null : h('p', { class: 'muted small' }, t('ai.keyHelp')),
  err,
  h('div', { class: 'row end' },
    h('button', { type: 'button', class: 'btn ghost', onclick: () => done(false) }, t('notNow')),
    h('button', { type: 'submit', class: 'btn primary' }, t('turnOn')))));
  if (!ok) return false;
  F().ai = true;
  if (!hosted) F().aiKey = key.value.trim();
  await ctx.save();
  return true;
}

export function pickPhoto({ camera = true } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : null });
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.click();
  });
}

export function busy(text) {
  let close;
  modal((done) => { close = done; return h('div', { class: 'sheet-body center' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, text)); });
  return () => close(null);
}

const aiFood = (x) => ({ id: `ai:${uid()}`, name: x.name, source: 'Photo estimate', n: x.n, serving: x.grams || 100, servingLabel: `${x.grams || 100} g` });

function resultsDialog(result, meal) {
  const catalog = new Map(foodDb().map((f) => [f.id, f]));
  const items = result.items.map((x) => {
    const food = (x.catalogId && catalog.get(x.catalogId)) || aiFood(x);
    return { ...x, food, grams: x.grams || food.serving, on: x.confidence !== 'low' || result.items.length === 1 };
  });
  return modal((done) => {
    const list = h('ul', { class: 'ai-list' });
    const total = h('p', { class: 'big' });
    const logBtn = h('button', { type: 'button', class: 'btn primary' });
    const draw = () => {
      list.replaceChildren(...items.map((it) => {
        const n = scale(it.food.n, it.grams);
        const nm = foodName(it.food);
        const gIn = h('input', { type: 'text', inputmode: 'decimal', value: String(it.grams), 'aria-label': t('ai.gramsOf', { name: nm }), class: 'g-in' });
        gIn.addEventListener('change', () => { const v = parseFloat(gIn.value.replace(',', '.')); if (v > 0) { it.grams = v; draw(); } });
        return h('li', { class: it.on ? '' : 'off' },
          h('input', { type: 'checkbox', checked: it.on, 'aria-label': t('ai.logIt', { name: nm }), onchange: (e) => { it.on = e.target.checked; draw(); } }),
          foodThumb(it.food, { photos: photosOn(), userPhoto: F().myPhotos[it.food.id] }),
          h('div', { class: 'grow-wrap' },
            h('div', {}, h('strong', {}, nm), ' ', h('span', { class: `conf conf-${it.confidence}` }, t(`conf.${it.confidence}`))),
            it.food.id.startsWith('ai:') ? h('div', { class: 'muted small' }, t('ai.notInList')) : h('div', { class: 'muted small' }, t('ai.matched', { src: sourceBadge(it.food).textContent })),
            it.ingredients.length ? h('div', { class: 'muted small' }, t('ai.seen', { list: it.ingredients.map((i) => `${i.name} ${fmt(i.grams)} ${t('unit.g')}`).join(', ') })) : null,
            h('div', { class: 'row' }, gIn, h('span', { class: 'muted' }, t('unit.g')), h('span', { class: 'ai-kcal' }, t('ai.kcalP', { kcal: fmt(n.kcal), p: fmt(n.p) })),
              h('button', {
                type: 'button', class: 'link small', onclick: async () => {
                  const r = await portionDialog(it.food, { grams: it.grams, meal, okLabel: t('ai.use') });
                  if (r && r !== 'delete') { it.food = r.food || it.food; it.grams = r.grams; it.on = true; draw(); }
                },
              }, it.food.ing ? t('ai.ingredients') : t('ai.adjust')))));
      }));
      const sel = items.filter((i) => i.on);
      total.textContent = t('food.kcalN', { n: fmt(sum(sel.map((i) => scale(i.food.n, i.grams))).kcal) });
      logBtn.textContent = sel.length ? tn('ai.logN', sel.length) : t('ai.nothing');
      logBtn.disabled = !sel.length;
    };
    logBtn.addEventListener('click', () => done(items.filter((i) => i.on)));
    draw();
    return h('div', { class: 'sheet-body' },
      h('div', { class: 'row' }, h('img', { src: result.photo, alt: t('ai.yourPhoto'), class: 'ai-photo' }), h('div', { class: 'grow-wrap' }, h('h2', {}, t('ai.sees')), total)),
      result.items.length ? null : h('p', { class: 'warn' }, t('ai.noneFound')),
      result.notes ? h('p', { class: 'muted small', lang: 'en' }, result.notes) : null,
      list,
      h('p', { class: 'muted small' }, t('ai.estimates')),
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')), logBtn));
  });
}

async function recognizeFlow(meal = defaultMeal()) {
  if (!await ensureAi()) return;
  const file = await pickPhoto();
  if (!file) return;
  const catalog = foodDb().filter((f) => f.where && f.where !== 'supermarket').map((f) => ({ id: f.id, name: f.name, fr: f.fr }));
  const stop = busy(t('ai.looking'));
  let result;
  try {
    result = await recognizeFood(file, catalog, { apiKey: F().aiKey });
  } catch (err) {
    stop();
    toast(err instanceof RecognitionError ? err.message : t('ai.err.failed'));
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
  toast(tn('ai.loggedN', chosen.length));
}

// ---------- Scan & teach: on-device visual memory of your foods ----------
const FRAMES = 10;

/** Full-screen multi-view capture. Resolves {prints, thumb, blob} or null. */
function captureScan() {
  return new Promise((resolve) => {
    let stream = null; let running = true;
    const video = h('video', { playsinline: true, muted: true, autoplay: true, class: 'scan-video' });
    const status = h('p', { class: 'scan-status' }, t('scan.starting'));
    const bar = h('div', { class: 'progress scan-progress' }, h('div', { css: { width: '0%' } }));
    const startBtn = h('button', { class: 'btn primary big-btn', type: 'button', disabled: true }, t('scan.start'));
    const photos = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const dlg = h('dialog', { class: 'scanner' });
    const finish = (val) => {
      running = false;
      stream?.getTracks().forEach((x) => x.stop());
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
      const prints = []; const covers = []; let thumb = ''; let blob = null;
      for (let i = 0; i < FRAMES && running; i++) {
        status.textContent = i < FRAMES / 2 ? t('scan.moveLeft') : t('scan.moveRight');
        const view = snap(video, 224);
        prints.push(fingerprint(view));
        const cov = plateCoverage(view);
        if (cov !== null) covers.push(cov);
        if (i === Math.floor(FRAMES / 2)) { thumb = snap(video, 160).toDataURL('image/jpeg', 0.75); snap(video, 768); blob = await toBlob(); }
        bar.firstChild.style.setProperty('width', `${((i + 1) / FRAMES) * 100}%`);
        await new Promise((r) => setTimeout(r, 280));
      }
      if (running) { navigator.vibrate?.(60); finish({ prints, thumb, blob, coverage: covers.length ? medianOf(covers) : null }); }
    });

    photos.addEventListener('change', async () => {
      const files = [...photos.files].slice(0, 6);
      if (!files.length) return;
      status.textContent = t('scan.reading');
      try {
        await prepareScanner((x) => { status.textContent = x; });
        const prints = []; const covers = []; let thumb = ''; let blob = null;
        for (const f of files) {
          const url = URL.createObjectURL(f);
          const img = new Image(); img.src = url; await img.decode();
          const view = snap(img, 224);
          prints.push(fingerprint(view));
          const cov = plateCoverage(view);
          if (cov !== null) covers.push(cov);
          if (!thumb) { thumb = snap(img, 160).toDataURL('image/jpeg', 0.75); snap(img, 768); blob = await toBlob(); }
          URL.revokeObjectURL(url);
        }
        finish({ prints, thumb, blob, coverage: covers.length ? medianOf(covers) : null });
      } catch {
        status.textContent = t('scan.photosFail');
      }
    });

    dlg.append(
      h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-ring', 'aria-hidden': 'true' })),
      h('div', { class: 'scan-panel' },
        status, bar,
        startBtn,
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => photos.click() }, icon('image', 'icon-sm'), t('scan.usePhotos')),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, t('cancel'))),
        photos),
    );
    document.body.append(dlg);
    dlg.showModal();

    (async () => {
      try {
        await prepareScanner((x) => { status.textContent = x; });
      } catch {
        status.textContent = t('scan.loadFail');
        return;
      }
      if (globalThis.POCKET_STATS_HOSTED || !navigator.mediaDevices?.getUserMedia) {
        status.textContent = t('scan.noLive');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch {
        status.textContent = t('scan.denied');
        return;
      }
      if (!running) { stream.getTracks().forEach((x) => x.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      status.textContent = t('scan.fit');
      startBtn.disabled = false;
    })();
  });
}

function scanResultsDialog(scan, ranked) {
  const lib = F().scans;
  const n = Object.keys(lib).length;
  const shown = ranked.map((r, i) => ({ ...r, conf: confidence(r.score, r.score - (ranked[i + 1]?.score ?? 0)) })).filter((r) => r.conf).slice(0, 3);
  return modal((done) => h('div', { class: 'sheet-body' },
    h('div', { class: 'row' }, h('img', { src: scan.thumb, alt: t('scan.yourScan'), class: 'ai-photo' }),
      h('div', { class: 'grow-wrap' }, h('h2', {}, shown.length ? t('scan.oneOfThese') : t('scan.newFood')),
        h('p', { class: 'muted small' }, n ? tn('scan.compared', n) : t('scan.noneTaught')))),
    shown.length ? h('ul', { class: 'results' }, ...shown.map((r) => h('li', {},
      h('button', { class: 'result with-thumb', type: 'button', onclick: () => done({ type: 'match', id: r.id }) },
        foodThumb(r.rec.food, { photos: photosOn(), userPhoto: F().myPhotos[r.rec.food.id] }),
        h('span', { class: 'r-text' }, h('span', { class: 'r-name' }, foodName(r.rec.food)),
          h('span', { class: 'r-meta' }, h('span', { class: `conf conf-${r.conf.level}` }, t(`conf.${r.conf.level}`)), ` · ${t('scan.similar', { n: fmt(r.score * 100) })}`,
            (() => { const e = portionFromScan(r.rec, scan); return e ? h('strong', { class: 'r-portion' }, ` · ≈ ${fmt(e.grams)} ${t('unit.g')}`) : ''; })())))))) : null,
    scan.coverage !== null && scan.coverage !== undefined ? h('p', { class: 'muted small' }, t('scan.covers', { n: fmt(scan.coverage * 100) })) : null,
    h('div', { class: 'stack' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => done({ type: 'link' }) }, shown.length ? t('scan.linkOther') : t('scan.link')),
      F().ai ? h('button', { class: 'btn ghost', type: 'button', onclick: () => done({ type: 'claude' }) }, t('scan.askClaude')) : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, t('cancel')))));
}

/** Grams estimated from this scan's plate coverage, for foods you've logged before (not packaged products). */
function portionFromScan(rec, scan) {
  if (!rec || rec.food?.source === 'Open Food Facts' || !(scan.coverage > 0.03)) return null;
  return estimateGrams(rec, scan.coverage);
}

function pickOneDialog(items) {
  return modal((done) => h('div', { class: 'sheet-body' },
    h('h2', {}, t('scan.whichOne')),
    h('ul', { class: 'results' }, ...items.map((it) => resultRow(it.food, () => done(it)))),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, t('cancel')))));
}

async function teachAndLog(food, scan, meal, claudeGrams) {
  const prev = F().scans[food.id];
  const est = portionFromScan(prev, scan);
  const grams = claudeGrams || est?.grams || prev?.lastGrams || undefined;
  const pct = scan.coverage > 0.03 ? fmt(scan.coverage * 100) : null;
  const note = est
    ? tn('scan.noteEst', est.basedOn, { g: fmt(est.grams), pct: pct ?? '?' })
    : claudeGrams ? t('scan.noteClaude', { g: fmt(claudeGrams) })
      : food.source === 'Open Food Facts' ? null
        : pct ? t('scan.noteFirst', { pct }) : null;
  const r = await portionDialog(food, { meal, grams, okLabel: t('scan.logRemember'), note });
  if (!r || r === 'delete') return;
  let rec = learn(prev, food, scan.prints);
  rec.sizes = prev?.sizes || [];
  if (food.source !== 'Open Food Facts') rec = addSize(rec, scan.coverage, r.grams);
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
    return teachAndLog(fresh, scan, meal);
  }
  if (choice.type === 'link') {
    let food = await searchDialog(meal);
    if (food === 'label') food = await labelDialog();
    if (food) return teachAndLog(food, scan, meal);
    return;
  }
  if (choice.type === 'claude') {
    if (!await ensureAi()) return;
    const stop = busy(t('ai.lookingScan'));
    let result;
    try {
      const catalog = foodDb().filter((f) => f.where && f.where !== 'supermarket').map((f) => ({ id: f.id, name: f.name, fr: f.fr }));
      result = await recognizeFood(scan.blob, catalog, { apiKey: F().aiKey });
    } catch (err) {
      stop(); toast(err instanceof RecognitionError ? err.message : t('ai.err.failed')); return;
    }
    stop();
    const catalogById = new Map(foodDb().map((f) => [f.id, f]));
    const items = result.items.map((x) => ({ ...x, food: (x.catalogId && catalogById.get(x.catalogId)) || aiFood(x) }));
    if (!items.length) { toast(t('ai.noneInScan')); return; }
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
    toast(globalThis.POCKET_STATS_HOSTED ? t('bc.readHosted', { code }) : t('bc.notSaved'));
    return pickAndLog(await labelDialog({ code }));
  }
  toast(t('bc.lookingUp'));
  const { results, failed } = await lookupBarcode(code, F().usdaKey);
  if (!results.length) {
    toast(failed === 2 ? t('bc.unreachable') : t('bc.notInDb'));
    return pickAndLog(await labelDialog({ code }));
  }
  const choice = results.length === 1 ? results[0] : await chooseDialog(code, results);
  if (choice === 'label') return pickAndLog(await labelDialog({ code, name: results[0]?.name }));
  return pickAndLog(choice);
}

async function editEntry(e) {
  const r = await portionDialog(e, { grams: e.grams, meal: e.meal, edit: true });
  if (!r) return;
  if (r === 'delete') {
    F().log = F().log.filter((x) => x !== e);
    if (e.slot) { const l = F().meals.logged[e.day]; if (l && l[e.slot] === e.id) delete l[e.slot]; }
  } else { e.grams = r.grams; e.meal = r.meal; }
  await ctx.commit();
}

// ---------- profile ----------
function profileDialog() {
  const p = F().profile || DEFAULT_PROFILE;
  return modal((done) => {
    let units = p.units;
    const sex = h('select', {}, h('option', { value: 'male', selected: p.sex === 'male' }, t('prof.male')), h('option', { value: 'female', selected: p.sex === 'female' }, t('prof.female')));
    const age = h('input', { type: 'text', inputmode: 'numeric', value: String(p.age) });
    const hA = h('input', { type: 'text', inputmode: 'decimal' }); const hB = h('input', { type: 'text', inputmode: 'decimal', placeholder: t('prof.in') });
    const w = h('input', { type: 'text', inputmode: 'decimal' });
    const hLabel = h('span', {}); const wLabel = h('span', {});
    let seg;
    const n = (el) => parseFloat(String(el.value).replace(',', '.'));
    const read = () => ({
      heightCm: units === 'imperial' ? ((n(hA) || 0) * 12 + (n(hB) || 0)) * 2.54 : n(hA),
      weightKg: units === 'imperial' ? n(w) * LB : n(w),
    });
    const fill = (cm, kg) => {
      if (units === 'imperial') {
        const inches = (cm || 0) / 2.54;
        hA.value = String(Math.floor(inches / 12)); hB.value = String(Math.round(inches % 12)); hB.hidden = false;
        hA.placeholder = t('prof.ft'); w.value = String(Math.round((kg || 0) / LB)); hLabel.textContent = t('prof.heightFt'); wLabel.textContent = t('prof.weightLb');
      } else {
        hA.value = String(Math.round(cm || 0)); hB.hidden = true; hA.placeholder = t('prof.cm');
        w.value = String(Math.round((kg || 0) * 10) / 10); hLabel.textContent = t('prof.heightCm'); wLabel.textContent = t('prof.weightKg');
      }
    };
    const setUnits = (u, convert) => {
      if (convert) { const cur = read(); units = u; fill(cur.heightCm, cur.weightKg); } else { units = u; fill(p.heightCm, p.weightKg); }
      seg.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.u === units));
    };
    seg = h('div', { class: 'chips seg' },
      h('button', { type: 'button', class: 'chip', 'data-u': 'metric', onclick: () => setUnits('metric', true) }, t('prof.metric')),
      h('button', { type: 'button', class: 'chip', 'data-u': 'imperial', onclick: () => setUnits('imperial', true) }, t('prof.imperial')));
    const activity = h('select', {}, ...Object.keys(ACTIVITY).map((k) => h('option', { value: k, selected: +k === p.activity }, t(`act.${k}`))));
    const goal = h('select', {}, ...Object.keys(GOALS).map((k) => h('option', { value: k, selected: k === p.goal }, t(`goal.${k}`))));
    const diet = h('select', {}, h('option', { value: 'omnivore', selected: p.diet === 'omnivore' }, t('prof.omnivore')), h('option', { value: 'vegetarian', selected: p.diet === 'vegetarian' }, t('prof.vegetarian')));
    const err = h('p', { class: 'error', hidden: true });
    setUnits(units, false);
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        const { heightCm, weightKg } = read();
        const prof = cleanProfile({ sex: sex.value, age: n(age), heightCm, weightKg, activity: +activity.value, goal: goal.value, units, diet: diet.value });
        if (!prof) { err.textContent = t('prof.check'); err.hidden = false; return; }
        done(prof);
      },
    },
    h('h2', {}, t('prof.title')),
    h('p', { class: 'muted small' }, t('prof.used')),
    seg,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('prof.sex')), sex),
      h('label', { class: 'field' }, h('span', {}, t('prof.age')), age),
      h('div', { class: 'field' }, hLabel, h('div', { class: 'row' }, hA, hB)),
      h('label', { class: 'field' }, wLabel, w)),
    h('label', { class: 'field' }, h('span', {}, t('prof.activity')), activity),
    h('label', { class: 'field' }, h('span', {}, t('prof.goal')), goal),
    h('label', { class: 'field' }, h('span', {}, t('prof.diet')), diet),
    err,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('prof.calc'))));
  });
}

function weightTracker() {
  return ctx.state.trackers.find((x) => x.type === 'number' && (x.starter === 'weight' || /^(body ?)?weight$/i.test(x.name)));
}

/** Weights in kg ({day, kg}) from the Weight tracker, for the meal plan's weekly checks. */
export function weightsKg(state) {
  const wt = state.trackers.find((x) => x.type === 'number' && (x.starter === 'weight' || /^(body ?)?weight$/i.test(x.name)));
  if (!wt) return [];
  return state.entries.filter((e) => e.trackerId === wt.id).map((e) => ({ day: e.day, kg: wt.unit === 'lb' ? e.value * LB : e.value }));
}

async function editProfile() {
  const prof = await profileDialog();
  if (!prof) return;
  F().profile = prof;
  // Keep a Weight tracker so progress shows up in Insights and the goal check.
  const unit = prof.units === 'imperial' ? 'lb' : 'kg';
  let wt = weightTracker();
  if (!wt) {
    wt = { id: uid(), name: 'Weight', starter: 'weight', type: 'number', unit, agg: 'last', goal: null, color: '#A3B1AB' };
    ctx.state.trackers.push(wt);
  }
  const today = dayKey();
  if (!ctx.state.entries.some((e) => e.trackerId === wt.id && e.day === today)) {
    const v = wt.unit === 'lb' ? prof.weightKg / LB : prof.weightKg;
    ctx.state.entries.push({ id: uid(), trackerId: wt.id, day: today, value: Math.round(v * 10) / 10, ts: Date.now() });
  }
  await ctx.commit();
  toast(t('prof.updated'));
}

// ---------- views ----------
function bar(label, val, target, cls) {
  const pct = target ? Math.min(1, val / target) : 0;
  const over = target && val > target * 1.05;
  return h('div', { class: `mbar ${cls}` },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, label), h('span', { class: over ? 'warn' : '' }, `${fmt(val)} / ${fmt(target)} ${t('unit.g')}`)),
    h('div', { class: 'progress thin' }, h('div', { css: { width: `${pct * 100}%` } })));
}

function summaryCard(tg, tot) {
  const left = tg.kcal - tot.kcal;
  return h('article', { class: 'card summary' },
    h('div', { class: 'kcal-row' },
      h('div', {}, h('div', { class: 'big' }, fmt(tot.kcal)), h('div', { class: 'muted small' }, t('food.ofKcal', { n: fmt(tg.kcal) }))),
      h('div', { class: 'right' }, h('div', { class: `big ${left < 0 ? 'warn' : ''}` }, fmt(Math.abs(left))), h('div', { class: 'muted small' }, left >= 0 ? t('food.kcalLeft') : t('food.kcalOver')))),
    h('div', { class: 'progress' }, h('div', { css: { width: `${Math.min(100, (tot.kcal / tg.kcal) * 100)}%` } })),
    h('div', { class: 'macro-grid' },
      bar(t('macro.protein'), tot.p, tg.protein, 'm-p'),
      bar(t('macro.carbs'), tot.c, tg.carbs, 'm-c'),
      bar(t('macro.fat'), tot.f, tg.fat, 'm-f')),
    h('p', { class: 'muted small' }, t('food.fiber', { n: fmt(tot.fib) })));
}

/** Diary targets: the meal plan's day target when it's on, else the profile's. */
function diaryTargets(p) {
  return targets(p);
}

function viewDiary() {
  const p = F().profile;
  const today = dayKey();
  const entries = dayLog(foodDay);
  const tot = totals(entries);
  const tg = p ? diaryTargets(p) : null;

  const nav = h('header', { class: 'day-nav' },
    iconButton('back', t('day.prev'), () => { foodDay = addDays(foodDay, -1); ctx.render(); }),
    h('div', { class: 'day-title' }, h('h1', {}, dayLabel(foodDay)),
      foodDay !== today ? h('button', { class: 'link small', onclick: () => { foodDay = today; ctx.render(); } }, t('day.backToToday')) : null),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('day.next'), disabled: foodDay >= today, onclick: () => { foodDay = addDays(foodDay, 1); ctx.render(); } }, icon('next')),
      langToggle(ctx.render)));

  const tile = (label, subl, name, onclick, primary) => h('button', { class: `add-tile${primary ? ' primary' : ''}`, type: 'button', onclick },
    icon(name), h('span', { class: 'add-label' }, label), h('span', { class: 'add-sub' }, subl));
  const actions = h('article', { class: 'card add-food' },
    h('h2', {}, t('food.addFood')),
    h('div', { class: 'add-grid' },
      tile(t('tile.scan'), t('tile.scanSub'), 'scan', () => scanTeachFlow(), true),
      tile(t('tile.barcode'), t('tile.barcodeSub'), 'barcode', scanFlow),
      tile(t('tile.search'), t('tile.searchSub'), 'search', () => searchFlow()),
      F().moroccoDb ? tile(t('tile.moroccan'), t('tile.moroccanSub'), 'souk', () => browseFlow()) : null,
      tile(t('tile.claude'), t('tile.claudeSub'), 'camera', () => recognizeFlow()),
      tile(t('tile.label'), t('tile.labelSub'), 'label', async () => pickAndLog(await labelDialog()))));

  const meals = MEALS.map((k) => {
    const label = t(`meal.${k}`);
    const list = entries.filter((e) => e.meal === k).sort((a, b) => a.ts - b.ts);
    const mt = totals(list);
    return h('article', { class: 'card meal' },
      h('div', { class: 'tracker-head' }, h('h2', {}, label), h('span', { class: 'muted small' }, list.length ? t('food.kcalProtein', { kcal: fmt(mt.kcal), p: fmt(mt.p) }) : ''),
        h('button', { class: 'icon-btn small add', 'aria-label': t('search.addTo', { meal: label }), onclick: () => searchFlow(k) }, icon('plus'))),
      list.length ? h('ul', { class: 'entries' }, ...list.map((e) => {
        const n = scale(e.n, e.grams);
        return h('li', {}, h('button', { class: 'entry', onclick: () => editEntry(e) },
          h('span', { class: 'grow' }, foodName(e), h('span', { class: 'muted small' }, ` · ${fmt(e.grams)} ${t('unit.g')}`)),
          h('span', { class: 'small' }, t('food.kcalN', { n: fmt(n.kcal) }))));
      })) : null);
  });

  let sug = null;
  if (tg && foodDay === today) {
    const rem = { kcal: tg.kcal - tot.kcal, p: tg.protein - tot.p };
    const list = suggestions(rem, p.diet === 'vegetarian');
    if (list.length) {
      sug = h('article', { class: 'card' },
        h('h2', {}, t('food.proteinToGo', { n: fmt(rem.p) })),
        h('p', { class: 'muted small' }, t('food.tapToAdd')),
        h('ul', { class: 'entries' }, ...list.map((s) => h('li', {}, h('button', { class: 'entry', onclick: () => pickAndLog(s.f) },
          h('span', { class: 'grow' }, foodName(s.f), h('span', { class: 'muted small' }, ` · ${fmt(s.grams)} ${t('unit.g')}`)),
          h('span', { class: 'small' }, t('food.plusP', { p: fmt(s.n.p), kcal: fmt(s.n.kcal) })))))));
    }
  }
  return [nav, tg ? summaryCard(tg, tot) : h('article', { class: 'card' }, h('div', { class: 'big' }, t('food.kcalN', { n: fmt(tot.kcal) })), h('p', { class: 'muted small' }, macroLine(tot))), actions, ...meals, sug];
}

const TIP_COUNT = { bulk: 4, lean: 4, recomp: 3, cut: 3 };
const PLAN_MEAL = { Breakfast: 'breakfast', Lunch: 'lunch', Dinner: 'dinner', Snack: 'snack' };

function viewGoal() {
  const p = F().profile;
  const tg = targets(p);
  const days = dayRange(dayKey(), 14);
  const daily = days.map((d) => { const l = dayLog(d); return l.length ? totals(l) : null; });
  const out = [];

  // Weight trend vs goal rate
  const wt = weightTracker();
  let check = h('p', { class: 'muted' }, t('goal.logWeight'));
  if (wt) {
    const w = series(ctx.state, wt, dayRange(dayKey(), 14)).map((v) => (v === null ? null : wt.unit === 'lb' ? v * LB : v));
    const a = w.slice(0, 7).filter((v) => v !== null); const b = w.slice(7).filter((v) => v !== null);
    if (a.length >= 2 && b.length >= 2) {
      const avgA = a.reduce((x, y) => x + y, 0) / a.length; const avgB = b.reduce((x, y) => x + y, 0) / b.length;
      const pct = ((avgB - avgA) / avgA) * 100;
      const [lo, hi] = GOALS[p.goal].weekly;
      const kgWeek = avgB - avgA;
      const shown = wt.unit === 'lb' ? `${fmt(kgWeek / LB, 1)} ${t('unit.lb')}` : `${fmt(kgWeek, 1)} ${t('unit.kg')}`;
      const adj = Math.round((Math.abs(pct < lo ? lo - pct : pct - hi) / 100) * avgB * 7700 / 7 / 50) * 50; // ≈7700 kcal per kg
      check = h('div', { class: 'stack' },
        h('div', { class: 'big' }, `${pct >= 0 ? '+' : ''}${fmt(pct, 1)}% ${t('goal.perWeek')}`),
        h('p', { class: 'muted small' }, t('goal.thisWeek', { v: `${pct >= 0 ? '+' : ''}${shown}`, lo, hi })),
        h('p', { class: pct < lo || pct > hi ? 'warn' : 'ok' },
          pct < lo ? t('goal.below', { n: fmt(Math.max(100, adj)) }) : pct > hi ? t('goal.above', { n: fmt(Math.max(100, adj)) }) : t('goal.onTarget')));
    }
  }
  out.push(h('article', { class: 'card' }, h('h2', {}, t('goal.onTrack')), check));

  if (daily.some(Boolean)) {
    const logged = daily.filter(Boolean);
    const avg = sum(logged); const n = logged.length;
    out.push(h('article', { class: 'card' },
      h('h2', {}, t('goal.kcal14')),
      h('p', { class: 'muted small' }, t('goal.avgKcal', { avg: fmt(avg.kcal / n), target: fmt(tg.kcal), n: fmt(n) })),
      barChart({ days, values: daily.map((x) => x && x.kcal), color: '#F2B544', goal: tg.kcal, label: t('goal.kcalPerDay') })));
    out.push(h('article', { class: 'card' },
      h('h2', {}, t('goal.protein14')),
      h('p', { class: 'muted small' }, t('goal.avgProtein', { avg: fmt(avg.p / n), target: fmt(tg.protein), hit: fmt(daily.filter((x) => x && x.p >= tg.protein * 0.95).length) })),
      barChart({ days, values: daily.map((x) => x && x.p), color: '#6CB4FF', goal: tg.protein, label: t('goal.proteinPerDay') })));
  }

  // How the targets are calculated, a sample day and the evidence-based tips (from v1.7's Plan tab)
  const plan = buildPlan(p.diet, tg);
  out.push(h('article', { class: 'card' },
    h('h2', {}, t(`goal.${p.goal}`)),
    h('div', { class: 'stats four' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, fmt(tg.kcal)), h('div', { class: 'stat-l' }, t('goal.kcalDay'))),
      h('div', { class: 'stat m-p' }, h('div', { class: 'stat-v' }, `${fmt(tg.protein)} ${t('unit.g')}`), h('div', { class: 'stat-l' }, t('macro.protein'))),
      h('div', { class: 'stat m-c' }, h('div', { class: 'stat-v' }, `${fmt(tg.carbs)} ${t('unit.g')}`), h('div', { class: 'stat-l' }, t('macro.carbs'))),
      h('div', { class: 'stat m-f' }, h('div', { class: 'stat-v' }, `${fmt(tg.fat)} ${t('unit.g')}`), h('div', { class: 'stat-l' }, t('macro.fat')))),
    h('p', { class: 'muted small' }, t('goal.how', { bmr: fmt(tg.bmr), tdee: fmt(tg.tdee), kcal: fmt(tg.kcal), protein: GOALS[p.goal].protein, kind: t(p.goal === 'bulk' || p.goal === 'lean' ? 'goal.surplus' : p.goal === 'cut' ? 'goal.deficit' : 'goal.maintenance') })),
    h('p', { class: 'muted small' }, t('goal.mealPlanNote'))),
  h('details', { class: 'card' },
    h('summary', { class: 'h2like' }, h('h2', {}, t('goal.sampleDay'))),
    h('p', { class: 'muted small' }, t('goal.sampleHint', { line: macroLine(plan.n) })),
    ...plan.meals.map((m) => h('div', { class: 'plan-meal' },
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, t(`meal.${PLAN_MEAL[m.name] || 'snack'}`)), h('span', { class: 'muted small' }, t('food.kcalProtein', { kcal: fmt(m.n.kcal), p: fmt(m.n.p) }))),
      h('ul', { class: 'entries' }, ...m.rows.map((r) => h('li', {}, h('span', { class: 'grow' }, foodName(r.f)), h('span', { class: 'small' }, `${fmt(r.grams)} ${t('unit.g')}`))))))),
  h('article', { class: 'card' },
    h('h2', {}, t('goal.tipsTitle')),
    h('ul', { class: 'bullets' }, ...Array.from({ length: TIP_COUNT[p.goal] }, (_, i) => h('li', {}, t(`tip.${p.goal}.${i + 1}`)))),
    h('p', { class: 'muted small' }, t('goal.disclaimer'))));

  const kg = p.weightKg;
  out.push(h('article', { class: 'card' },
    h('h2', {}, t('goal.details')),
    h('p', { class: 'muted small' }, `${t(p.sex === 'female' ? 'prof.female' : 'prof.male')}, ${fmt(p.age)} · `,
      p.units === 'imperial' ? `${Math.floor(p.heightCm / 30.48)}′${Math.round((p.heightCm / 2.54) % 12)}″ · ${fmt(kg / LB)} ${t('unit.lb')}` : `${fmt(p.heightCm)} ${t('prof.cm')} · ${fmt(kg, 1)} ${t('unit.kg')}`,
      ` · ${t(`act.${p.activity}`)} · ${t(`goal.${p.goal}`)}`),
    h('button', { class: 'btn ghost wide', onclick: editProfile }, t('goal.update'))));
  return out;
}

/** What meals.js needs from this module (no circular imports). */
const api = () => ({
  ctx, F, addEntry, portionDialog, foodName, pickPhoto, busy, setSub: (s) => { sub = s; ctx.render(); window.scrollTo(0, 0); }, weightsKg,
});

export function viewFood(c) {
  ctx = c;
  setCustomRecipes(F().myRecipes);
  const tabs = [['meals', t('food.tab.meals')], ['diary', t('food.tab.diary')], ['recipes', t('food.tab.recipes')], ['goal', t('food.tab.progress')]];
  const active = sub === 'recipe' ? 'recipes' : sub;
  const seg = h('div', { class: 'chips seg', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', {
    class: `chip${k === active ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === active), onclick: () => { if (k === 'recipes') closeRecipe(); sub = k; ctx.render(); window.scrollTo(0, 0); },
  }, l)));
  let body;
  if (sub === 'meals') body = viewMeals(api());
  else if (sub === 'recipes' || sub === 'recipe') body = viewRecipes(api());
  else if (sub === 'goal') body = [h('header', { class: 'page-head' }, h('h1', {}, t('food.tab.progress')), langToggle(ctx.render)), ...viewGoal()];
  else body = viewDiary();
  return h('section', { class: 'food' }, seg, ...body);
}

export function resetFoodView() { foodDay = dayKey(); if (sub === 'recipe') sub = 'recipes'; closeRecipe(); }

/** Settings card for meals and the meal plan. */
export function mealSettingsCard(c) { ctx = c; return mealSettings(api(), editProfile); }

/** Pre-load the starter recipe photos (built into the Android app) once, encrypted like any photo. */
export function importStarterPhotos(c) { ctx = c; return importStarters(api()); }

/** Settings card for online lookups. */
export function foodSettingsCard(c) {
  ctx = c;
  const key = h('input', { value: F().usdaKey, placeholder: t('fs.usdaPh'), maxlength: 64, autocomplete: 'off', 'aria-label': t('fs.usdaKey'), dir: 'ltr' });
  return h('article', { class: 'card' },
    h('h2', {}, t('fs.title')),
    globalThis.POCKET_STATS_HOSTED ? h('p', { class: 'muted small' }, t('fs.hosted')) : null,
    globalThis.POCKET_STATS_HOSTED ? null : h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, t('fs.online'), h('span', { class: 'muted small block' }, t('fs.onlineSub'))),
      h('input', { type: 'checkbox', role: 'switch', checked: F().online, onchange: async (e) => { F().online = e.target.checked; await ctx.commit(); } })),
    ...(globalThis.POCKET_STATS_HOSTED ? [] : [h('label', { class: 'field' }, h('span', {}, t('fs.usdaKey')), key),
      h('p', { class: 'muted small' }, t('fs.usdaHelp')),
      h('button', {
        class: 'btn ghost', onclick: async () => {
          const v = key.value.trim();
          if (!/^[A-Za-z0-9]{0,64}$/.test(v)) { toast(t('fs.keyBad')); return; }
          F().usdaKey = v; await ctx.commit(); toast(t('saved'));
        },
      }, t('fs.saveKey'))]),
    h('h3', {}, t('fs.taught')),
    Object.keys(F().scans).length ? h('ul', { class: 'entries' }, ...Object.entries(F().scans).sort((a, b) => b[1].updated - a[1].updated).map(([id, rec]) => h('li', {},
      foodThumb(rec.food, { userPhoto: F().myPhotos[id] }),
      h('span', { class: 'grow' }, foodName(rec.food), h('span', { class: 'muted small block' },
        [tn('fs.views', rec.prints.length), rec.sizes?.length ? tn('fs.portions', rec.sizes.length) : '', rec.lastGrams ? t('fs.usually', { g: fmt(rec.lastGrams) }) : ''].filter(Boolean).join(' · '))),
      h('button', {
        class: 'icon-btn small', 'aria-label': t('fs.forgetN', { name: foodName(rec.food) }), onclick: async () => {
          if (!await confirmDialog(t('fs.forgetQ', { name: foodName(rec.food) }), t('fs.forgetBody'), t('fs.forget'), true)) return;
          delete F().scans[id]; await ctx.deleteScan(id); ctx.render();
        },
      }, icon('close', 'icon-sm')))))
      : h('p', { class: 'muted small' }, t('fs.noneTaught')),
    h('h3', {}, t('fs.claudeTitle')),
    h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, t('fs.claude'), h('span', { class: 'muted small block' }, recognitionMode() === 'sample' ? t('fs.claudeHosted') : t('fs.claudeApi'))),
      h('input', { type: 'checkbox', role: 'switch', checked: F().ai, onchange: async (e) => { if (e.target.checked) { if (!await ensureAi()) e.target.checked = false; } else { F().ai = false; await ctx.save(); } } })),
    recognitionMode() === 'api' && F().aiKey ? h('button', {
      class: 'btn ghost', onclick: async () => {
        if (!await confirmDialog(t('fs.removeKeyQ'), t('fs.removeKeyBody'), t('remove'), true)) return;
        F().aiKey = ''; F().ai = false; await ctx.commit();
      },
    }, t('fs.removeKey')) : null,
    h('h3', {}, t('fs.dbTitle')),
    h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, t('fs.db'), h('span', { class: 'muted small block' }, DATA_BUILT_IN ? t('fs.dbBuiltIn') : t('fs.dbServer'))),
      h('input', { type: 'checkbox', role: 'switch', checked: F().moroccoDb, onchange: async (e) => { F().moroccoDb = e.target.checked; await ctx.commit(); if (e.target.checked) loadFoodDb().catch(() => {}); } })),
    photosAvailable() ? h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, t('fs.photos'), h('span', { class: 'muted small block' }, DATA_BUILT_IN ? t('fs.photosBuiltIn') : t('fs.photosServer'))),
      h('input', { type: 'checkbox', role: 'switch', checked: F().photos, onchange: async (e) => { F().photos = e.target.checked; await ctx.commit(); } })) : null,
    F().moroccoDb ? h('p', { class: 'muted small' }, foodDb().length
      ? `${tn('browse.nFoods', foodDb().length)} · ${t('fs.listFrom', { v: foodDbMeta().version || '?' })}${DATA_BUILT_IN ? ` · ${t('fs.builtIn')}` : ` · ${t('fs.checked', { d: dateText(new Date(foodDbMeta().fetched), { day: 'numeric', month: 'short' }) })}`}`
      : t('fs.notDownloaded')) : null,
    F().moroccoDb && !DATA_BUILT_IN ? h('button', {
      class: 'btn ghost', onclick: async () => {
        toast(t('fs.updating'));
        try { const n = await loadFoodDb({ force: true }); toast(t('fs.updated', { n: fmt(n) })); ctx.render(); } catch { toast(t('fs.serverFail')); }
      },
    }, t('fs.updateNow')) : null,
    h('p', { class: 'muted small' }, t('fs.counts', { saved: fmt(F().saved.length), log: fmt(F().log.length) })),
    F().saved.length ? h('button', {
      class: 'btn ghost', onclick: async () => {
        if (!await confirmDialog(t('fs.clearQ'), t('fs.clearBody'), t('fs.clear'), true)) return;
        F().saved = []; await ctx.commit();
      },
    }, t('fs.clearSaved')) : null);
}

