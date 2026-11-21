// Food tab screens for the meal plan: Today's meals, the week, My recipes, a recipe page and the
// recipe editor. The rules live in mealplan.js (pure); this file is only the screens.
import { h, uid, toast, modal, confirmDialog, langToggle, iconButton, longDate } from './ui.js';
import { t, tn, fmt, isAr, lang, dateText } from './i18n.js';
import { icon } from './icons.js';
import { dayKey, addDays, parseDay } from './stats.js';
import { ingredientInfo } from './fooddb.js';
import { RECIPES } from './recipes.js';
import {
  DAY_TYPES, buildDay, detectDayType, adaptDay, applyAdapt, measureSession, sessionEnergy, recipeById, recipeNutrition,
  itemsNutrition, weekStart, weeklyBaseline, weightSuggestions, plannedMinutesFor, DEFAULT_TIMES, DEFAULT_TARGETS,
} from './mealplan.js';
import { editPhoto } from './photoedit.js';

let mode = 'today'; // today | week
let openRecipe = null; // {id, from: 'recipes'|'meals', slot, day}
let filter = 'all';
let query = '';
let servings = 1;
let mult = {};

const SLOT_TO_DIARY = { breakfast: 'breakfast', shake: 'snack', lunch: 'lunch', snack: 'snack', pregym: 'snack', dinner: 'dinner', bedtime: 'snack', shake2: 'snack', drink: 'snack' };
const FILTERS = { all: null, breakfast: ['breakfast'], lunch: ['lunch'], dinner: ['dinner'], drinks: ['shake', 'drink'], snacks: ['snack', 'pregym'] };

const M = (api) => api.F().meals;
const kg = (api) => api.F().profile?.weightKg || 63;
const recipeName = (r) => (isAr() ? r.ar || r.name : r.name || r.ar);
const recipeAlt = (r) => (isAr() ? r.name : r.ar);

/** Label of an ingredient row in one language (falls back to the food database name). */
function ingLabel(id, o = {}, l = lang()) {
  if (id.startsWith('@')) { const r = recipeById(id.slice(1)); return (l === 'ar' ? o.ar : o.en) || (r ? (l === 'ar' ? r.ar : r.name) : id); }
  if (l === 'ar' && o.ar) return o.ar;
  if (l === 'en' && o.en) return o.en;
  const info = ingredientInfo(id);
  if (!info) return id;
  return l === 'ar' ? info.ar || info.name : info.name.replace(/\s*\(.*\)$/, '');
}

/** "200 g", "2 (100 g)", "300 ml", "1 tsp". */
function qtyText(id, g, o = {}, k = 1) {
  const v = g * k;
  if (id.startsWith('@')) return `× ${fmt(v, 2)}`;
  if (o.pinch) return t('qty.pinch');
  if (o.qty && k === 1 && !isAr()) return o.qty;
  if (o.u === 'ml') return `${fmt(v)} ${t('unit.ml')}`;
  if (o.n) return `${fmt(o.n * k, 1)} (${fmt(v)} ${t('unit.g')})`;
  return `${fmt(v, v < 10 ? 1 : 0)} ${t('unit.g')}`;
}

/** A logged plan meal or recipe becomes a diary food (per 100 g, from the database). */
export function recipeFoodItem(r, n, grams, label = '') {
  const g = Math.max(1, grams);
  return {
    id: `rcp:${r.id}`, name: `${r.name}${label ? ` (${label})` : ''}`.slice(0, 80), ar: r.ar ? `${r.ar}${label ? ` (${label})` : ''}`.slice(0, 80) : '',
    source: 'Recipe', n: { kcal: (n.kcal / g) * 100, p: (n.p / g) * 100, c: (n.c / g) * 100, f: (n.f / g) * 100, fib: ((n.fib || 0) / g) * 100 },
    serving: Math.round(g), servingLabel: `1 × ${Math.round(g)} g`,
  };
}

// ---------- plan for a day (with the adaptive changes) ----------
function dayPlan(api, day = dayKey()) {
  const st = api.ctx.state;
  const m = M(api);
  const before = JSON.stringify(m.plan[day] || null);
  const det = detectDayType(st, day);
  const type = det.type || 'push';
  const plan = buildDay(m, day, type);
  const changed = JSON.stringify(m.plan[day]) !== before;
  let adapt = null;
  if (day === dayKey() && m.adaptive && !m.undo[day]) {
    const now = new Date();
    const yesterday = measureSession(st.gym, addDays(day, -1));
    adapt = adaptDay(plan, {
      session: measureSession(st.gym, day), kg: kg(api), plannedMinutes: plannedMinutesFor(st.gym, day),
      logged: m.logged[day] || {}, now: now.getHours() * 60 + now.getMinutes(), times: m.times, yesterday,
    });
  }
  return { det, plan: applyAdapt(plan, adapt), base: plan, adapt, changed };
}

function weeklyCheck(api) {
  const m = M(api);
  const ws = weekStart(dayKey());
  if (!m.adaptive || ws in m.weekly) return;
  const planned = m.trainDays.length || 3;
  const res = weeklyBaseline(api.ctx.state.gym, api.weightsKg(api.ctx.state), planned);
  m.weekly[ws] = res.delta;
  if (res.delta) m.baseline = Math.max(-500, Math.min(500, m.baseline + res.delta));
  m.weeklyKey = res.key;
  api.ctx.save();
}

// ---------- Today's meals ----------
function mealDisplayName(meal) {
  const r = recipeById(meal.recipeId);
  const name = r ? recipeName(r) : meal.recipeId;
  const sides = meal.items.filter(([, , o]) => o?.side && !o.carbAdd).map(([id, g, o]) => ingLabel(id, o).replace(/^½ |^نص /, '½ '));
  return sides.length ? `${name}${isAr() ? '، ' : ', '}${sides.join(isAr() ? '، ' : ', ')}` : name;
}

function tagFor(meal, type) {
  for (const tag of meal.tags || []) {
    if (tag.key === 'carbs') return t('meals.tag.carbs', { g: fmt(tag.g), name: ingLabel(tag.id).toLowerCase() });
    if (tag.key === 'legs-day') return t('meals.tag.legs');
    if (tag.key === 'adapt') return tag.items.map(([id, g, o]) => ingLabel(id, o)).join(' ');
    if (tag.key === 'trimmed') return t('meals.tag.trimmed');
    if (tag.key === 'extra-shake') return t('meals.tag.extraShake');
  }
  if (meal.portion && meal.portion !== 1) return t('meals.tag.portion', { p: fmt(meal.portion * 100) });
  return type === 'legs' && meal.slot === 'lunch' ? t('meals.tag.legs') : '';
}

