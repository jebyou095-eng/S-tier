// Training-day meal plan and meals that adapt to what you actually trained.
// Pure functions (no screen code): every rule here is covered by the tests.
// Everything runs on the phone from your own logs.
import { RECIPES, RECIPE_BY_ID, DINNER_SIDES } from './recipes.js';
import { ingredientInfo } from './fooddb.js';
import { dayKey, addDays, parseDay } from './stats.js';
import { EX_BY_ID, PROGRAMS } from './exercises.js';
import { sessionsFromLog, analyze, nextDay, adaptPlan } from './coach.js';

export const DAY_TYPES = ['push', 'pull', 'legs', 'rest'];
export const LUNCH_CARB = { rest: 100, push: 120, pull: 120, legs: 160 }; // g dry, the recipes are written for 120 g
export const DEFAULT_TARGETS = { rest: 2800, push: 3050, pull: 3050, legs: 3300 };
export const PROTEIN_MIN = 120;
export const EGG_LIMIT = 4;
export const MAX_ADAPT = 400; // kcal: a day never changes by more than this
export const DEFAULT_TIMES = {
  breakfast: '07:00', shake: '10:30', lunch: '13:00', snack: '16:30', pregym: '19:30',
  gymStart: '20:00', gymEnd: '21:15', dinner: '21:30', restDinner: '20:00', bedtime: '22:30',
};
const NO_REPEAT_DAYS = { breakfast: 1, lunch: 3, dinner: 3, shake: 1, snack: 1, pregym: 1 };
const MET = { easy: 3.5, good: 5, hard: 6, 'too-much': 6 };

// ---------- settings ----------
export function freshMeals() {
  return {
    adaptive: true, times: { ...DEFAULT_TIMES }, trainDays: [], targets: { ...DEFAULT_TARGETS }, protein: 125,
    dayType: {}, plan: {}, logged: {}, undo: {}, baseline: 0, weekly: {}, fav: [], hide: [], trim: null, extraShake: false,
    dismissed: [], starterDone: false,
  };
}

const okDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const okTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function normalizeMeals(raw, recipeIds = new Set(RECIPES.map((r) => r.id))) {
  const out = freshMeals();
  if (!raw || typeof raw !== 'object') return out;
  out.adaptive = raw.adaptive !== false;
  for (const [k, v] of Object.entries(raw.times || {})) if (k in DEFAULT_TIMES && okTime(v)) out.times[k] = v;
  out.trainDays = (Array.isArray(raw.trainDays) ? raw.trainDays : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  for (const k of DAY_TYPES) if (+raw.targets?.[k] >= 1200 && +raw.targets[k] <= 6000) out.targets[k] = Math.round(+raw.targets[k]);
  if (+raw.protein >= 60 && +raw.protein <= 300) out.protein = Math.round(+raw.protein);
  const cutoff = addDays(dayKey(), -60);
  for (const [d, t] of Object.entries(raw.dayType || {})) if (okDay(d) && d >= cutoff && DAY_TYPES.includes(t)) out.dayType[d] = t;
  for (const [d, p] of Object.entries(raw.plan || {})) {
    if (!okDay(d) || d < cutoff || !p || typeof p !== 'object') continue;
    const day = {};
    for (const [slot, id] of Object.entries(p)) if (typeof id === 'string' && recipeIds.has(id)) day[slot] = id;
    out.plan[d] = day;
  }
  for (const [d, l] of Object.entries(raw.logged || {})) {
    if (!okDay(d) || d < cutoff || !l || typeof l !== 'object') continue;
    out.logged[d] = Object.fromEntries(Object.entries(l).filter(([s, v]) => typeof s === 'string' && typeof v === 'string').map(([s, v]) => [s.slice(0, 20), v.slice(0, 40)]));
  }
  for (const [d, v] of Object.entries(raw.undo || {})) if (okDay(d) && d >= cutoff && v === true) out.undo[d] = true;
  out.baseline = Math.max(-500, Math.min(500, Math.round(+raw.baseline || 0)));
  for (const [w, v] of Object.entries(raw.weekly || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(w) && Number.isFinite(+v)) out.weekly[w] = +v;
  out.fav = (Array.isArray(raw.fav) ? raw.fav : []).filter((x) => recipeIds.has(x));
  out.hide = (Array.isArray(raw.hide) ? raw.hide : []).filter((x) => recipeIds.has(x));
  out.trim = ['milk', 'bread'].includes(raw.trim) ? raw.trim : null;
  out.extraShake = raw.extraShake === true;
  out.dismissed = (Array.isArray(raw.dismissed) ? raw.dismissed : []).filter((x) => typeof x === 'string').slice(-40);
  out.starterDone = raw.starterDone === true;
  return out;
}

// ---------- nutrition from the food database ----------
const ZERO = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
const addN = (a, b, k = 1) => { for (const x of Object.keys(a)) a[x] += (b[x] || 0) * k; return a; };

/** Look up a recipe (built-in or yours). */
let custom = [];
export function setCustomRecipes(list) { custom = Array.isArray(list) ? list : []; }
export const recipeById = (id) => custom.find((r) => r.id === id) || RECIPE_BY_ID[id] || null;
export const allRecipes = () => [...RECIPES.filter((r) => !r.same || true), ...custom];

/** Nutrition of a list of [id, grams, opts] items. Unknown ingredients are reported, never guessed. */
export function itemsNutrition(items, mult = {}) {
  const n = ZERO();
  const missing = [];
  let grams = 0;
  for (const [id, g, o = {}] of items) {
    const m = mult[id] ?? 1;
    if (id.startsWith('@')) {
      const r = recipeById(id.slice(1));
      if (!r) { missing.push(id); continue; }
      const sub = recipeNutrition(r);
      addN(n, sub.n, g * m);
      grams += sub.grams * g * m;
      missing.push(...sub.missing);
      continue;
    }
    const info = ingredientInfo(id);
    if (!info) { missing.push(id); continue; }
    addN(n, info.n, (g * m) / 100);
    if (o.u !== 'ml' || id === 'milk' || id === 'orange-juice') grams += g * m; // water doesn't count as food weight
  }
  return { n, grams, missing };
}

/** Per-serving nutrition of a recipe (servings scales every amount). */
export function recipeNutrition(r, { servings = 1, mult = {} } = {}) {
  const tot = itemsNutrition(r.ing || [], mult);
  const k = servings / (r.serves || 1);
  return { n: addN(ZERO(), tot.n, k), grams: tot.grams * k, missing: tot.missing };
}

// ---------- day type ----------
export function typeOfProgramDay(name) {
  const s = String(name || '').toLowerCase();
  if (/leg|lower/.test(s)) return 'legs';
  if (/pull/.test(s)) return 'pull';
  return 'push'; // push, upper and full-body days are sized like push days
}

/** Weekdays you usually train, learned from the last 4 weeks (needs ≥ 3 sessions). */
export function learnTrainDays(gym, today = dayKey()) {
  const since = addDays(today, -27);
  const days = [...new Set((gym.log || []).filter((s) => s.day >= since && s.day <= today).map((s) => s.day))];
  if (days.length < 3) return [];
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) count[parseDay(d).getDay()]++;
  return count.map((c, i) => (c >= 2 ? i : -1)).filter((i) => i >= 0);
}

/**
 * Today's (or a future day's) type: what you picked, else what you logged in the Gym tab, else
 * your training weekdays + the program's next day. Returns {type, source} (type null = unknown).
 */
export function detectDayType(state, day = dayKey(), today = dayKey()) {
  const m = state.food.meals;
  if (m.dayType[day]) return { type: m.dayType[day], source: 'manual' };
  const gym = state.gym;
  const sets = (gym.log || []).filter((s) => s.day === day && s.pday);
  if (sets.length) {
    const [prog, idx] = sets[0].pday.split(':');
    return { type: typeOfProgramDay(PROGRAMS[prog]?.days[+idx]?.[0]), source: 'logged' };
  }
  const prog = PROGRAMS[gym.program];
  const trainDays = m.trainDays.length ? m.trainDays : learnTrainDays(gym, today);
  if (!prog || !trainDays.length) return { type: null, source: null };
  const wd = parseDay(day).getDay();
  if (!trainDays.includes(wd)) return { type: 'rest', source: 'schedule' };
  // Which program day: the coach's next day for today, then the following ones in order
  const a = analyze(gym, today);
  let idx = nextDay(gym, prog, a, today).idx;
  // Each training day between today and that day moves one step through the program
  for (let d = today; d < day; d = addDays(d, 1)) if (trainDays.includes(parseDay(d).getDay())) idx = (idx + 1) % prog.days.length;
  return { type: typeOfProgramDay(prog.days[idx][0]), source: 'schedule' };
}

// ---------- rotation ----------
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return ((x >>> 0) % 10000) / 10000;
}

