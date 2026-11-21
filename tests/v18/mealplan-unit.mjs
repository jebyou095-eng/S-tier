// Meal plan rules (node tests/v18/mealplan-unit.mjs). No browser needed: the rules are pure.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = (f) => import(path.join(ROOT, 'js', f));
const db = await J('fooddb.js');
db.useFoodDb(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'foods-morocco.json'))));
const mp = await J('mealplan.js');
const { RECIPES, RECIPE_BY_ID } = await J('recipes.js');
const { addDays, parseDay } = await J('stats.js');

let pass = 0; let fail = 0;
const ok = (cond, name, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------- nutrition comes from the database ----------
{
  const info = db.ingredientInfo;
  const r = RECIPE_BY_ID.pancakes;
  let kcal = 0;
  for (const [id, g] of r.ing) kcal += (info(id).n.kcal * g) / 100;
  const n = mp.recipeNutrition(r).n;
  ok(near(n.kcal, kcal, 0.01), 'pancakes kcal = sum of database values', `${n.kcal} vs ${kcal}`);
  ok(near(mp.recipeNutrition(RECIPE_BY_ID.lentils).n.kcal - 0, 354, 30), 'lentil tagine ≈ 350 kcal (lentils alone ≈ 246)');
  ok(near(mp.recipeNutrition(r, { servings: 2 }).n.kcal, 2 * kcal, 0.01), 'servings stepper scales every amount');
  const noOil = mp.recipeNutrition(r, { mult: { 'veg-oil': 0 } }).n.kcal;
  ok(near(kcal - noOil, (info('veg-oil').n.kcal * 7.5) / 100, 0.01), 'swap item: None removes that ingredient');
  const missing = RECIPES.flatMap((x) => mp.recipeNutrition(x).missing);
  ok(missing.length === 0, 'every recipe ingredient is in the food database', missing.join(','));
  ok(RECIPES.every((x) => !(x.ing || []).some(([id]) => id === 'zucchini')), 'no courgette in any recipe');
  ok(RECIPES.every((x) => x.ar && x.name), 'every recipe has an English and an Arabic name');
  ok(RECIPES.filter((x) => !x.same).every((x) => x.steps.en.length && x.steps.en.length === x.steps.ar.length), 'cooking steps in both languages');
  const sugar = RECIPES.flatMap((x) => (x.ing || []).filter(([id]) => id === 'sugar').map(([, g]) => g));
  ok(sugar.every((g) => g <= 4), 'sugar at most 1 tsp');
}

// ---------- day type ----------
const state = (over = {}) => ({ food: { meals: mp.freshMeals(), ...over.food }, gym: { program: 'ppla', log: [], sessions: [], adapt: {}, ...over.gym } });
{
  const today = '2026-11-23'; // Monday
  let s = state();
  ok(mp.detectDayType(s, today, today).type === null, 'unknown day type → chips (null)');
  s.food.meals.dayType[today] = 'legs';
  ok(mp.detectDayType(s, today, today).type === 'legs', 'manual pick wins');
  s = state({ gym: { log: [{ day: today, ts: 1, ex: 'back-squat', kg: 60, reps: 8, pday: 'ppla:2' }] } });
  ok(mp.detectDayType(s, today, today).type === 'legs', 'logged sets → that day type (Legs + Arms)');
  s = state(); s.food.meals.trainDays = [1, 3, 5];
  ok(mp.detectDayType(s, today, today).type === 'push', 'training weekday → next program day (Push)');
  ok(mp.detectDayType(s, '2026-11-24', today).type === 'rest', 'non-training weekday → rest');
  ok(mp.detectDayType(s, '2026-11-25', today).type === 'pull', 'next training day → Pull');
  ok(mp.detectDayType(s, '2026-11-27', today).type === 'legs', 'third training day → Legs + Arms');
  ok(mp.typeOfProgramDay('Legs + Arms') === 'legs' && mp.typeOfProgramDay('Upper 1') === 'push', 'program day names map to types');
}

// ---------- portions by day type ----------
{
  const m = mp.freshMeals();
  const d = '2026-12-01';
  m.plan[d] = { breakfast: 'pancakes', shake: 'shake', lunch: 'fried-rice', snack: 'work-snack', pregym: 'pregym', dinner: 'lentils' };
  const days = {};
  for (const ty of ['rest', 'push', 'legs']) { m.plan[d] = { ...m.plan[d] }; days[ty] = mp.buildDay(m, d, ty); }
  const rice = (p) => p.meals.find((x) => x.slot === 'lunch').items.find(([id]) => id === 'rice')[1];
  ok(rice(days.rest) === 100 && rice(days.push) === 120 && rice(days.legs) === 160, 'lunch carbs 100 / 120 / 160 g dry');
  for (const ty of ['rest', 'push', 'legs']) ok(near(days[ty].totals.kcal, m.targets[ty], 150), `${ty} day ≈ ${m.targets[ty]} kcal`, Math.round(days[ty].totals.kcal));
  ok(!days.rest.meals.some((x) => x.slot === 'pregym'), 'no pre-gym snack on rest days');
  ok(!days.rest.meals.find((x) => x.slot === 'dinner').items.some(([id, , o]) => id === 'milk' && o?.side), 'rest day: no milk at dinner/bed');
  ok(days.rest.meals.find((x) => x.slot === 'dinner').time === '20:00' && days.push.meals.find((x) => x.slot === 'dinner').time === '21:30', 'dinner 20:00 on rest days, 21:30 on training days');
  const legsDinner = days.legs.meals.find((x) => x.slot === 'dinner').items;
  ok(legsDinner.filter(([id]) => id === 'bread-ww').length === 2, 'legs day: extra ½ khobz at dinner');
  ok(days.legs.meals.find((x) => x.slot === 'pregym').items.some(([id, g]) => id === 'dates' && g === 16), 'legs day: 2 extra dates before the gym');
  for (const ty of ['rest', 'push', 'legs']) ok(days[ty].totals.p >= 120, `${ty}: protein ≥ 120 g`, Math.round(days[ty].totals.p));
  const pRange = Object.values(days).map((x) => x.totals.p);
  ok(Math.max(...pRange) - Math.min(...pRange) < 35, 'protein stays about the same across day types', pRange.map(Math.round).join('/'));
  ok(days.push.meals.find((x) => x.slot === 'breakfast').items.some(([id]) => id === 'orange-juice'), 'breakfast comes with fresh orange juice');
  ok(days.push.meals.some((x) => x.slot === 'bedtime' && x.recipeId === 'louiza'), 'louiza at bedtime');
  ok(days.push.eggs <= 4, 'fried rice day: eggs ≤ 4 (no eggs at dinner)', days.push.eggs);
  ok(!legsDinner.some(([id, , o]) => id === 'egg' && o?.side), 'fried rice (3 eggs) → no eggs at dinner');
}

// ---------- rotation ----------
{
  const m = mp.freshMeals();
  m.fav = ['chermoula-chicken'];
  m.hide = ['harira'];
  const start = '2026-12-07';
  const types = ['push', 'rest', 'pull', 'rest', 'legs', 'rest', 'rest'];
  const plans = [];
  for (let w = 0; w < 4; w++) for (let i = 0; i < 7; i++) plans.push(mp.buildDay(m, addDays(start, w * 7 + i), types[i]));
  for (const slot of ['breakfast', 'shake', 'lunch', 'snack', 'pregym', 'dinner']) ok(mp.optionsFor(slot, mp.freshMeals()).length >= 6, `${slot}: at least 6 options`, mp.optionsFor(slot, mp.freshMeals()).length);
  const id = (p, s) => p.meals.find((x) => x.slot === s)?.recipeId;
  let bfRepeat = 0; let ldRepeat = 0;
  plans.forEach((p, i) => {
    if (i && id(p, 'breakfast') === id(plans[i - 1], 'breakfast')) bfRepeat++;
    for (const s of ['lunch', 'dinner']) for (let k = 1; k <= 3 && i - k >= 0; k++) if (id(p, s) === id(plans[i - k], s)) ldRepeat++;
  });
  ok(bfRepeat === 0, 'no same breakfast 2 days in a row');
  ok(ldRepeat === 0, 'no same lunch or dinner within 3 days');
  for (let w = 0; w < 4; w++) {
    const wk = plans.slice(w * 7, w * 7 + 7);
    ok(new Set(wk.map((p) => id(p, 'lunch'))).size >= 5 && new Set(wk.map((p) => id(p, 'dinner'))).size >= 5, `week ${w + 1}: ≥ 5 different lunches and dinners`);
  }
  ok(!plans.some((p) => id(p, 'dinner') === 'harira'), '"Don\'t suggest" dish never appears');
  ok(plans.every((p) => p.eggs <= 4), 'max 4 eggs every day', plans.map((p) => p.eggs).join(','));
  const favCount = plans.filter((p) => id(p, 'lunch') === 'chermoula-chicken').length;
  const avg = 28 / mp.optionsFor('lunch', m).length;
  ok(favCount >= avg, 'favourite comes up more than average', `${favCount} vs ${avg.toFixed(1)}`);
  const again = mp.buildDay(m, start, 'push');
  ok(id(again, 'lunch') === id(plans[0], 'lunch'), 'a day keeps its dishes (stable plan)');
}

// ---------- adaptive meals ----------
const DAY = '2026-12-14';
const T = (min) => new Date(`${DAY}T20:00`).getTime() + min * 60000;
function sessionLog(pday, exercises, minutes) {
  const log = []; let t = 0; const per = minutes / exercises.reduce((n, [, s]) => n + s, 0);
  for (const [ex, sets, kg = 40] of exercises) for (let i = 0; i < sets; i++) { log.push({ id: `${ex}${i}`, day: DAY, ts: T(t), ex, kg, reps: 8, pday }); t += per; }
  return log;
}
function adaptCase(type, gym, { now = 23 * 60, logged = {}, yesterday = null } = {}) {
  const m = mp.freshMeals();
  const plan = mp.buildDay(m, DAY, type);
  const session = mp.measureSession(gym, DAY);
  return { plan, session, a: mp.adaptDay(plan, { session, kg: 63, plannedMinutes: 60, logged, now, yesterday }) };
}
{
  // skipped day
  const s1 = adaptCase('push', { log: [], sessions: [] });
  ok(s1.a.rest && s1.a.reasons.some((r) => r.key === 'skipped'), 'skipped workout → rest-day sizing');
  ok(s1.a.changes.some((c) => c.slot === 'pregym' && c.remove), 'skipped: pre-gym snack dropped');
  ok(s1.a.changes.some((c) => c.slot === 'lunch' && c.kcal < 0), 'skipped: lunch carbs cut to rest size');
  const early = adaptCase('push', { log: [], sessions: [] }, { now: 18 * 60 });
  ok(!early.a.changes.length, 'before the gym window ends nothing changes');
  // half session (stopped before 50%)
  const half = adaptCase('push', { log: sessionLog('ppla:0', [['bench-press', 4], ['ohp', 2]], 20), sessions: [{ day: DAY, pday: 'ppla:0', rating: 'good' }] });
  ok(half.session.pct < 0.5 && half.a.reasons.some((r) => r.key === 'stopped'), 'stopped before 50% → rest-day sizing', half.session.pct);
  // easy push day: shorter and easy → no extra
  const easy = adaptCase('push', { log: sessionLog('ppla:0', [['bench-press', 4], ['ohp', 3], ['db-incline-press', 3], ['lateral-raise', 4], ['pushdown', 3]], 45), sessions: [{ day: DAY, pday: 'ppla:0', rating: 'easy' }] });
  ok(easy.a.changes.length === 0 && !easy.a.rest, 'easy push day within plan → no change');
  const e1 = mp.sessionEnergy(easy.session, 63);
  ok(near(e1, 3.5 * 63 * (easy.session.minutes / 60), 1), 'energy = MET 3.5 × kg × hours for Easy', e1);
  // hard legs day
  const legsEx = [['back-squat', 4, 80], ['rdl', 3, 70], ['leg-press', 3, 120], ['leg-curl', 2, 40], ['calf-raise', 3, 60], ['barbell-curl', 3, 25], ['oh-extension', 3, 20]];
  const hard = adaptCase('legs', { log: sessionLog('ppla:2', legsEx, 85), sessions: [{ day: DAY, pday: 'ppla:2', rating: 'hard' }] });
  ok(hard.session.legsShare >= 0.5 && hard.session.workingSets === 21, 'session measure: 21 sets, mostly legs');
  ok(near(mp.sessionEnergy(hard.session, 63), 6 * 63 * (hard.session.minutes / 60) * 1.1, 1), 'Hard legs: MET 6 + 10%');
  ok(hard.a.changes.some((c) => c.slot === 'dinner' && c.items.some(([id]) => id === 'rice')), 'trained more → rice added to dinner');
  ok(hard.a.changes.some((c) => c.slot === 'bedtime' && c.items.some(([id]) => id === 'dates')), 'trained more → carbs at bedtime');
  ok(hard.a.changes.some((c) => c.key === 'protein'), '> 20 sets / big legs → +10 g protein');
  const sumP = hard.a.changes.filter((c) => c.key === 'protein').reduce((n, c) => n + c.p, 0);
  ok(sumP >= 6 && sumP <= 14, 'protein add ≈ 10 g', sumP);
  // dinner already eaten: only meals not yet logged change
  const loggedDinner = adaptCase('legs', { log: sessionLog('ppla:2', legsEx, 85), sessions: [{ day: DAY, pday: 'ppla:2', rating: 'hard' }] }, { logged: { dinner: 'x' } });
  ok(!loggedDinner.a.changes.some((c) => c.slot === 'dinner'), 'logged meals are never changed');
  // too much
  const tm = adaptCase('legs', { log: sessionLog('ppla:2', legsEx, 85), sessions: [{ day: DAY, pday: 'ppla:2', rating: 'too-much' }] });
  ok(tm.a.sleep && tm.a.reasons.some((r) => r.key === 'recovery'), '"Too much" → recovery mode + sleep note');
  ok(tm.a.changes.some((c) => c.items.some(([id]) => id === 'milk')), '"Too much" → a glass of milk');
  // limits
  const huge = adaptCase('legs', { log: sessionLog('ppla:2', legsEx.map(([e, s, k]) => [e, s * 2, k]), 200), sessions: [{ day: DAY, pday: 'ppla:2', rating: 'too-much' }] });
  ok(Math.abs(huge.a.delta) <= 400.5 && huge.a.clamped, 'never more than ±400 kcal a day', huge.a.delta);
  const applied = mp.applyAdapt(huge.plan, huge.a);
  ok(applied.totals.p >= 120, 'protein never below 120 g', applied.totals.p);
  ok(mp.eggsCount(applied.meals) <= 4, 'eggs limit kept with adaptations', mp.eggsCount(applied.meals));
  // next day bonus
  const next = adaptCase('push', { log: [], sessions: [] }, { now: 9 * 60, yesterday: hard.session });
  ok(next.a.changes.some((c) => c.slot === 'breakfast' && c.key === 'next-day'), 'after a big legs day: bigger breakfast next day');
}

// ---------- weekly: rising volume, weight trend ----------
{
  const today = '2026-12-21'; // Monday
  const weights = [];
  const W = (d, kg) => weights.push({ day: d, kg });
  // first week (water) big jump is ignored; then +0.1 kg/week
  for (let i = 0; i < 7; i++) W(addDays('2026-11-23', i), 61 + i * 0.3);
  for (let i = 7; i < 28; i++) W(addDays('2026-11-23', i), 63 + Math.floor((i - 7) / 7) * 0.1);
  const gains = mp.weeklyGains(weights, addDays(today, -1));
  ok(gains[1] !== null && gains[1] < 0.25, 'weekly gain measured from 7-day averages', gains);
  const log = [];
  const addWeek = (start, kg) => { for (const k of [0, 2, 4]) for (let i = 0; i < 6; i++) log.push({ day: addDays(start, k), ts: i, ex: 'back-squat', kg, reps: 8, pday: 'ppla:2' }); };
  addWeek('2026-12-07', 60); addWeek('2026-12-14', 70);
  const res = mp.weeklyBaseline({ log }, weights, 3, today);
  ok(res.delta === 125 && res.key === 'raise', 'rising volume + slow gain → +125 kcal baseline', JSON.stringify(res));
  const fewer = mp.weeklyBaseline({ log: log.filter((s) => s.day !== '2026-12-18') }, weights, 3, today);
  ok(fewer.delta === 0, 'fewer sessions than planned → nothing raised');
  const fast = weights.map((w) => ({ ...w, kg: w.day > '2026-11-29' ? 63 + (parseDay(w.day) - parseDay('2026-11-30')) / 86400000 * 0.1 : w.kg }));
  const r2 = mp.weeklyBaseline({ log: [...log.filter((s) => s.day < '2026-12-14'), ...log.filter((s) => s.day < '2026-12-14').map((s) => ({ ...s, day: addDays(s.day, 7) }))] }, fast, 3, today);
  ok(r2.delta === -125, 'gaining > 0.5 kg/week with steady training → −125 kcal', JSON.stringify(r2));
  ok(mp.weightSuggestions(fast, addDays(today, -1)).some((s) => s.key === 'fast'), '> 0.5 kg/week for 2 weeks → suggest removing bedtime milk or snack bread');
  ok(mp.weightSuggestions(weights, addDays(today, -1)).some((s) => s.key === 'slow'), '< 0.25 kg/week for 2 weeks → suggest a second shake');
  const onlyFirstWeek = weights.slice(0, 7);
  ok(mp.weightSuggestions(onlyFirstWeek, '2026-11-30').length === 0, 'first week (water) is ignored');
}

console.log(`mealplan-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