async function logMeal(api, meal, day) {
  const r = recipeById(meal.recipeId);
  if (!r) return;
  const food = recipeFoodItem(r, meal.n, meal.grams);
  const entry = await api.addEntry(food, Math.round(meal.grams), SLOT_TO_DIARY[meal.slot] || 'snack', { recipe: r.id, slot: meal.slot, day });
  const m = M(api);
  m.logged[day] = { ...(m.logged[day] || {}), [meal.slot]: entry.id };
  await api.ctx.commit();
}

async function unlogMeal(api, meal, day) {
  const m = M(api);
  const id = m.logged[day]?.[meal.slot];
  if (!await confirmDialog(t('meals.unlogQ'), t('meals.unlogBody'), t('remove'), true)) return;
  api.F().log = api.F().log.filter((e) => e.id !== id);
  delete m.logged[day][meal.slot];
  await api.ctx.commit();
}

function reasonText(r) {
  if (r.key === 'more') return t('meals.why.more', { min: fmt(r.minutes), rating: t(`rating.${r.rating || 'good'}`), legs: r.legs ? t('meals.why.mostlyLegs') : '' });
  if (r.key === 'protein') return r.legs ? t('meals.why.bigLegs') : t('meals.why.sets', { n: fmt(r.sets) });
  if (r.key === 'stopped') return t('meals.why.stopped', { pct: fmt(r.pct * 100) });
  if (r.key === 'skipped') return t('meals.why.skipped');
  if (r.key === 'recovery') return t('meals.why.recovery');
  if (r.key === 'next-day') return r.legs ? t('meals.why.nextLegs') : t('meals.why.nextTooMuch');
  return '';
}

function changeTitle(c) {
  const slot = t(`slot.${c.slot}`);
  if (c.remove) return t('meals.change.skip', { slot });
  return `${slot} ${c.items.map(([id, g, o]) => ingLabel(id, o)).join(' ')}`;
}

function coachBanners(api, ad, day) {
  const out = [];
  const m = M(api);
  if (ad && ad.changes.length) {
    const title = ad.rest ? t('meals.restSizing') : [...new Set(ad.changes.map(changeTitle))].slice(0, 2).join(' · ');
    const why = ad.reasons.map(reasonText).filter(Boolean).join(' ');
    out.push(h('div', { class: 'coach-banner', role: 'status' },
      icon('pulse'),
      h('div', { class: 'grow-wrap' }, h('span', { class: 'title' }, title), h('span', { class: 'why' }, why, ad.clamped ? ` ${t('meals.why.clamped')}` : '')),
      h('button', { class: 'btn-undo', type: 'button', onclick: async () => { m.undo[day] = true; await api.ctx.commit(); toast(t('meals.undone')); } }, t('meals.undoToday'))));
    if (ad.sleep) out.push(h('p', { class: 'note-row' }, icon('moon', 'icon-sm'), t('meals.sleep')));
  }
  const ws = weekStart(day);
  const wk = m.weekly[ws];
  if (wk) {
    out.push(h('div', { class: 'coach-banner' }, icon('calendar'),
      h('div', { class: 'grow-wrap' }, h('span', { class: 'title' }, t(wk > 0 ? 'meals.week.raise' : 'meals.week.lower', { n: fmt(Math.abs(wk)) })),
        h('span', { class: 'why' }, t(wk > 0 ? 'meals.week.raiseWhy' : 'meals.week.lowerWhy'))),
      h('button', { class: 'btn-undo', type: 'button', onclick: async () => { m.baseline -= wk; m.weekly[ws] = 0; await api.ctx.commit(); } }, t('undo'))));
  }
  for (const s of weightSuggestions(api.weightsKg(api.ctx.state))) {
    const key = `${s.key}:${ws}`;
    if (m.dismissed.includes(key)) continue;
    if (s.key === 'fast' && m.trim) continue;
    if (s.key === 'slow' && m.extraShake) continue;
    const dismiss = async () => { m.dismissed.push(key); await api.ctx.commit(); };
    out.push(h('div', { class: 'card raised' },
      h('p', {}, t(s.key === 'fast' ? 'meals.sug.fast' : 'meals.sug.slow', { g: fmt(s.gain, 2) })),
      h('div', { class: 'row wrap' },
        ...(s.key === 'fast'
          ? [h('button', { class: 'btn ghost', onclick: async () => { m.trim = 'milk'; await dismiss(); } }, t('meals.sug.noMilk')),
            h('button', { class: 'btn ghost', onclick: async () => { m.trim = 'bread'; await dismiss(); } }, t('meals.sug.noBread'))]
          : [h('button', { class: 'btn ghost', onclick: async () => { m.extraShake = true; await dismiss(); } }, t('meals.sug.addShake'))]),
        h('button', { class: 'link small', onclick: dismiss }, t('meals.sug.keep')))));
  }
  return out;
}

function summary(api, plan, ad, session) {
  const day = plan.day;
  const eaten = api.F().log.filter((e) => e.day === day).reduce((a, e) => {
    const k = e.grams / 100;
    a.kcal += e.n.kcal * k; a.p += e.n.p * k; a.c += e.n.c * k; a.f += e.n.f * k;
    return a;
  }, { kcal: 0, p: 0, c: 0, f: 0 });
  const trained = ad?.extra > 0 ? Math.round(ad.extra) : 0;
  const target = plan.target + trained;
  const pT = Math.max(M(api).protein, 120);
  const bar = (v, max, cls) => h('div', { class: `progress thin ${cls}` }, h('div', { css: { width: `${Math.min(100, (v / Math.max(1, max)) * 100)}%` } }));
  const macros = [['protein', eaten.p, pT, 'p'], ['carbs', eaten.c, plan.totals.c, 'c'], ['fat', eaten.f, plan.totals.f, 'f']];
  return h('article', { class: 'card summary' },
    h('div', { class: 'kcal-row' },
      h('span', { class: 'kcal-big num' }, fmt(eaten.kcal), ' ', h('span', { class: 'of' }, `/ ${fmt(target)} ${t('unit.kcal')}`)),
      h('span', { class: 'muted small' }, trained ? t('meals.plusTrained', { base: fmt(plan.target), n: fmt(trained) }) : t(`daytype.${plan.type}`))),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': t('unit.kcal'), 'aria-valuenow': Math.round(eaten.kcal), 'aria-valuemax': target }, h('div', { css: { width: `${Math.min(100, (eaten.kcal / target) * 100)}%` } })),
    h('div', { class: 'macro-grid' }, ...macros.map(([k, v, max, cls]) => h('div', {},
      h('span', { class: 'lbl' }, t(`macro.${k}`)),
      h('span', { class: 'val num' }, `${fmt(v)} / ${fmt(max)} ${t('unit.g')}`),
      bar(v, max, cls)))),
    session ? h('p', { class: 'muted small' }, t('meals.session', {
      kcal: fmt(sessionEnergy(session, kg(api))), min: fmt(session.minutes), rating: t(`rating.${session.rating || 'good'}`),
      legs: session.legsShare >= 0.5 ? t('meals.why.mostlyLegs') : '',
    })) : null);
}