/** Eggs in one serving. */
export const recipeEggs = (r) => (r ? r.eggs || 0 : 0);
export const optionsFor = (slot, m) => allRecipes().filter((r) => r.slot === slot && !(m.hide || []).includes(r.id));

function slotOptions(slot, m) {
  if (slot === 'snack') return optionsFor('snack', m);
  return optionsFor(slot, m);
}

/**
 * Pick a dish for one slot of one day, following the variety rules:
 * no repeat the next day (breakfast) or within 3 days (lunch, dinner); favourites a bit more
 * often; hidden dishes never; batch-cooking dishes preferred; the eggs limit respected.
 */
export function pick(slot, day, history, m, { eggsLeft = EGG_LIMIT, type = 'push' } = {}) {
  const list = slotOptions(slot, m);
  const recent = (n) => { const s = new Set(); for (let i = 1; i <= n; i++) { const id = history[addDays(day, -i)]?.[slot]; if (id) s.add(id); } return s; };
  const banned = recent(NO_REPEAT_DAYS[slot] || 1);
  const week = recent(6);
  let best = null; let bestScore = -1;
  for (const r of list) {
    if (banned.has(r.id) && list.length > banned.size) continue;
    const eggs = recipeEggs(r);
    if (eggs > eggsLeft) continue;
    let s = 1;
    if ((m.fav || []).includes(r.id)) s *= 1.6;
    if (r.batch) s *= 1.25;
    if (r.variant) s *= 0.75;
    if (week.has(r.id)) s *= 0.3;
    if (type === 'legs' && (r.tags || []).includes('legs')) s *= 1.2;
    s *= 0.55 + 0.45 * hash(`${day}|${slot}|${r.id}`);
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best || list.find((r) => recipeEggs(r) <= eggsLeft) || list[0] || null;
}

/** Choose (or reuse) the dishes for a day. Mutates m.plan[day]. */
export function chooseDay(m, day, type) {
  const prior = m.plan[day] || {};
  const chosen = { ...prior };
  const eggsOf = (slot) => recipeEggs(recipeById(chosen[slot]));
  if (!chosen.lunch) chosen.lunch = pick('lunch', day, m.plan, m, { type })?.id;
  if (!chosen.breakfast) chosen.breakfast = pick('breakfast', day, m.plan, m, { eggsLeft: EGG_LIMIT - eggsOf('lunch'), type })?.id;
  for (const slot of ['shake', 'snack', 'pregym']) if (!chosen[slot]) chosen[slot] = pick(slot, day, m.plan, m, { type })?.id;
  const small = eggsOf('snack') + (type === 'rest' ? 0 : eggsOf('pregym'));
  if (!chosen.dinner) chosen.dinner = pick('dinner', day, m.plan, m, { eggsLeft: EGG_LIMIT - eggsOf('lunch') - eggsOf('breakfast') - small, type })?.id;
  chosen.bedtime = 'louiza';
  for (const k of Object.keys(chosen)) if (!chosen[k]) delete chosen[k];
  m.plan[day] = chosen;
  return chosen;
}

// ---------- building and sizing a day ----------
/** One serving's items (a recipe written for a batch, like the brownie tray, is divided). */
function itemsOf(r, { carbFactor = 1 } = {}) {
  const k = 1 / (r.serves || 1);
  return (r.ing || []).map(([id, g, o = {}]) => [id, (o.carb ? Math.round(g * carbFactor) : g) * k, k !== 1 && o.n ? { ...o, n: Math.round(o.n * k * 10) / 10 } : o]);
}

/**
 * The full day: every meal with its items, grams, kcal and protein, sized to the day type.
 * Portions of breakfast, shake, snack and dinner are then nudged (½ … 1½) so the day lands
 * near its calorie target; lunch keeps the carb amount set by the day type; protein stays up.
 */
export function buildDay(m, day, type, { nextDayBonus = null } = {}) {
  const t = type || 'push';
  const chosen = chooseDay(m, day, t);
  const training = t !== 'rest';
  const times = m.times;
  const meals = [];
  const add = (slot, time, recipeId, items, extra = {}) => meals.push({ slot, time, recipeId, items, portion: 1, fixed: false, tags: [], ...extra });

  const bf = recipeById(chosen.breakfast);
  if (bf) {
    const items = [...itemsOf(bf), ...itemsOf(RECIPE_BY_ID['orange-juice']).map(([id, g, o]) => [id, g, { ...o, side: true, en: 'Fresh orange juice', ar: 'عصير الليمون' }])];
    if (nextDayBonus) items.push(nextDayBonus.item);
    add('breakfast', times.breakfast, bf.id, items, nextDayBonus ? { tags: [nextDayBonus.tag] } : {});
  }
  const sh = recipeById(chosen.shake);
  if (sh) add('shake', times.shake, sh.id, itemsOf(sh));
  const lu = recipeById(chosen.lunch);
  if (lu) {
    const factor = LUNCH_CARB[t] / 120;
    const carbItem = (lu.ing || []).find(([, , o]) => o?.carb);
    add('lunch', times.lunch, lu.id, itemsOf(lu, { carbFactor: factor }), {
      fixed: true,
      tags: carbItem && factor !== 1 ? [{ key: 'carbs', id: carbItem[0], g: Math.round(carbItem[1] * factor) }] : [],
    });
  }
  const sn = recipeById(chosen.snack);
  if (sn && !(m.trim === 'bread' && sn.id === 'work-snack')) add('snack', times.snack, sn.id, itemsOf(sn));
  else if (sn) add('snack', times.snack, sn.id, itemsOf(sn).filter(([id]) => id !== 'bread-ww'), { tags: [{ key: 'trimmed' }] });
  if (m.extraShake) add('shake2', times.snack, 'shake', itemsOf(RECIPE_BY_ID.shake), { fixed: true, tags: [{ key: 'extra-shake' }] });
  if (training) {
    const pg = recipeById(chosen.pregym);
    if (pg) {
      const items = itemsOf(pg);
      if (t === 'legs') items.push(['dates', 16, { n: 2, en: '2 extra dates (legs day)', ar: 'جوج تمرات زايدين (نهار الرجلين)' }]);
      add('pregym', times.pregym, pg.id, items, t === 'legs' ? { tags: [{ key: 'legs-day' }] } : {});
    }
  }
  const di = recipeById(chosen.dinner);
  if (di) {
    const items = itemsOf(di);
    const eggsSoFar = eggsCount(meals) + recipeEggs(di);
    if (di.sides || di.sidesNoEggs) {
      const eggsAllowed = di.sidesNoEggs ? 0 : Math.max(0, Math.min(2, EGG_LIMIT - eggsSoFar));
      if (eggsAllowed) items.push(['egg', eggsAllowed * 50, { n: eggsAllowed, side: true, en: eggsAllowed === 2 ? '2 eggs' : '1 egg', ar: eggsAllowed === 2 ? 'جوج بيضات' : 'بيضة' }]);
      items.push(DINNER_SIDES[1]);
      if (t === 'legs') items.push(['bread-ww', 60, { side: true, en: 'Extra ½ khobz (legs day)', ar: 'نص خبزة زايدة (نهار الرجلين)' }]);
      if (training && m.trim !== 'milk') items.push(DINNER_SIDES[2]);
    }
    add('dinner', training ? times.dinner : times.restDinner, di.id, items);
  }
  add('bedtime', times.bedtime, 'louiza', itemsOf(RECIPE_BY_ID.louiza), { fixed: true });
  for (const meal of meals) Object.assign(meal, itemsNutrition(meal.items));
  const target = m.targets[t] + (m.baseline || 0);
  fitDay(meals, target, m.protein);
  return { day, type: t, meals, target, totals: totalsOf(meals), eggs: eggsCount(meals) };
}

export function eggsCount(meals) {
  let e = 0;
  for (const meal of meals) for (const [id, g, o = {}] of meal.items) if (id === 'egg') e += (o.n ?? g / 50) * (meal.portion || 1);
  return Math.round(e * 10) / 10;
}

export function totalsOf(meals) {
  const n = ZERO();
  for (const meal of meals) addN(n, meal.n);
  return n;
}

const STEPS = [0.5, 0.75, 1, 1.25, 1.5];
const MIN_PORTION = { breakfast: 0.75, dinner: 0.75, shake: 0.5, snack: 0.5 }; // meals stay recognisable

/** Nudge portions so the day lands within ~100 kcal of target, keeping protein ≥ target. */
export function fitDay(meals, target, protein = PROTEIN_MIN) {
  const flexible = meals.filter((x) => !x.fixed && ['breakfast', 'shake', 'snack', 'dinner'].includes(x.slot));
  const base = new Map(meals.map((x) => [x, { n: { ...x.n }, grams: x.grams }]));
  const apply = (meal, p) => {
    const b = base.get(meal);
    meal.portion = p;
    meal.n = addN(ZERO(), b.n, p);
    meal.grams = b.grams * p;
  };
  for (let guard = 0; guard < 20; guard++) {
    const tot = totalsOf(meals);
    const diff = tot.kcal - target;
    if (Math.abs(diff) <= 100) break;
    let bestMove = null; let bestGain = -Infinity;
    for (const meal of flexible) {
      const i = STEPS.indexOf(meal.portion);
      const j = diff > 0 ? i - 1 : i + 1;
      if (j < 0 || j >= STEPS.length || STEPS[j] < (MIN_PORTION[meal.slot] ?? 0.5)) continue;
      const b = base.get(meal);
      const dk = b.n.kcal * (STEPS[j] - meal.portion);
      const dp = b.n.p * (STEPS[j] - meal.portion);
      if (diff > 0 && tot.p + dp < protein) continue; // never trim below the protein target
      const gain = Math.abs(diff) - Math.abs(diff + dk);
      // Spread changes: prefer the meal that stays closest to its normal size
      const score = gain > 0 ? gain - 400 * Math.abs(STEPS[j] - 1) : 0;
      if (gain > 0 && (bestMove === null || score > bestGain)) { bestGain = score; bestMove = [meal, STEPS[j]]; }
    }
    if (!bestMove) break;
    apply(...bestMove);
  }
  return meals;
}

// ---------- your training session ----------
/** Measure a session: sets, % of plan, volume, minutes, muscle groups, rating. */
export function measureSession(gym, day) {
  const all = sessionsFromLog((gym.log || []).filter((s) => s.day === day), gym.adapt || {});
  if (!all.length) return null;
  const sets = all.flatMap((s) => s.sets);
  const plannedSets = all.reduce((t, s) => t + s.plannedSets, 0);
  const doneSets = all.reduce((t, s) => t + s.doneSets, 0);
  const volume = sets.reduce((t, s) => t + s.kg * s.reps, 0);
  const ts = sets.map((s) => s.ts).sort((a, b) => a - b);
  const minutes = Math.max(5, Math.round((ts.at(-1) - ts[0]) / 60000 + 2.5));
  const groups = {};
  for (const s of sets) { const g = EX_BY_ID[s.ex]?.group || 'Other'; groups[g] = (groups[g] || 0) + 1; }
  for (const g of Object.keys(groups)) groups[g] /= sets.length;
  const meta = (gym.sessions || []).filter((x) => x.day === day).at(-1);
  const pday = all[0].pday;
  return {
    day, pday, workingSets: sets.length, plannedSets, pct: plannedSets ? Math.min(1.5, doneSets / plannedSets) : 1,
    volume: Math.round(volume), minutes, groups, legsShare: groups.Legs || 0,
    rating: meta?.rating || null, finished: !!meta,
  };
}

/** Energy used ≈ MET × body weight × hours (+10% when legs are half the sets or more). */
export function sessionEnergy(sess, kg) {
  const met = MET[sess.rating] ?? MET.good;
  return Math.round(met * kg * (sess.minutes / 60) * (sess.legsShare >= 0.5 ? 1.1 : 1));
}

export function plannedEnergy(type, minutes, kg) {
  if (type === 'rest') return 0;
  return Math.round(MET.good * kg * (minutes / 60) * (type === 'legs' ? 1.1 : 1));
}

const minutesOf = (t) => { const [h, mi] = t.split(':').map(Number); return h * 60 + mi; };

/**
 * Adjust today's remaining (not yet logged) meals to what you actually trained.
 * Returns {changes: [{slot, items, kcal, p, key}], reasons, delta, note, sleep}.
 */
export function adaptDay(plan, ctx) {
  const { session, kg, plannedMinutes = 60, logged = {}, now = null, times = DEFAULT_TIMES, yesterday = null } = ctx;
  const out = { changes: [], reasons: [], delta: 0, rest: false, sleep: false, energy: null, extra: 0 };
  const open = (slot) => plan.meals.find((x) => x.slot === slot && !logged[slot]);
  const nowMin = now ?? 24 * 60;
  const push = (slot, item, key) => {
    const meal = open(slot);
    if (!meal) return false;
    const n = itemsNutrition([item]).n;
    out.changes.push({ slot, items: [item], kcal: n.kcal, p: n.p, key });
    out.delta += n.kcal;
    return true;
  };
  const eggs = () => plan.eggs + out.changes.flatMap((c) => c.items).filter(([id]) => id === 'egg').length;

  // Next day after a big legs session or a "Too much" one: a slightly bigger breakfast
  if (yesterday && (yesterday.rating === 'too-much' || (yesterday.legsShare >= 0.5 && (yesterday.workingSets >= 16 || ['hard', 'too-much'].includes(yesterday.rating))))) {
    const bf = open('breakfast');
    if (bf) {
      const item = /pancakes/.test(bf.recipeId)
        ? ['@pancakes', 1 / 3, { en: '+1 pancake', ar: '+ بانكيكة وحدة' }]
        : ['bread-ww', 60, { en: '+½ khobz', ar: '+ نص خبزة' }];
      if (push('breakfast', item, 'next-day')) out.reasons.push({ key: 'next-day', legs: yesterday.legsShare >= 0.5 });
    }
  }

  if (plan.type === 'rest') { clampAdapt(out, plan); return out; }

  const gymOver = nowMin >= minutesOf(times.gymEnd) + 30;
  if (!session) {
    if (gymOver) { restSizing(plan, out, open); out.reasons.push({ key: 'skipped' }); }
    clampAdapt(out, plan);
    return out;
  }
  const energy = sessionEnergy(session, kg);
  out.energy = energy;
  const expected = plannedEnergy(plan.type, plannedMinutes, kg);
  const ended = session.finished || gymOver;
  if (ended && session.pct < 0.5) {
    restSizing(plan, out, open);
    out.reasons.push({ key: 'stopped', pct: session.pct });
    clampAdapt(out, plan);
    return out;
  }
  const extra = energy - expected;
  if (extra > 40) {
    out.extra = extra;
    // Extra energy as carbs: ~70% rice at dinner, the rest dates at bedtime
    const riceG = Math.round((extra * 0.7) / 3.65 / 5) * 5;
    const datesN = Math.max(1, Math.round((extra * 0.3) / 22.6));
    if (riceG >= 10) push('dinner', ['rice', riceG, { en: `+${riceG} g rice`, ar: `+${riceG} غ روز`, carbAdd: true }], 'more');
    push('bedtime', ['dates', datesN * 8, { n: datesN, en: `+${datesN} dates`, ar: `+${datesN} تمرات` }], 'more');
    out.reasons.push({ key: 'more', minutes: session.minutes, rating: session.rating, legs: session.legsShare >= 0.5 });
  }
  const bigLegs = session.legsShare >= 0.5 && (session.workingSets >= 16 || ['hard', 'too-much'].includes(session.rating));
  if (session.workingSets > 20 || bigLegs) {
    const item = eggs() < EGG_LIMIT && !open('bedtime')
      ? ['egg', 50, { n: 1, en: '+1 egg', ar: '+ بيضة' }]
      : ['milk', 250, { u: 'ml', en: '+ a glass of milk', ar: '+ كاس ديال الحليب' }];
    if (push(item[0] === 'egg' ? 'dinner' : 'bedtime', item, 'protein')) out.reasons.push({ key: 'protein', sets: session.workingSets, legs: bigLegs });
  }
  if (session.rating === 'too-much') {
    push('dinner', ['dates', 32, { n: 4, en: '+4 dates (recovery)', ar: '+4 تمرات (للريكوبيراسيون)' }], 'recovery');
    if (!out.changes.some((c) => c.items.some(([id]) => id === 'milk'))) push('bedtime', ['milk', 250, { u: 'ml', en: '+ a glass of milk', ar: '+ كاس ديال الحليب' }], 'recovery');
    out.sleep = true;
    out.reasons.push({ key: 'recovery' });
  }
  clampAdapt(out, plan);
  return out;
}

/** Rest-day sizing for the meals you haven't eaten yet (workout skipped or stopped early). */
function restSizing(plan, out, open) {
  out.rest = true;
  const lunch = open('lunch');
  if (lunch && plan.type !== 'rest') {
    const carb = lunch.items.find(([, , o]) => o?.carb);
    if (carb) {
      const restG = Math.round((carb[1] * LUNCH_CARB.rest) / LUNCH_CARB[plan.type]);
      const n = itemsNutrition([[carb[0], restG - carb[1]]]).n;
      out.changes.push({ slot: 'lunch', items: [[carb[0], restG - carb[1], { en: `${restG} g instead of ${carb[1]} g`, ar: `${restG} غ عوض ${carb[1]} غ` }]], kcal: n.kcal, p: n.p, key: 'rest' });
      out.delta += n.kcal;
    }
  }
  const pg = open('pregym');
  if (pg) { out.changes.push({ slot: 'pregym', remove: true, items: [], kcal: -pg.n.kcal, p: -pg.n.p, key: 'rest' }); out.delta -= pg.n.kcal; }
  const di = open('dinner');
  if (di) {
    const drop = di.items.filter(([id, , o]) => (id === 'milk' && o?.side !== false && o?.en === 'A glass of milk') || /legs day/.test(o?.en || ''));
    if (drop.length) {
      const n = itemsNutrition(drop).n;
      out.changes.push({ slot: 'dinner', items: drop.map(([id, g, o]) => [id, -g, { ...o, en: `No ${o.en.toLowerCase()}`, ar: `بلا ${o.ar}` }]), kcal: -n.kcal, p: -n.p, key: 'rest' });
      out.delta -= n.kcal;
    }
  }
}

/** Limits: ±400 kcal per day, protein never below 120 g, eggs limit. */
function clampAdapt(out, plan) {
  if (out.delta > MAX_ADAPT || out.delta < -MAX_ADAPT) {
    const k = (Math.sign(out.delta) * MAX_ADAPT) / out.delta;
    for (const c of out.changes) {
      c.kcal *= k; c.p *= k;
      c.items = c.items.map(([id, g, o]) => [id, Math.round(g * k), o]);
    }
    out.delta = Math.sign(out.delta) * MAX_ADAPT;
    out.clamped = true;
  }
  const protein = plan.totals.p + out.changes.reduce((t, c) => t + c.p, 0);
  if (protein < PROTEIN_MIN) {
    const glass = itemsNutrition([['milk', 250]]).n;
    out.changes.push({ slot: 'bedtime', items: [['milk', 250, { u: 'ml', en: '+ a glass of milk (protein)', ar: '+ كاس ديال الحليب (بروتين)' }]], kcal: glass.kcal, p: glass.p, key: 'protein-floor' });
    out.delta += glass.kcal;
  }
}

/** The day plan with the adaptive changes applied (for display and logging). */
export function applyAdapt(plan, adapt) {
  if (!adapt || !adapt.changes.length) return plan;
  const meals = plan.meals.map((meal) => {
    const cs = adapt.changes.filter((c) => c.slot === meal.slot);
    if (!cs.length) return meal;
    if (cs.some((c) => c.remove)) return { ...meal, removed: true, n: ZERO(), grams: 0 };
    const items = [...meal.items];
    const n = { ...meal.n };
    let grams = meal.grams;
    const tags = [...meal.tags];
    for (const c of cs) {
      for (const it of c.items) items.push(it);
      n.kcal += c.kcal; n.p += c.p;
      const more = itemsNutrition(c.items.map(([id, g]) => [id, g]));
      n.c += more.n.c; n.f += more.n.f;
      grams += more.grams;
      tags.push({ key: 'adapt', items: c.items });
    }
    return { ...meal, items, n, grams, tags, adapted: true };
  });
  return { ...plan, meals, totals: totalsOf(meals.filter((x) => !x.removed)), adapted: adapt };
}

// ---------- weekly ----------
export function weekStart(day) {
  const d = parseDay(day);
  return addDays(day, -((d.getDay() + 6) % 7)); // Monday
}

/** Average weight per week (kg) from the weight tracker, oldest first; the first week is ignored (water). */
export function weeklyWeights(weights, today = dayKey(), weeks = 4) {
  const firstDay = weights.length ? weights.map((w) => w.day).sort()[0] : null;
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(today, -7 * i); const start = addDays(end, -6);
    const vals = weights.filter((w) => w.day >= start && w.day <= end && (!firstDay || w.day > addDays(firstDay, 6))).map((w) => w.kg);
    out.push(vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  }
  return out;
}

/** Gain per week for the last two weeks, [older, latest] (null when not enough data). */
export function weeklyGains(weights, today = dayKey()) {
  const w = weeklyWeights(weights, today, 3);
  return [w[0] !== null && w[1] !== null ? w[1] - w[0] : null, w[1] !== null && w[2] !== null ? w[2] - w[1] : null];
}

/** Suggestions from the weight trend (shown, never applied without you). */
export function weightSuggestions(weights, today = dayKey()) {
  const [a, b] = weeklyGains(weights, today);
  if (a === null || b === null) return [];
  if (a > 0.5 && b > 0.5) return [{ key: 'fast', gain: b }];
  if (a < 0.25 && b < 0.25) return [{ key: 'slow', gain: b }];
  return [];
}

/**
 * Weekly baseline change: volume rising but weight gain under 0.25 kg/week → +125 kcal;
 * gaining over 0.5 kg/week with steady training → −125 kcal; fewer sessions than planned → no raise.
 */
export function weeklyBaseline(gym, weights, plannedPerWeek, today = dayKey()) {
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7); const prevWeek = addDays(thisWeek, -14);
  const vol = (from, to) => (gym.log || []).filter((s) => s.day >= from && s.day < to).reduce((t, s) => t + s.kg * s.reps, 0);
  const sessions = (from, to) => new Set((gym.log || []).filter((s) => s.day >= from && s.day < to).map((s) => s.day)).size;
  const vLast = vol(lastWeek, thisWeek); const vPrev = vol(prevWeek, lastWeek);
  const sLast = sessions(lastWeek, thisWeek);
  const [, gain] = weeklyGains(weights, addDays(thisWeek, -1));
  if (gain === null) return { delta: 0, key: null };
  const fewer = sLast < plannedPerWeek;
  const rising = vPrev > 0 && vLast > vPrev * 1.05;
  if (rising && gain < 0.25 && !fewer) return { delta: 125, key: 'raise', gain, vLast, vPrev };
  if (gain > 0.5 && !fewer) return { delta: -125, key: 'lower', gain };
  if (fewer && gain < 0.25) return { delta: 0, key: 'fewer', gain };
  return { delta: 0, key: null, gain };
}

/** Planned minutes for the program day (coach estimate), used for "more than planned". */
export function plannedMinutesFor(gym, today = dayKey()) {
  const prog = PROGRAMS[gym.program];
  if (!prog) return 60;
  try {
    const a = analyze(gym, today);
    const sets = (gym.log || []).filter((s) => s.day === today && s.pday);
    const idx = sets.length ? +sets[0].pday.split(':')[1] : nextDay(gym, prog, a, today).idx;
    return adaptPlan(gym, idx, a).minutes || 60;
  } catch {
    return 60;
  }
}
