// Nutrition math and the two optional online sources.
// Online lookups send ONLY a barcode number or the words you typed. No cookies,
// no referrer, no identifiers, and nothing from your diary.
import { FOOD_BY_ID, FOODS, PLANS } from './foods.js';

export const ACTIVITY = {
  1.2: 'Mostly sitting, little exercise',
  1.375: 'Light: training 1–3 days/week',
  1.55: 'Moderate: training 3–5 days/week',
  1.725: 'Hard: training 6–7 days/week',
  1.9: 'Very hard: physical job + training',
};

export const GOALS = {
  bulk: { label: 'Bulk (build muscle fast)', kcal: 1.15, protein: 1.8, weekly: [0.5, 0.75] },
  lean: { label: 'Lean bulk (muscle, minimal fat)', kcal: 1.1, protein: 2.0, weekly: [0.25, 0.5] },
  recomp: { label: 'Recomp (same weight, better shape)', kcal: 1.0, protein: 2.2, weekly: [-0.1, 0.1] },
  cut: { label: 'Cut (lose fat, keep muscle)', kcal: 0.8, protein: 2.2, weekly: [-1.0, -0.5] },
};

/** Mifflin–St Jeor BMR × activity, then goal adjustment and macro split. */
export function targets(p) {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5);
  const tdee = bmr * p.activity;
  const g = GOALS[p.goal];
  const kcal = Math.round((tdee * g.kcal) / 10) * 10;
  const protein = Math.round(p.weightKg * g.protein);
  const fat = Math.round(Math.max(p.weightKg * 0.8, (kcal * 0.25) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, fat, carbs };
}

export function scale(n, grams) {
  const k = grams / 100;
  return { kcal: n.kcal * k, p: n.p * k, c: n.c * k, f: n.f * k, fib: (n.fib || 0) * k };
}