function mealRow(api, meal, day, type) {
  const m = M(api);
  const logged = !!m.logged[day]?.[meal.slot];
  const r = recipeById(meal.recipeId);
  const tag = tagFor(meal, type);
  const open = () => { openRecipe = { id: meal.recipeId, from: 'meals', slot: meal.slot, day, meal }; servings = 1; mult = {}; api.setSub('recipe'); };
  return h('div', { class: `meal-row${meal.removed ? ' removed' : ''}` },
    h('div', { class: 'when' }, h('span', { class: 't' }, meal.time), h('span', { class: 's' }, t(`slot.short.${meal.slot}`))),
    h('button', { class: 'what', type: 'button', onclick: open, 'aria-label': t('meals.openRecipe', { name: r ? recipeName(r) : '' }) },
      h('span', { class: 'name' }, mealDisplayName(meal)),
      h('span', { class: 'meta' }, meal.removed ? t('meals.skipToday') : t('meals.meta', { g: fmt(meal.grams), kcal: fmt(meal.n.kcal), p: fmt(meal.n.p) }),
        tag ? [' · ', h('span', { class: 'tag' }, tag)] : null)),
    meal.removed || meal.slot === 'bedtime' && meal.n.kcal < 5 ? null
      : logged ? h('button', { class: 'done-check', type: 'button', 'aria-label': t('meals.logged'), onclick: () => unlogMeal(api, meal, day) }, icon('check'))
        : h('button', { class: 'log-pill', type: 'button', onclick: () => logMeal(api, meal, day) }, t('log')));
}

function dayTypeChips(api, det, day) {
  const m = M(api);
  return h('div', { class: 'chips scroll', role: 'radiogroup', 'aria-label': t('meals.dayType') },
    ...DAY_TYPES.map((k) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(det.type === k), class: `chip${det.type === k ? ' on' : ''}`,
      onclick: async () => { m.dayType[day] = k; delete m.undo[day]; await api.ctx.commit(); },
    }, t(`daytype.${k}`))));
}

function viewToday(api) {
  const day = dayKey();
  weeklyCheck(api);
  const { det, plan, adapt, changed } = dayPlan(api, day);
  if (changed) api.ctx.save();
  const m = M(api);
  const session = measureSession(api.ctx.state.gym, day);
  const training = plan.type !== 'rest';
  const rows = [];
  for (const meal of plan.meals) {
    if (meal.slot === 'dinner' && training) rows.push(h('div', { class: 'note-row' }, icon('gym', 'icon-sm'), t('meals.gym', { from: m.times.gymStart, to: m.times.gymEnd })));
    rows.push(mealRow(api, meal, day, plan.type));
    if (meal.slot === 'lunch') rows.push(h('div', { class: 'note-row' }, icon('drop', 'icon-sm'), t('meals.water')));
  }
  return [
    h('header', { class: 'page-head' },
      h('div', { class: 'grow-wrap' }, h('span', { class: 'date' }, longDate(day)), h('h1', {}, t('meals.title'))),
      langToggle(api.ctx.render)),
    dayTypeChips(api, det, day),
    det.type ? null : h('p', { class: 'muted small' }, t('meals.pickType')),
    det.source && det.source !== 'manual' ? h('p', { class: 'muted small' }, t(`meals.detected.${det.source}`)) : null,
    summary(api, plan, adapt, session),
    ...coachBanners(api, adapt, day),
    h('div', { class: 'meal-list' }, ...rows),
    h('p', { class: 'muted small' }, t('meals.totals', { kcal: fmt(plan.totals.kcal), p: fmt(plan.totals.p), target: fmt(plan.target), pt: fmt(m.protein) })),
    m.adaptive ? null : h('p', { class: 'muted small' }, t('meals.adaptiveOff')),
  ];
}

function viewWeek(api) {
  const st = api.ctx.state;
  const today = dayKey();
  const m = M(api);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const before = JSON.stringify(m.plan);
  const cards = days.map((d) => {
    const det = detectDayType(st, d);
    const type = det.type || 'push';
    const p = buildDay(m, d, type);
    const wd = parseDay(d).getDay();
    const prep = wd === 0 || wd === 3;
    const nextBatch = prep ? [...new Set([0, 1, 2].flatMap((i) => ['lunch', 'dinner'].map((s) => m.plan[addDays(d, i)]?.[s])).filter((id) => recipeById(id)?.batch))] : [];
    return h('article', { class: `card week-day${d === today ? ' today' : ''}` },
      h('h3', {}, h('span', {}, d === today ? t('day.today') : dateText(parseDay(d), { weekday: 'long', day: 'numeric', month: 'short' })),
        h('span', { class: `type-pill${type === 'rest' ? ' rest' : ''}` }, det.type ? t(`daytype.${type}`) : t('meals.guess', { type: t(`daytype.${type}`) }))),
      h('ul', {}, ...p.meals.filter((x) => x.slot !== 'bedtime').map((meal) => h('li', {},
        h('span', { class: 's' }, `${meal.time} ${t(`slot.short.${meal.slot}`)}`),
        h('span', { class: 'grow' }, recipeName(recipeById(meal.recipeId) || { name: meal.recipeId }))))),
      h('p', { class: 'muted small' }, t('meals.dayTotal', { kcal: fmt(p.totals.kcal), p: fmt(p.totals.p) })),
      nextBatch.length ? h('p', { class: 'tip small' }, t('meals.prep', { list: nextBatch.map((id) => recipeName(recipeById(id))).join(isAr() ? '، ' : ', ') })) : null);
  });
  if (JSON.stringify(m.plan) !== before) api.ctx.save();
  return [
    h('header', { class: 'page-head' }, h('div', { class: 'grow-wrap' }, h('span', { class: 'date' }, t('meals.next7')), h('h1', {}, t('meals.weekTitle'))), langToggle(api.ctx.render)),
    h('p', { class: 'muted small' }, t('meals.weekHint')),
    h('div', { class: 'week' }, ...cards),
  ];
}

export function viewMeals(api) {
  const sw = h('div', { class: 'chips seg', role: 'tablist' }, ...[['today', t('meals.today')], ['week', t('meals.week')]].map(([k, l]) => h('button', {
    class: `chip${k === mode ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === mode), onclick: () => { mode = k; api.ctx.render(); },
  }, l)));
  return [...(mode === 'week' ? viewWeek(api) : viewToday(api)), sw];
}

// ---------- My recipes ----------
const allList = (api) => [...api.F().myRecipes, ...RECIPES.filter((r) => !r.same)];

function recipeCard(api, r) {
  const ph = api.F().recipePhotos[r.id];
  const n = recipeNutrition(r).n;
  return h('button', { class: 'recipe-card', type: 'button', onclick: () => { openRecipe = { id: r.id, from: 'recipes' }; servings = 1; mult = {}; api.setSub('recipe'); } },
    h('div', { class: 'photo' },
      ph ? h('img', { src: ph.thumb, alt: '' }) : icon('camera'),
      ph?.made ? h('span', { class: 'made-badge' }, t('rec.madeThis')) : null,
      M(api).fav.includes(r.id) ? h('span', { class: 'fav-mark', 'aria-label': t('rec.favourite') }, icon('star', 'icon-sm')) : null),
    h('div', { class: 'body' },
      h('span', { class: 'nm' }, recipeName(r)),
      recipeAlt(r) ? h('bdi', { class: 'alt', lang: isAr() ? 'en' : 'ar' }, recipeAlt(r)) : null,
      h('span', { class: 'mx' }, h('b', {}, fmt(n.kcal)), ` ${t('unit.kcal')} · `, h('b', { class: 'm-p' }, `${fmt(n.p)} ${t('unit.g')}`), ` ${t('macro.proteinLc')}`),
      h('span', { class: 'mx muted' }, `${t('macro.carbsShort')} ${fmt(n.c)} · ${t('macro.fatShort')} ${fmt(n.f)} ${t('unit.g')}`)));
}

function viewLibrary(api) {
  const m = M(api);
  const q = query.trim().toLowerCase();
  const matches = (r) => {
    if (FILTERS[filter] && !FILTERS[filter].includes(r.slot)) return false;
    if (!q) return true;
    const hay = `${r.name} ${r.ar} ${(r.ing || []).map(([id, , o]) => `${ingLabel(id, o, 'en')} ${ingLabel(id, o, 'ar')}`).join(' ')}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  const list = allList(api).filter(matches).sort((a, b) => m.fav.includes(b.id) - m.fav.includes(a.id));
  const mine = list.filter((r) => api.F().recipePhotos[r.id] || r.mine);
  const plan = list.filter((r) => !mine.includes(r));
  const search = h('input', { type: 'search', value: query, placeholder: t('rec.searchPh'), 'aria-label': t('rec.search') });
  search.addEventListener('input', () => {
    query = search.value;
    const pos = search.selectionStart;
    api.ctx.render();
    const s = document.querySelector('.rec-search input');
    if (s) { s.focus(); s.setSelectionRange(pos, pos); }
  });
  return [
    h('header', { class: 'page-head' }, h('h1', {}, t('rec.title')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => recipeEditor(api) }, icon('plus', 'icon-sm'), t('rec.new')),
        langToggle(api.ctx.render))),
    h('label', { class: 'search-box rec-search' }, icon('search'), search),
    h('div', { class: 'chips scroll', role: 'group', 'aria-label': t('rec.mealType') }, ...Object.keys(FILTERS).map((k) => h('button', {
      type: 'button', class: `chip${filter === k ? ' on' : ''}`, 'aria-pressed': String(filter === k), onclick: () => { filter = k; api.ctx.render(); },
    }, t(`rec.filter.${k}`)))),
    h('div', { class: 'section-head' }, h('h2', {}, t('rec.madeByYou')), h('span', { class: 'muted small' }, tn('rec.nDishes', mine.length))),
    mine.length ? h('div', { class: 'recipe-grid' }, ...mine.map((r) => recipeCard(api, r))) : h('p', { class: 'muted small' }, t('rec.noneMine')),
    h('h2', {}, t('rec.fromPlan')),
    plan.length ? h('div', { class: 'plan-list' }, ...plan.map((r) => {
      const n = recipeNutrition(r).n;
      const hidden = m.hide.includes(r.id);
      return h('button', { class: 'plan-item', type: 'button', onclick: () => { openRecipe = { id: r.id, from: 'recipes' }; servings = 1; mult = {}; api.setSub('recipe'); } },
        h('span', { class: 'grow-wrap' },
          h('span', { class: 'nm' }, recipeName(r), recipeAlt(r) ? h('bdi', { class: 'muted', lang: isAr() ? 'en' : 'ar', css: { 'font-weight': '400' } }, ` · ${recipeAlt(r)}`) : null),
          h('span', { class: 'muted small' }, t('meals.kcalP', { kcal: fmt(n.kcal), p: fmt(n.p) }), hidden ? ` · ${t('rec.hidden')}` : '', m.fav.includes(r.id) ? ` · ${t('rec.favourite')}` : '')),
        icon('next', 'icon-sm'));
    })) : h('p', { class: 'muted small' }, t('rec.noMatch')),
  ];
}

// ---------- recipe page ----------
async function addRecipePhoto(api, r) {
  const existing = api.F().recipePhotos[r.id];
  let source = null;
  if (existing) {
    const choice = await modal((done) => h('div', { class: 'sheet-body' },
      h('h2', {}, t('rec.yourPhoto')),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary', onclick: () => done('edit') }, icon('sliders', 'icon-sm'), t('rec.editPhoto')),
        existing.orig ? h('button', { class: 'btn ghost', onclick: () => done('original') }, icon('undo', 'icon-sm'), t('rec.backToOriginal')) : null,
        h('button', { class: 'btn ghost', onclick: () => done('camera') }, icon('camera', 'icon-sm'), t('rec.takeNew')),
        h('button', { class: 'btn ghost', onclick: () => done('gallery') }, icon('image', 'icon-sm'), t('rec.fromGallery')),
        h('button', { class: 'btn danger', onclick: () => done('delete') }, icon('trash', 'icon-sm'), t('rec.deletePhoto')),
        h('button', { class: 'btn ghost', onclick: () => done(null) }, t('cancel')))));
    if (!choice) return;
    if (choice === 'delete') {
      if (!await confirmDialog(t('rec.deletePhotoQ'), t('rec.deletePhotoBody'), t('delete'), true)) return;
      delete api.F().recipePhotos[r.id];
      await api.ctx.deleteRecipePhoto(r.id);
      api.ctx.render();
      return;
    }
    if (choice === 'edit' || choice === 'original') source = { existing, reset: choice === 'original' };
    else source = { file: await api.pickPhoto({ camera: choice === 'camera' }) };
  } else {
    const choice = await modal((done) => h('div', { class: 'sheet-body' },
      h('h2', {}, t('rec.addMyPhoto')),
      h('p', { class: 'muted small' }, t('rec.photoPrivate')),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary', onclick: () => done('camera') }, icon('camera', 'icon-sm'), t('rec.camera')),
        h('button', { class: 'btn ghost', onclick: () => done('gallery') }, icon('image', 'icon-sm'), t('rec.gallery')),
        h('button', { class: 'btn ghost', onclick: () => done(null) }, t('cancel')))));
    if (!choice) return;
    source = { file: await api.pickPhoto({ camera: choice === 'camera' }) };
  }
  if (!source.existing && !source.file) return;
  const rec = await editPhoto(source);
  if (!rec) return;
  const out = { ...rec, made: true, starter: existing?.starter && !source.file ? existing.starter : false, ts: Date.now() };
  api.F().recipePhotos[r.id] = out;
  await api.ctx.saveRecipePhoto(r.id, out);
  toast(t('photo.saved'));
  api.ctx.render();
}