export function sum(list) {
  return list.reduce((a, x) => ({ kcal: a.kcal + x.kcal, p: a.p + x.p, c: a.c + x.c, f: a.f + x.f, fib: a.fib + (x.fib || 0) }),
    { kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
}

const clean = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : null);

function complete(n) {
  if (n.p === null || n.c === null || n.f === null) return null;
  if (n.kcal === null) n.kcal = n.p * 4 + n.c * 4 + n.f * 9;
  n.fib = n.fib ?? 0;
  return n;
}

const FETCH_OPTS = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' };

async function getJson(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...FETCH_OPTS, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- Open Food Facts (packaged products, barcodes) ----------
const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

function fromOff(p) {
  if (!p) return null;
  const m = p.nutriments || {};
  const kj = clean(m['energy_100g']);
  const n = complete({
    kcal: clean(m['energy-kcal_100g']) ?? (kj !== null ? kj / 4.184 : null),
    p: clean(m.proteins_100g),
    c: clean(m.carbohydrates_100g),
    f: clean(m.fat_100g),
    fib: clean(m.fiber_100g),
  });
  if (!n || !p.product_name) return null;
  const serving = clean(p.serving_quantity);
  return {
    id: `off:${p.code}`,
    code: String(p.code || ''),
    name: String(p.product_name).slice(0, 80),
    brand: String(p.brands || '').split(',')[0].trim().slice(0, 40),
    source: 'Open Food Facts',
    n,
    serving: serving && serving < 2000 ? serving : 100,
    servingLabel: serving ? String(p.serving_size || '1 serving').slice(0, 30) : '100 g',
  };
}

export async function offBarcode(code) {
  const j = await getJson(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  return j.status === 1 ? fromOff({ code, ...j.product }) : null;
}

export async function offSearch(q) {
  const j = await getJson(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`);
  return (j.products || []).map(fromOff).filter(Boolean);
}

// ---------- USDA FoodData Central (US government database) ----------
const FDC = 'https://api.nal.usda.gov/fdc/v1';

function fromFdc(food) {
  const by = {};
  for (const x of food.foodNutrients || []) {
    const num = String(x.nutrientNumber ?? x.nutrient?.number ?? '');
    const val = x.value ?? x.amount;
    if (num && by[num] === undefined) by[num] = val;
  }
  const n = complete({
    kcal: clean(by['208']) ?? clean(by['957']) ?? clean(by['958']),
    p: clean(by['203']),
    c: clean(by['205']),
    f: clean(by['204']),
    fib: clean(by['291']),
  });
  if (!n) return null;
  const grams = String(food.servingSizeUnit || '').toLowerCase() === 'g' ? clean(food.servingSize) : null;
  const name = String(food.description || '').toLowerCase().replace(/(^|[\s,(])\S/g, (s) => s.toUpperCase());
  return {
    id: `fdc:${food.fdcId}`,
    code: String(food.gtinUpc || ''),
    name: name.slice(0, 80),
    brand: String(food.brandName || food.brandOwner || '').slice(0, 40),
    source: 'USDA',
    n,
    serving: grams || 100,
    servingLabel: grams ? String(food.householdServingFullText || `${grams} g`).slice(0, 30) : '100 g',
  };
}

export async function fdcSearch(q, key) {
  const types = encodeURIComponent('Foundation,SR Legacy,Branded');
  const j = await getJson(`${FDC}/foods/search?api_key=${encodeURIComponent(key || 'DEMO_KEY')}&query=${encodeURIComponent(q)}&pageSize=15&dataType=${types}`);
  return (j.foods || []).map(fromFdc).filter(Boolean);
}

export async function fdcBarcode(code, key) {
  const list = await fdcSearch(code, key);
  return list.find((f) => f.code.replace(/^0+/, '') === code.replace(/^0+/, '')) || null;
}

/** Ask every online source at once; keep whatever answers. */
export async function lookupBarcode(code, key) {
  const [off, fdc] = await Promise.allSettled([offBarcode(code), fdcBarcode(code, key)]);
  const results = [off, fdc].filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  const failed = [off, fdc].filter((r) => r.status === 'rejected').length;
  return { results, failed };
}

export async function searchOnline(q, key) {
  const [fdc, off] = await Promise.allSettled([fdcSearch(q, key), offSearch(q)]);
  const results = [fdc, off].flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = [fdc, off].filter((r) => r.status === 'rejected').length;
  return { results, failed };
}

/** Compare sources for the same barcode: warn if calorie values disagree a lot. */
export function agreement(results) {
  if (results.length < 2) return null;
  const vals = results.map((r) => r.n.kcal);
  const lo = Math.min(...vals); const hi = Math.max(...vals);
  return { agree: hi - lo <= Math.max(15, hi * 0.1), lo, hi };
}

// ---------- planning ----------

/** Scale a sample-day template so protein and calories land on target. */
export function buildPlan(kind, t) {
  const meals = PLANS[kind];
  const items = meals.flatMap(([, list]) => list.map(([id, g, isP]) => ({ f: FOOD_BY_ID[id], g, isP: !!isP })));
  const tot = (pred) => sum(items.filter(pred).map((x) => scale(x.f.n, x.g)));
  const P = tot((x) => x.isP); const O = tot((x) => !x.isP);
  // Solve a*P.p + b*O.p = protein ; a*P.kcal + b*O.kcal = kcal
  const det = P.p * O.kcal - O.p * P.kcal;
  let a = 1; let b = 1;
  if (Math.abs(det) > 1e-6) {
    a = (t.protein * O.kcal - O.p * t.kcal) / det;
    b = (P.p * t.kcal - t.protein * P.kcal) / det;
  }
  // Keep protein portions realistic (never shrink them much); calories then come from carbs/fats.
  a = Math.min(3, Math.max(0.85, a));
  b = Math.min(3.5, Math.max(0.4, (t.kcal - a * P.kcal) / O.kcal));
  const round = (g) => Math.max(5, Math.round(g / 5) * 5);
  const out = meals.map(([name, list]) => {
    const rows = list.map(([id, g, isP]) => {
      const f = FOOD_BY_ID[id]; const grams = round(g * (isP ? a : b));
      return { f, grams, n: scale(f.n, grams) };
    });
    return { name, rows, n: sum(rows.map((r) => r.n)) };
  });
  return { meals: out, n: sum(out.map((m) => m.n)) };
}

/** Foods that close the remaining protein gap without blowing the calorie budget. */
export function suggestions(remaining, veg) {
  if (remaining.p < 10) return [];
  return FOODS
    .filter((f) => f.tags.includes('p') && (!veg || f.tags.includes('v')))
    .map((f) => {
      const grams = Math.min(f.serving * 2.5, Math.max(f.serving * 0.5, (Math.min(remaining.p, 40) / f.n.p) * 100));
      const g = Math.round(grams / 5) * 5;
      return { f, grams: g, n: scale(f.n, g), density: f.n.p / f.n.kcal };
    })
    .filter((x) => remaining.kcal <= 0 ? x.density > 0.15 : x.n.kcal <= remaining.kcal + 50)
    .sort((x, y) => y.density - x.density)
    .slice(0, 4);
}