function swapSheet(r, items) {
  return modal((done) => {
    const local = { ...mult };
    const list = h('ul', { class: 'ing-list' });
    const draw = () => list.replaceChildren(...items.filter(([id]) => !id.startsWith('@') && ingredientInfo(id)?.n.kcal > 0).map(([id, , o]) => {
      const cur = local[id] ?? 1;
      return h('li', { class: cur === 0 ? 'removed' : '' },
        h('span', { class: 'ing-name' }, ingLabel(id, o)),
        h('span', { class: 'ing-mult', role: 'group', 'aria-label': t('food.amountOf', { name: ingLabel(id, o) }) },
          ...[[0, 'mult.none'], [0.5, 'mult.half'], [1, 'mult.normal'], [2, 'mult.double']].map(([v, l]) => h('button', {
            type: 'button', class: `mult${cur === v ? ' on' : ''}`, 'aria-pressed': String(cur === v),
            onclick: () => { if (v === 1) delete local[id]; else local[id] = v; draw(); },
          }, t(l)))));
    }));
    draw();
    return h('div', { class: 'sheet-body' },
      h('h2', {}, t('rec.swapTitle')),
      h('p', { class: 'muted small' }, t('rec.swapHint')),
      list,
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => done({}) }, t('reset')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => done(local) }, t('done'))));
  });
}

function viewRecipePage(api) {
  const r = recipeById(openRecipe?.id);
  if (!r) { openRecipe = null; return viewLibrary(api); }
  const m = M(api);
  const ph = api.F().recipePhotos[r.id];
  const planMeal = openRecipe.from === 'meals' ? openRecipe.meal : null;
  const items = planMeal ? planMeal.items : r.ing;
  const k = servings * (planMeal ? planMeal.portion || 1 : 1) / (planMeal ? 1 : r.serves || 1);
  const nut = itemsNutrition(items, mult);
  const n = { kcal: nut.n.kcal * k, p: nut.n.p * k, c: nut.n.c * k, f: nut.n.f * k, fib: nut.n.fib * k };
  const grams = nut.grams * k;
  const back = () => { const from = openRecipe.from; openRecipe = null; api.setSub(from === 'meals' ? 'meals' : 'recipes'); };
  const tags = [t(`slot.${r.slot}`)];
  if ((r.tags || []).includes('legs')) tags.push(t('rec.goodLegs'));
  tags.push(t('rec.minutes', { n: fmt(r.min) }));
  if (r.batch) tags.push(t('rec.batch'));
  const modsLabel = Object.entries(mult).map(([id, v]) => t(v === 0 ? 'mods.no' : v === 0.5 ? 'mods.half' : 'mods.double', { name: ingLabel(id, {}, 'en') })).join(', ');
  const logIt = async () => {
    const food = recipeFoodItem(r, n, grams, modsLabel);
    const slot = planMeal?.slot || r.slot;
    const day = openRecipe.day || dayKey();
    const entry = await api.addEntry(food, Math.round(grams), SLOT_TO_DIARY[slot] || 'snack', { recipe: r.id, slot: planMeal ? slot : undefined, day });
    if (planMeal) { m.logged[day] = { ...(m.logged[day] || {}), [slot]: entry.id }; await api.ctx.commit(); }
  };
  const steps = (isAr() ? r.steps?.ar : r.steps?.en) || [];
  const fav = m.fav.includes(r.id); const hidden = m.hide.includes(r.id);
  return [
    h('div', { class: 'recipe-hero' },
      ph ? h('img', { src: ph.edited, alt: t('rec.photoOf', { name: recipeName(r) }) }) : [icon('camera'), h('span', { class: 'muted small' }, t('rec.yourPhotoOf'))],
      ph ? null : h('button', { class: 'btn outline', type: 'button', onclick: () => addRecipePhoto(api, r) }, t('rec.addMyPhoto')),
      ph ? h('button', { class: 'icon-btn hero-photo', type: 'button', 'aria-label': t('rec.yourPhoto'), onclick: () => addRecipePhoto(api, r) }, icon('camera')) : null,
      ph?.made ? h('span', { class: 'made-badge' }, t('rec.madeThis')) : null,
      iconButton('back', t('rec.backTo'), back, 'hero-btn hero-back'),
      langToggle(api.ctx.render, 'hero-btn hero-lang')),
    h('div', { class: 'stack', css: { gap: '4px' } },
      h('span', { class: 'tagline' }, isAr() ? tags.join(' · ') : tags.join(' · ').toUpperCase()),
      h('h1', { css: { 'font-size': '24px' } }, recipeName(r)),
      recipeAlt(r) ? h('bdi', { class: 'alt-name', lang: isAr() ? 'en' : 'ar' }, recipeAlt(r)) : null),
    h('div', { class: 'macro-tiles' },
      ...[['kcal', fmt(n.kcal), ''], ['protein', `${fmt(n.p)} ${t('unit.g')}`, 'm-p'], ['carbs', `${fmt(n.c)} ${t('unit.g')}`, 'm-c'], ['fat', `${fmt(n.f)} ${t('unit.g')}`, 'm-f']]
        .map(([key, v, cls]) => h('div', {}, h('span', { class: `v num ${cls}` }, v), h('span', { class: 'l' }, key === 'kcal' ? t('unit.kcal') : t(`macro.${key}Lc`))))),
    nut.missing.length ? h('p', { class: 'warn small' }, t('rec.missingData', { list: nut.missing.join(', ') })) : null,
    planMeal ? h('p', { class: 'muted small' }, t('rec.planPortion', { p: fmt((planMeal.portion || 1) * 100), slot: t(`slot.${planMeal.slot}`) })) : null,
    h('div', { class: 'section-head' }, h('h2', {}, t('rec.ingredients')),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': t('rec.fewer'), disabled: servings <= 1, onclick: () => { servings = Math.max(1, servings - 1); api.ctx.render(); } }, icon('minus', 'icon-sm')),
        h('span', {}, tn('rec.servings', servings)),
        h('button', { type: 'button', 'aria-label': t('rec.more'), onclick: () => { servings = Math.min(12, servings + 1); api.ctx.render(); } }, icon('plus', 'icon-sm')))),
    h('div', { class: 'ing-card' }, ...items.map(([id, g, o = {}]) => {
      const mm = mult[id] ?? 1;
      return h('div', { class: `ing-row${mm === 0 ? ' removed' : ''}` },
        h('span', { class: 'en', lang: 'en' }, ingLabel(id, o, 'en'), o.opt ? h('span', { class: 'muted small' }, ` (${t('optional')})`) : null),
        h('bdi', { class: 'ar', lang: 'ar' }, ingLabel(id, o, 'ar')),
        h('span', { class: 'qty num' }, (mm !== 1 ? `${t(mm === 0.5 ? 'mult.half' : mm === 2 ? 'mult.double' : 'mult.none')} · ` : '') + qtyText(id, g, o, k)));
    })),
    h('p', { class: 'muted small' }, t('rec.fromDb', { g: fmt(grams) })),
    steps.length ? h('h2', {}, t('rec.howToCook')) : null,
    steps.length ? h('ol', { class: 'cook-steps' }, ...steps.map((s, i) => h('li', {}, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'tx' }, s)))) : null,
    h('div', { class: 'row wrap' },
      h('button', { class: `chip${fav ? ' on' : ''}`, type: 'button', 'aria-pressed': String(fav), onclick: async () => { m.fav = fav ? m.fav.filter((x) => x !== r.id) : [...m.fav, r.id]; await api.ctx.commit(); } }, icon('star', 'icon-sm'), t('rec.favourite')),
      h('button', { class: `chip${hidden ? ' on' : ''}`, type: 'button', 'aria-pressed': String(hidden), onclick: async () => {
        m.hide = hidden ? m.hide.filter((x) => x !== r.id) : [...m.hide, r.id];
        if (!hidden) for (const d of Object.keys(m.plan)) if (d >= dayKey()) for (const [s, id] of Object.entries(m.plan[d])) if (id === r.id && !m.logged[d]?.[s]) delete m.plan[d][s];
        await api.ctx.commit();
      } }, icon('hide', 'icon-sm'), t('rec.dontSuggest')),
      r.mine ? h('button', { class: 'chip', type: 'button', onclick: () => recipeEditor(api, r) }, icon('edit', 'icon-sm'), t('edit')) : h('button', { class: 'chip', type: 'button', onclick: () => recipeEditor(api, r, true) }, icon('edit', 'icon-sm'), t('rec.copyEdit')),
      r.mine ? h('button', { class: 'chip', type: 'button', onclick: async () => {
        if (!await confirmDialog(t('rec.deleteQ', { name: recipeName(r) }), t('rec.deleteBody'), t('delete'), true)) return;
        api.F().myRecipes = api.F().myRecipes.filter((x) => x.id !== r.id);
        openRecipe = null; await api.ctx.commit(); api.setSub('recipes');
      } }, icon('trash', 'icon-sm'), t('delete')) : null),
    h('div', { class: 'bottom-bar' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { const res = await swapSheet(r, items); if (res) { mult = res; api.ctx.render(); } } }, t('rec.swap')),
      h('button', { class: 'btn primary', type: 'button', onclick: logIt }, t('rec.logThis', { kcal: fmt(n.kcal) }))),
  ];
}

export function viewRecipes(api) {
  return openRecipe ? viewRecipePage(api) : viewLibrary(api);
}

// ---------- recipe editor ----------
function ingredientPicker() {
  return modal((done) => {
    const q = h('input', { type: 'search', placeholder: t('rec.ingSearch'), 'aria-label': t('rec.ingSearch'), autofocus: true });
    const list = h('ul', { class: 'results' });
    const draw = () => {
      const w = q.value.trim().toLowerCase();
      const ids = ingredientTableIds().filter((id) => { const i = ingredientInfo(id); return !w || `${i.name} ${i.ar} ${i.fr}`.toLowerCase().includes(w); }).slice(0, 40);
      list.replaceChildren(...ids.map((id) => { const i = ingredientInfo(id); return h('li', {}, h('button', { class: 'result', type: 'button', onclick: () => done(id) },
        h('span', { class: 'r-text' }, h('span', { class: 'r-name' }, isAr() ? i.ar || i.name : i.name), h('bdi', { class: 'r-ar' }, isAr() ? i.name : i.ar),
          h('span', { class: 'r-meta' }, t('food.per100short', { kcal: fmt(i.n.kcal), p: fmt(i.n.p, 1) })))));
      }));
    };
    q.addEventListener('input', draw);
    draw();
    return h('div', { class: 'sheet-body' }, h('h2', {}, t('rec.addIng')), q, list,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, t('cancel'))));
  });
}

let ingIds = null;
function ingredientTableIds() {
  if (ingIds) return ingIds;
  const ids = [];
  for (const id of ['chicken-breast', 'chicken-cooked', 'egg', 'milk', 'rice', 'pasta-dry', 'couscous-dry', 'potato', 'bread-ww', 'oats', 'banana', 'dates', 'peanuts', 'olive-oil', 'veg-oil', 'tomato', 'onion', 'carrot', 'pepper', 'peas', 'garlic', 'herbs', 'spices', 'lentils-dry', 'chickpeas-dry', 'white-beans-dry', 'fava-dry', 'sardine', 'sardine-can', 'tuna-oil', 'jben', 'raib', 'flour', 'semolina', 'vermicelli', 'almonds', 'walnuts', 'avocado', 'orange', 'orange-juice', 'cocoa', 'honey', 'sugar', 'salt', 'water', 'baking-powder', 'yeast', 'butter', 'beef-lean', 'ground-beef', 'lamb', 'white-fish', 'shrimp', 'lemon', 'olives', 'mint', 'cinnamon', 'apple', 'eggplant', 'cabbage', 'turnip', 'pumpkin', 'cucumber', 'lettuce', 'tomato-paste', 'zucchini']) {
    if (ingredientInfo(id)) ids.push(id);
  }
  ingIds = ids.length ? ids : null;
  return ids;
}

async function recipeEditor(api, existing = null, copy = false) {
  const F = api.F();
  const base = existing ? JSON.parse(JSON.stringify(existing)) : { slot: 'lunch', name: '', ar: '', min: 30, serves: 1, ing: [], steps: { en: [], ar: [] } };
  const res = await modal((done) => {
    const nameEn = h('input', { value: copy ? `${base.name}` : base.name, maxlength: 80, placeholder: t('rec.nameEnPh'), lang: 'en', dir: 'ltr' });
    const nameAr = h('input', { value: base.ar || '', maxlength: 80, placeholder: t('rec.nameArPh'), lang: 'ar', dir: 'rtl' });
    const slot = h('select', {}, ...['breakfast', 'shake', 'lunch', 'snack', 'pregym', 'dinner', 'drink'].map((s) => h('option', { value: s, selected: base.slot === s }, t(`slot.${s}`))));
    const min = h('input', { type: 'text', inputmode: 'numeric', value: String(base.min || 20) });
    const serves = h('input', { type: 'text', inputmode: 'numeric', value: String(base.serves || 1) });
    const ing = base.ing.map(([id, g, o = {}]) => ({ id, g, o: { ...o } }));
    const list = h('div', { class: 'stack' });
    const warn = h('p', { class: 'warn small', hidden: true });
    const totals = h('p', { class: 'muted small' });
    const drawIng = () => {
      list.replaceChildren(...ing.map((x, i) => {
        const g = h('input', { type: 'text', inputmode: 'decimal', value: String(x.g), 'aria-label': t('rec.amountOf', { name: ingLabel(x.id, x.o) }), class: 'g-in' });
        g.addEventListener('input', () => { x.g = parseFloat(g.value.replace(',', '.')) || 0; sumUp(); });
        const unit = h('select', { 'aria-label': t('rec.unit'), css: { width: '86px' } }, h('option', { value: 'g', selected: x.o.u !== 'ml' }, t('unit.g')), h('option', { value: 'ml', selected: x.o.u === 'ml' }, t('unit.ml')));
        unit.addEventListener('change', () => { x.o.u = unit.value === 'ml' ? 'ml' : undefined; });
        return h('div', { class: 'row' }, h('span', { class: 'grow' }, ingLabel(x.id, x.o), h('bdi', { class: 'muted small block' }, ingLabel(x.id, x.o, isAr() ? 'en' : 'ar'))), g, unit,
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': t('rec.removeIng', { name: ingLabel(x.id, x.o) }), onclick: () => { ing.splice(i, 1); drawIng(); } }, icon('close', 'icon-sm')));
      }));
      sumUp();
    };
    const sumUp = () => {
      const n = itemsNutrition(ing.map((x) => [x.id, x.g, x.o])).n;
      const s = Math.max(1, parseInt(serves.value, 10) || 1);
      totals.textContent = t('rec.perServing', { kcal: fmt(n.kcal / s), p: fmt(n.p / s), c: fmt(n.c / s), f: fmt(n.f / s) });
      const avoid = ing.filter((x) => F.avoid.includes(x.id));
      warn.hidden = !avoid.length;
      warn.textContent = avoid.length ? t('rec.avoidWarn', { list: avoid.map((x) => ingLabel(x.id, x.o)).join(', ') }) : '';
    };
    serves.addEventListener('input', sumUp);
    const stepsEn = h('textarea', { rows: 5, lang: 'en', dir: 'ltr', placeholder: t('rec.stepsPh') }); stepsEn.value = (base.steps?.en || []).join('\n');
    const stepsAr = h('textarea', { rows: 5, lang: 'ar', dir: 'rtl', placeholder: t('rec.stepsPhAr') }); stepsAr.value = (base.steps?.ar || []).join('\n');
    const err = h('p', { class: 'error', hidden: true });
    drawIng();
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        if (!nameEn.value.trim() && !nameAr.value.trim()) { err.textContent = t('rec.needName'); err.hidden = false; return; }
        if (!ing.some((x) => x.g > 0)) { err.textContent = t('rec.needIng'); err.hidden = false; return; }
        done({
          id: existing?.mine && !copy ? existing.id : `my:${uid()}`, slot: slot.value, name: nameEn.value.trim(), ar: nameAr.value.trim(),
          min: parseInt(min.value, 10) || 20, serves: parseInt(serves.value, 10) || 1,
          ing: ing.filter((x) => x.g > 0).map((x) => [x.id, x.g, x.o]),
          steps: { en: stepsEn.value.split('\n').map((s) => s.trim()).filter(Boolean), ar: stepsAr.value.split('\n').map((s) => s.trim()).filter(Boolean) },
        });
      },
    },
    h('h2', {}, existing && !copy ? t('rec.editTitle') : t('rec.newTitle')),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, t('rec.nameEn')), nameEn),
      h('label', { class: 'field' }, h('span', {}, t('rec.nameAr')), nameAr),
      h('label', { class: 'field' }, h('span', {}, t('rec.slot')), slot),
      h('label', { class: 'field' }, h('span', {}, t('rec.min')), min),
      h('label', { class: 'field' }, h('span', {}, t('rec.serves')), serves)),
    h('h3', {}, t('rec.ingredients')),
    list,
    h('button', { class: 'btn ghost', type: 'button', onclick: async () => { const id = await ingredientPicker(); if (id) { ing.push({ id, g: 100, o: {} }); drawIng(); } } }, icon('plus', 'icon-sm'), t('rec.addIng')),
    totals, warn,
    h('label', { class: 'field' }, h('span', {}, t('rec.stepsEn')), stepsEn),
    h('label', { class: 'field' }, h('span', {}, t('rec.stepsAr')), stepsAr),
    err,
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => done(null) }, t('cancel')),
      h('button', { class: 'btn primary', type: 'submit' }, t('save'))));
  });
  if (!res) return;
  const list = F.myRecipes.filter((x) => x.id !== res.id);
  list.unshift({ ...res, tags: [], batch: false, mine: true, eggs: res.ing.filter(([id]) => id === 'egg').reduce((n, [, g]) => n + g / 50, 0) });
  F.myRecipes = list;
  openRecipe = { id: res.id, from: 'recipes' };
  servings = 1; mult = {};
  await api.ctx.commit();
  api.setSub('recipe');
}

// ---------- settings ----------
export function mealSettings(api, editProfile) {
  const m = M(api);
  const F = api.F();
  const save = async () => { await api.ctx.commit(); };
  const timeInput = (key) => {
    const i = h('input', { type: 'time', value: m.times[key], 'aria-label': t(`time.${key}`) });
    i.addEventListener('change', async () => { if (/^\d\d:\d\d$/.test(i.value)) { m.times[key] = i.value; await save(); } });
    return h('label', { class: 'field' }, h('span', {}, t(`time.${key}`)), i);
  };
  const target = (key, label) => {
    const i = h('input', { type: 'text', inputmode: 'numeric', value: String(m.targets[key]), 'aria-label': label });
    i.addEventListener('change', async () => {
      const v = parseInt(i.value, 10);
      if (v >= 1200 && v <= 6000) { m.targets[key] = v; if (key === 'push') m.targets.pull = v; await save(); } else i.value = String(m.targets[key]);
    });
    return h('label', { class: 'field' }, h('span', {}, label), i);
  };
  const protein = h('input', { type: 'text', inputmode: 'numeric', value: String(m.protein), 'aria-label': t('ms.protein') });
  protein.addEventListener('change', async () => { const v = parseInt(protein.value, 10); if (v >= 120 && v <= 300) { m.protein = v; await save(); } else protein.value = String(m.protein); });
  const p = F.profile;
  const hidden = m.hide.map((id) => recipeById(id)).filter(Boolean);
  return h('article', { class: 'card' },
    h('h2', {}, t('ms.title')),
    h('label', { class: 'switch-row' },
      h('span', { class: 'grow' }, t('ms.adaptive'), h('span', { class: 'muted small block' }, t('ms.adaptiveSub'))),
      h('input', { type: 'checkbox', role: 'switch', checked: m.adaptive, onchange: async (e) => { m.adaptive = e.target.checked; await save(); } })),
    h('h3', {}, t('ms.aboutMe')),
    h('p', { class: 'muted small' }, t('ms.profileLine', {
      sex: t(p.sex === 'female' ? 'prof.female' : 'prof.male'), h: fmt(p.heightCm), w: fmt(p.weightKg, 1), goal: t(`goal.${p.goal}`),
    })),
    h('ul', { class: 'bullets small' }, ...[1, 2, 3, 4].map((i) => h('li', {}, t(`ms.me.${i}`)))),
    h('button', { class: 'btn ghost', type: 'button', onclick: editProfile }, t('ms.editProfile')),
    h('h3', {}, t('ms.targets')),
    h('div', { class: 'grid2' }, target('rest', t('daytype.rest')), target('push', t('ms.pushPull')), target('legs', t('daytype.legs')),
      h('label', { class: 'field' }, h('span', {}, t('ms.protein')), protein)),
    h('p', { class: 'muted small' }, t('ms.targetsHint', { rest: fmt(DEFAULT_TARGETS.rest), push: fmt(DEFAULT_TARGETS.push), legs: fmt(DEFAULT_TARGETS.legs) })),
    m.baseline ? h('div', { class: 'row' }, h('span', { class: 'grow muted small' }, t('ms.baseline', { n: `${m.baseline > 0 ? '+' : ''}${fmt(m.baseline)}` })),
      h('button', { class: 'link small', type: 'button', onclick: async () => { m.baseline = 0; await save(); } }, t('reset'))) : null,
    h('h3', {}, t('ms.trainDays')),
    h('div', { class: 'weekdays', role: 'group', 'aria-label': t('ms.trainDays') }, ...[1, 2, 3, 4, 5, 6, 0].map((d) => {
      const on = m.trainDays.includes(d);
      return h('button', { type: 'button', class: `chip small${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: async () => { m.trainDays = on ? m.trainDays.filter((x) => x !== d) : [...m.trainDays, d]; await save(); } },
        t(`wd.${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d]}`));
    })),
    h('p', { class: 'muted small' }, t('ms.trainDaysHint')),
    h('h3', {}, t('ms.times')),
    h('div', { class: 'time-grid' }, ...Object.keys(DEFAULT_TIMES).map(timeInput)),
    h('button', { class: 'link small', type: 'button', onclick: async () => { m.times = { ...DEFAULT_TIMES }; await save(); } }, t('ms.resetTimes')),
    m.trim || m.extraShake ? h('div', { class: 'row wrap' },
      m.trim ? h('button', { class: 'chip on', type: 'button', onclick: async () => { m.trim = null; await save(); } }, t(m.trim === 'milk' ? 'ms.trimMilk' : 'ms.trimBread'), icon('close', 'icon-sm')) : null,
      m.extraShake ? h('button', { class: 'chip on', type: 'button', onclick: async () => { m.extraShake = false; await save(); } }, t('ms.extraShake'), icon('close', 'icon-sm')) : null) : null,
    h('h3', {}, t('ms.hidden')),
    hidden.length ? h('div', { class: 'chips' }, ...hidden.map((r) => h('button', { class: 'chip', type: 'button', onclick: async () => { m.hide = m.hide.filter((x) => x !== r.id); await save(); } }, recipeName(r), icon('close', 'icon-sm'))))
      : h('p', { class: 'muted small' }, t('ms.noneHidden')),
    h('p', { class: 'muted small' }, t('ms.variety')));
}

/** Pre-load the 3 starter recipe photos once (Android app only), encrypted like any other photo. */
export async function importStarters(api) {
  const m = M(api);
  if (m.starterDone || !globalThis.POCKET_STATS_LOCAL_DATA) return; // only the Android app carries them
  const r = await fetch('data/starter/index.json', { credentials: 'omit', cache: 'no-store' });
  if (!r.ok) throw new Error('none');
  const index = await r.json();
  for (const { id, file } of index) {
    if (api.F().recipePhotos[id] || !recipeById(id)) continue;
    const pr = await fetch(`data/starter/${file}`, { credentials: 'omit', cache: 'no-store' });
    if (!pr.ok) continue;
    const rec = { ...(await pr.json()), made: true, starter: true, ts: Date.now() };
    api.F().recipePhotos[id] = rec;
    await api.ctx.saveRecipePhoto(id, rec);
  }
  m.starterDone = true;
  await api.ctx.save();
  api.ctx.render();
}
