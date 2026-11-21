// Gym tab: workout logger, exercise library with muscle maps and animated
// demonstrations, progress analytics, and a safety & evidence guide.
import { h, uid, toast, confirmDialog, modal, langToggle } from './ui.js';
import { t, tn, fmt, dateText, sep } from './i18n.js';
import { icon } from './icons.js';
import { dayKey, dayRange, parseDay } from './stats.js';
import { barChart } from './charts.js';
import { MUSCLES, EXERCISES, EX_BY_ID, PROGRAMS, REFERENCES, exText, exName, muscleText, groupName, programName, programWho, dayName, refText } from './exercises.js';
import { bodyMaps } from './body.js';
import { demo } from './poses.js';
import { analyze, adaptPlan, suggestions, nextDay, loadTip } from './coach.js';
import { measureSession, sessionEnergy } from './mealplan.js';

const LB = 0.45359237;

let ctx;
let sub = 'workout';
let detailId = null;
let detailFrom = 'library';
let muscleFilter = null;
let groupFilter = 'All';
let query = '';
let pdayIndex = null;
let extraExercises = [];
let progressEx = null;

const G = () => ctx.state.gym;
const isLb = () => ctx.state.food?.profile?.units === 'imperial';
const unit = () => (isLb() ? t('unit.lb') : t('unit.kg'));
const toUnit = (kg) => (isLb() ? kg / LB : kg);
const fromUnit = (v) => (isLb() ? v * LB : v);
const fmtW = (kg) => `${fmt(Math.round(toUnit(kg) * 4) / 4, 2)} ${unit()}`;
const shortDay = (d) => dateText(parseDay(d), { month: 'short', day: 'numeric' });
const muscleNames = () => Object.fromEntries(Object.keys(MUSCLES).map((k) => [k, muscleText(k).name]));

// ---------- data ----------
export function freshGym() {
  return { program: null, log: [], screen: null, sessions: [], adapt: freshAdapt() };
}

function freshAdapt() {
  return { on: true, minutes: null, swaps: {}, removed: [], repeat: true, ignore: {}, dismissed: [] };
}

export function normalizeGym(raw) {
  const out = freshGym();
  if (!raw || typeof raw !== 'object') return out;
  out.program = PROGRAMS[raw.program] ? raw.program : null;
  for (const s of Array.isArray(raw.log) ? raw.log : []) {
    if (!s || !EX_BY_ID[s.ex] || !/^\d{4}-\d{2}-\d{2}$/.test(s.day)) continue;
    const kg = +s.kg; const reps = +s.reps;
    if (!(kg >= 0 && kg < 1000) || !(reps > 0 && reps < 1000)) continue;
    out.log.push({ id: String(s.id || uid()).slice(0, 40), day: s.day, ts: Number.isFinite(+s.ts) ? +s.ts : Date.now(), ex: s.ex, kg, reps: Math.round(reps), pday: typeof s.pday === 'string' ? s.pday.slice(0, 20) : null });
  }
  if (raw.screen && typeof raw.screen === 'object') out.screen = { date: String(raw.screen.date || '').slice(0, 10), yes: Math.max(0, Math.min(7, +raw.screen.yes || 0)) };
  for (const x of Array.isArray(raw.sessions) ? raw.sessions.slice(-200) : []) {
    if (x && /^\d{4}-\d{2}-\d{2}$/.test(x.day) && typeof x.pday === 'string') {
      out.sessions.push({ day: x.day, pday: x.pday.slice(0, 20), rating: ['easy', 'good', 'hard', 'too-much'].includes(x.rating) ? x.rating : null });
    }
  }
  const a = raw.adapt && typeof raw.adapt === 'object' ? raw.adapt : {};
  out.adapt.on = a.on !== false;
  out.adapt.repeat = a.repeat !== false;
  out.adapt.minutes = [20, 30, 45, 60, 75, 90].includes(a.minutes) ? a.minutes : null;
  for (const [from, to] of Object.entries(a.swaps || {})) if (EX_BY_ID[from] && EX_BY_ID[to]) out.adapt.swaps[from] = to;
  out.adapt.removed = (Array.isArray(a.removed) ? a.removed : []).filter((id) => EX_BY_ID[id]).slice(0, 40);
  for (const [k, v] of Object.entries(a.ignore || {})) if (/^\w{1,20}$/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.adapt.ignore[k] = v;
  out.adapt.dismissed = (Array.isArray(a.dismissed) ? a.dismissed : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 60);
  return out;
}

const e1rm = (kg, reps) => (reps <= 1 ? kg : kg * (1 + reps / 30)); // Epley

function sessionsFor(ex) {
  const byDay = new Map();
  for (const s of G().log) if (s.ex === ex) { if (!byDay.has(s.day)) byDay.set(s.day, []); byDay.get(s.day).push(s); }
  return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, sets]) => ({ day, sets: sets.sort((a, b) => a.ts - b.ts) }));
}

// ---------- rest timer ----------
let timer = null;
const $timer = h('div', { class: 'rest', hidden: true, role: 'timer', 'aria-live': 'off' });
document.body.append($timer);

function startRest(sec) {
  clearInterval(timer?.id);
  timer = { end: Date.now() + sec * 1000 };
  const tick = () => {
    const left = Math.round((timer.end - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(timer.id);
      $timer.replaceChildren(h('strong', {}, t('gym.restDone')), h('button', { class: 'btn ghost', onclick: () => { $timer.hidden = true; } }, t('ok')));
      navigator.vibrate?.([200, 100, 200]);
      setTimeout(() => { if (Date.now() > timer.end + 6000) $timer.hidden = true; }, 6500);
      return;
    }
    $timer.replaceChildren(
      h('span', { class: 'grow' }, `${t('gym.rest')} `, h('strong', { class: 'num' }, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`)),
      h('button', { class: 'btn ghost', onclick: () => { timer.end += 30000; tick(); } }, t('gym.plus30')),
      h('button', { class: 'btn ghost', onclick: () => { clearInterval(timer.id); $timer.hidden = true; } }, t('gym.skip')));
  };
  $timer.hidden = false;
  tick();
  timer.id = setInterval(tick, 1000);
}

// ---------- shared pieces ----------
const musclesText = (list) => list.map((m) => muscleText(m).name).join(sep());
const equipText = (ex) => exText(ex).equip;

function exRow(ex, onClick) {
  return h('li', {}, h('button', { class: 'entry ex-row', onclick: onClick },
    h('span', { class: 'grow' }, h('strong', {}, exName(ex.id)), h('span', { class: 'muted small block' }, `${musclesText(ex.primary)} · ${equipText(ex)}`)),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('next', 'icon-sm'))));
}

function openDetail(id, from) {
  detailId = id; detailFrom = from; sub = 'detail';
  ctx.render();
  window.scrollTo(0, 0);
}

function pageHead(title, extra = null) {
  return h('header', { class: 'page-head' }, h('div', { class: 'grow-wrap' }, extra, h('h1', {}, title)), langToggle(ctx.render));
}

// ---------- WORKOUT ----------
function exerciseCard(ex, sets, reps, pday, notes = [], welcomeBack = false) {
  const today = dayKey();
  const name = exName(ex.id);
  const done = G().log.filter((s) => s.ex === ex.id && s.day === today).sort((a, b) => a.ts - b.ts);
  const last = sessionsFor(ex.id).find((s) => s.day !== today);
  const prev = done.at(-1) || last?.sets.at(-1);
  const w = h('input', { type: 'text', inputmode: 'decimal', placeholder: unit(), value: prev ? String(Math.round(toUnit(prev.kg) * 4) / 4) : '', 'aria-label': t('gym.weightOf', { name, unit: unit() }) });
  const r = h('input', { type: 'text', inputmode: 'numeric', placeholder: t('gym.reps'), value: prev ? String(prev.reps) : '', 'aria-label': t('gym.repsOf', { name }) });
  const rest = ex.kind === 'compound' ? 150 : 75;
  return h('article', { class: 'card ex-card' },
    h('button', { class: 'ex-title', onclick: () => openDetail(ex.id, 'workout') },
      h('span', { class: 'grow' }, h('h2', {}, name), h('span', { class: 'muted small' },
        `${sets ? `${t('gym.setsReps', { sets: fmt(sets), reps })} · ` : ''}${t('gym.restFor', { t: ex.kind === 'compound' ? t('gym.rest23') : t('gym.rest6090') })} · ${musclesText(ex.primary)}`)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('info', 'icon-sm'))),
    last ? h('p', { class: 'muted small' }, t('gym.lastTime', { day: shortDay(last.day), sets: last.sets.map((s) => `${fmt(Math.round(toUnit(s.kg) * 4) / 4, 2)}×${s.reps}`).join(sep()), unit: unit() })) : null,
    notes.length ? h('p', { class: 'adapted small' }, [...new Set(notes)].join(' · ')) : null,
    h('p', { class: 'tip small' }, loadTip(ex, reps, sessionsFor(ex.id).filter((x) => x.day !== today), { welcomeBack, lb: isLb() })),
    done.length ? h('ol', { class: 'sets' }, ...done.map((s) => h('li', {},
      h('span', { class: 'grow num' }, `${fmtW(s.kg)} × ${s.reps}`),
      h('button', { class: 'icon-btn small', 'aria-label': t('gym.deleteSet'), onclick: async () => { G().log = G().log.filter((x) => x !== s); await ctx.commit(); } }, icon('close', 'icon-sm'))))) : null,
    h('form', {
      class: 'row set-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const kg = fromUnit(parseFloat(w.value.replace(',', '.')) || 0);
        const reps = parseInt(r.value, 10);
        if (!(reps > 0 && reps < 1000) || !(kg >= 0 && kg < 1000)) { r.focus(); return; }
        G().log.push({ id: uid(), day: today, ts: Date.now(), ex: ex.id, kg, reps, pday });
        await ctx.commit();
        startRest(rest);
        const best = Math.max(0, ...G().log.filter((s) => s.ex === ex.id && s.day !== today).map((s) => e1rm(s.kg, s.reps)));
        if (best > 0 && kg > 0 && e1rm(kg, reps) > best) toast(t('gym.newBest', { name }));
      },
    },
    w, h('span', { class: 'muted' }, '×'), r,
    h('button', { class: 'btn primary', type: 'submit' }, sets && done.length >= sets ? t('gym.extraSet') : t('gym.logSet', { n: fmt(done.length + 1) }))));
}

function viewWorkout() {
  const out = [];
  if (!G().screen) {
    out.push(h('article', { class: 'card callout' },
      h('h2', {}, t('gym.beforeFirst')),
      h('p', { class: 'muted' }, t('gym.beforeFirstBody')),
      h('button', { class: 'btn primary wide', onclick: () => { sub = 'safety'; ctx.render(); } }, t('gym.takeCheck'))));
  }
  const prog = PROGRAMS[G().program];
  if (!prog) {
    out.unshift(pageHead(t('gym.chooseProgram')));
    out.push(
      h('p', { class: 'muted' }, t('gym.programIntro')),
      ...Object.entries(PROGRAMS).map(([k, p]) => h('article', { class: `card${k === 'ppla' ? ' raised' : ''}` },
        h('h2', {}, programName(k)),
        h('p', { class: 'muted small' }, programWho(k)),
        h('ul', { class: 'bullets small' }, ...p.days.map(([n, list]) => h('li', {}, h('b', {}, `${dayName(n)}: `), list.map(([id]) => exName(id)).join(sep())))),
        h('button', { class: 'btn primary wide', onclick: async () => { G().program = k; pdayIndex = null; await ctx.commit(); } }, t('gym.startProgram')))));
    return out;
  }
  const today = dayKey();
  const ad = G().adapt;
  for (const [k, v] of Object.entries(ad.ignore)) if (v !== today) delete ad.ignore[k]; // "undo" lasts for today only
  const a = analyze(G(), today);
  const next = nextDay(G(), prog, a, today);
  const idx = pdayIndex ?? next.idx;
  const [day] = prog.days[idx];
  const plan = adaptPlan(G(), idx, a);
  const sugg = suggestions(G(), a);
  const pday = `${G().program}:${idx}`;
  const todaySets = G().log.filter((x) => x.day === today && x.pday === pday);
  const plannedSets = plan.items.reduce((s, x) => s + x.sets, 0);
  out.unshift(pageHead(dayName(day), h('span', { class: 'date' }, t('gym.todayMeta', { min: fmt(plan.minutes), done: fmt(todaySets.length), of: fmt(plannedSets) }))));
  out.push(
    h('div', { class: 'chips scroll' }, ...prog.days.map(([n], i) => h('button', { class: `chip${i === idx ? ' on' : ''}`, onclick: () => { pdayIndex = i; ctx.render(); } }, dayName(n)))),
    coachCard(prog, a, plan, sugg, next, pdayIndex === null),
    h('p', { class: 'muted small' }, t('gym.warmup')),
    ...plan.items.map((it) => exerciseCard(EX_BY_ID[it.id], it.sets, it.reps, pday, it.notes, plan.welcomeBack)),
    ...extraExercises.filter((id) => !plan.items.some((x) => x.id === id)).map((id) => exerciseCard(EX_BY_ID[id], 0, '8–15', pday)),
    h('details', { class: 'card add-ex' },
      h('summary', {}, t('gym.addAnother')),
      h('ul', { class: 'entries' }, ...EXERCISES.map((ex) => exRow(ex, () => { if (!extraExercises.includes(ex.id)) extraExercises.push(ex.id); ctx.render(); })))),
    todaySets.length ? h('button', { class: 'btn primary wide big', onclick: () => finishWorkout(pday, plannedSets) }, icon('check', 'icon-sm'), t('gym.finish')) : null,
    h('button', {
      class: 'link small', onclick: async () => {
        if (!await confirmDialog(t('gym.changeProgramQ'), t('gym.changeProgramBody'), t('tr.change'))) return;
        G().program = null; pdayIndex = null; await ctx.commit();
      },
    }, t('gym.programChange', { name: programName(G().program) })));
  return out;
}

// ---------- adaptive coach ----------
function coachCard(prog, a, plan, sugg, next, auto) {
  const ad = G().adapt;
  const today = dayKey();
  const save = async () => { await ctx.commit(); };
  if (!ad.on) {
    return h('article', { class: 'card coach off' }, h('div', { class: 'row' },
      h('span', { class: 'grow muted small' }, t('coach.offNote')),
      h('button', { class: 'link small', onclick: async () => { ad.on = true; await save(); } }, t('turnOn'))));
  }
  const lines = [];
  if (auto && next.reason) {
    lines.push(h('li', {}, h('span', { class: 'grow' }, next.reason),
      h('button', { class: 'link small', onclick: () => { pdayIndex = (next.idx + 1) % prog.days.length; ctx.render(); } }, t('coach.doNext'))));
  }
  for (const c of plan.changes) {
    lines.push(h('li', {}, h('span', { class: 'grow' }, c.text),
      c.key === 'removed'
        ? h('button', { class: 'link small', onclick: async () => { ad.removed = []; await save(); } }, t('coach.restoreAll'))
        : c.key === 'easy' ? null
          : h('button', { class: 'link small', onclick: async () => { ad.ignore[c.key] = today; if (c.key === 'time') ad.minutes = null; await save(); } }, t('meals.undoToday'))));
  }
  for (const sg of sugg) {
    if (sg.type === 'skip') {
      const alt = sg.alt && EX_BY_ID[sg.alt];
      lines.push(h('li', { class: 'suggest' }, h('span', { class: 'grow' }, sg.text, ` ${t('coach.wantChange')}`),
        h('span', { class: 'row wrap' },
          alt ? h('button', { class: 'btn ghost small-btn', onclick: async () => { ad.swaps[sg.id] = sg.alt; await save(); toast(`${exName(sg.id)} → ${exName(sg.alt)}`); } }, t('coach.swapFor', { name: exName(sg.alt) })) : null,
          h('button', { class: 'btn ghost small-btn', onclick: async () => { ad.removed.push(sg.id); await save(); } }, t('coach.removeIt')),
          h('button', { class: 'link small', onclick: async () => { ad.dismissed.push(sg.key); await save(); } }, t('coach.keepIt')))));
    } else if (sg.type === 'program') {
      lines.push(h('li', { class: 'suggest' }, h('span', { class: 'grow' }, sg.text),
        h('span', { class: 'row wrap' },
          h('button', { class: 'btn ghost small-btn', onclick: async () => { G().program = sg.to; pdayIndex = null; ad.swaps = {}; ad.removed = []; await save(); toast(t('coach.switched')); } }, t('coach.switchFb')),
          h('button', { class: 'link small', onclick: async () => { ad.dismissed.push(sg.key); await save(); } }, t('notNow')))));
    }
  }
  const swaps = Object.entries(ad.swaps);
  if (swaps.length) {
    lines.push(h('li', {}, h('span', { class: 'grow muted' }, t('coach.yourSwaps', { list: swaps.map(([f, to]) => `${exName(f)} → ${exName(to)}`).join(sep()) })),
      h('button', { class: 'link small', onclick: async () => { ad.swaps = {}; await save(); } }, t('coach.undoSwaps'))));
  }
  const parts = [];
  if (a.sessions.length) {
    parts.push(tn('coach.basedOn', a.sessions.length));
    if (a.completionAvg !== null) parts.push(t('coach.finishedPct', { pct: fmt(a.completionAvg * 100), n: fmt(Math.min(3, a.sessions.length)) }));
    if (a.typicalMinutes) parts.push(t('coach.usuallyMin', { n: fmt(a.typicalMinutes) }));
    if (a.perWeek !== null && a.weeksOfData >= 2) parts.push(t('coach.daysWeek', { n: fmt(a.perWeek, 1) }));
  }
  return h('article', { class: 'card coach' },
    h('div', { class: 'row' }, icon('pulse'), h('h2', { class: 'grow' }, t('coach.title')),
      h('button', { class: 'link small', onclick: async () => { ad.on = false; await save(); } }, t('turnOff'))),
    lines.length ? h('ul', { class: 'coach-list' }, ...lines) : h('p', { class: 'muted small' }, t('coach.nothing')),
    h('div', { class: 'time-row' }, h('span', { class: 'muted small' }, t('coach.timeToday')),
      h('div', { class: 'chips' }, ...[[null, t('coach.auto')], [30, '30'], [45, '45'], [60, '60'], [90, t('coach.min90')]].map(([v, l]) => h('button', {
        class: `chip small${ad.minutes === v ? ' on' : ''}`, onclick: async () => { ad.minutes = v; delete ad.ignore.time; await save(); },
      }, l)))),
    h('p', { class: 'muted small' }, parts.length ? parts.join(' · ') : t('coach.learns')));
}

const FEEL = [['easy', 'easy'], ['good', 'good'], ['hard', 'hard'], ['too-much', 'toomuch']];

function finishWorkout(pday, plannedSets) {
  const today = dayKey();
  const done = G().log.filter((x) => x.day === today && x.pday === pday).length;
  const sess = measureSession(G(), today);
  const kg = ctx.state.food?.profile?.weightKg || 63;
  const stats = sess ? h('div', { class: 'stats four' },
    h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, fmt(sess.workingSets)), h('div', { class: 'stat-l' }, t('gym.sum.sets'))),
    h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, `${fmt(sess.pct * 100)}%`), h('div', { class: 'stat-l' }, t('gym.sum.ofPlan'))),
    h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, fmt(sess.volume)), h('div', { class: 'stat-l' }, t('gym.sum.volume', { unit: t('unit.kg') }))),
    h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, fmt(sess.minutes)), h('div', { class: 'stat-l' }, t('unit.min')))) : null;
  const groups = sess ? Object.entries(sess.groups).sort((a, b) => b[1] - a[1]).map(([g, v]) => `${groupName(g)} ${fmt(v * 100)}%`).join(' · ') : '';
  return modal((close) => h('div', { class: 'sheet-body' },
    h('h2', {}, done >= plannedSets ? t('gym.complete') : t('gym.goodWork')),
    h('p', {}, t('gym.setsOfPlanned', { done: fmt(done), of: fmt(plannedSets) }), done < plannedSets ? ` ${t('gym.stopEarlyOk')}` : ''),
    stats,
    groups ? h('p', { class: 'muted small' }, t('gym.sum.groups', { list: groups })) : null,
    h('p', { class: 'muted small' }, t('gym.howFeel')),
    h('div', { class: 'feel' }, ...FEEL.map(([k, ic]) => h('button', {
      class: 'feel-btn', type: 'button',
      onclick: async () => {
        G().sessions = G().sessions.filter((x) => !(x.day === today && x.pday === pday));
        G().sessions.push({ day: today, pday, rating: k });
        close(k); await ctx.commit();
        const s2 = measureSession(G(), today);
        toast(s2 ? t('gym.savedEnergy', { kcal: fmt(sessionEnergy(s2, kg)) }) : t('gym.saved'));
      },
    }, icon(ic), t(`rating.${k}`)))),
    h('p', { class: 'muted small' }, t('gym.mealsAdapt')),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, t('gym.skip')))));
}

// ---------- LIBRARY ----------
function viewLibrary() {
  const groups = ['All', 'Legs', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core'];
  const list = EXERCISES.filter((ex) => (groupFilter === 'All' || ex.group === groupFilter)
    && (!muscleFilter || ex.primary.includes(muscleFilter) || ex.secondary.includes(muscleFilter))
    && (!query || `${ex.name} ${exName(ex.id)} ${ex.equip} ${equipText(ex)} ${musclesText([...ex.primary, ...ex.secondary])}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => (muscleFilter ? (b.primary.includes(muscleFilter) - a.primary.includes(muscleFilter)) : 0));
  const m = muscleFilter && muscleText(muscleFilter);
  const search = h('input', { type: 'search', value: query, placeholder: t('gym.searchPh'), 'aria-label': t('gym.search') });
  search.addEventListener('input', () => { query = search.value; const pos = search.selectionStart; ctx.render(); const s = document.querySelector('.lib-search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } });
  search.className = 'lib-search';
  return [
    pageHead(t('gym.exercises')),
    h('article', { class: 'card' },
      h('p', { class: 'muted small center' }, t('gym.tapMuscle')),
      bodyMaps({ primary: muscleFilter ? [muscleFilter] : [], selected: muscleFilter, names: muscleNames(), onPick: (mu) => { muscleFilter = muscleFilter === mu ? null : mu; ctx.render(); } }),
      m ? h('div', { class: 'muscle-info' },
        h('div', { class: 'row' }, h('h2', { class: 'grow' }, m.name), h('button', { class: 'link small', onclick: () => { muscleFilter = null; ctx.render(); } }, t('gym.clear'))),
        h('p', { class: 'muted small' }, h('i', {}, m.latin)),
        h('p', {}, m.does)) : null),
    search,
    h('div', { class: 'chips scroll' }, ...groups.map((g) => h('button', { class: `chip${g === groupFilter ? ' on' : ''}`, onclick: () => { groupFilter = g; ctx.render(); } }, groupName(g)))),
    list.length ? h('article', { class: 'card' }, h('ul', { class: 'entries' }, ...list.map((ex) => exRow(ex, () => openDetail(ex.id, 'library')))))
      : h('p', { class: 'muted card' }, t('gym.noMatch')),
  ];
}

function guidance(ex) {
  const rows = ex.kind === 'compound'
    ? [['strength', '3–5 × 3–6', '2–5'], ['growth', '3–4 × 6–12', '2–3'], ['endurance', '2–3 × 12–20', '1–2']]
    : [['growth', '2–4 × 10–20', '60–90s'], ['endurance', '2–3 × 15–25', '30–60s']];
  const restText = (r) => (r.endsWith('s') ? `${r.slice(0, -1)} ${t('gym.sec')}` : `${r} ${t('unit.min')}`);
  return h('table', { class: 'guide' },
    h('thead', {}, h('tr', {}, h('th', {}, t('gym.goal')), h('th', {}, t('gym.setsXReps')), h('th', {}, t('gym.rest')))),
    h('tbody', {}, ...rows.map(([g, sr, r]) => h('tr', {}, h('td', {}, t(`gym.goal.${g}`)), h('td', { class: 'num' }, sr), h('td', {}, restText(r))))));
}

function viewDetail() {
  const ex = EX_BY_ID[detailId];
  const x = exText(ex);
  const hist = sessionsFor(ex.id);
  const best = hist.flatMap((s) => s.sets).reduce((b, s) => (e1rm(s.kg, s.reps) > (b ? e1rm(b.kg, b.reps) : 0) ? s : b), null);
  return [
    h('button', { class: 'link back', onclick: () => { sub = detailFrom; ctx.render(); } }, icon('back', 'icon-sm'), t('back')),
    pageHead(x.name),
    h('div', { class: 'chips tags' }, h('span', { class: 'tag' }, x.level), h('span', { class: 'tag' }, x.equip), h('span', { class: 'tag' }, ex.kind === 'compound' ? t('gym.compound') : t('gym.isolation'))),
    h('article', { class: 'card' },
      demo(ex.pattern, t('gym.demoLabel', { name: x.name })),
      h('p', { class: 'muted small center' }, t('gym.demoHint'))),
    h('article', { class: 'card' },
      h('h2', {}, t('gym.musclesWorked')),
      bodyMaps({ primary: ex.primary, secondary: ex.secondary, names: muscleNames() }),
      h('div', { class: 'legend' }, h('span', { class: 'sw primary' }), h('span', { class: 'grow-wrap' }, h('span', {}, h('b', {}, `${t('gym.main')}: `), musclesText(ex.primary)))),
      ex.secondary.length ? h('div', { class: 'legend' }, h('span', { class: 'sw secondary' }), h('span', { class: 'grow-wrap' }, h('span', {}, h('b', {}, `${t('gym.helpers')}: `), musclesText(ex.secondary)))) : null),
    h('article', { class: 'card' },
      h('h2', {}, t('gym.startPos')), h('p', {}, x.setup),
      h('h2', {}, t('gym.howTo')), h('ol', { class: 'steps' }, ...x.steps.map((s) => h('li', {}, s))),
      h('h2', {}, t('gym.cues')), h('ul', { class: 'bullets' }, ...x.cues.map((s) => h('li', {}, s))),
      h('h2', {}, t('gym.mistakes')), h('ul', { class: 'bullets mistakes' }, ...x.mistakes.map((s) => h('li', {}, s)))),
    h('article', { class: 'card safety-card' }, h('h2', { class: 'row' }, icon('shield', 'icon-sm'), t('gym.safety')), h('p', {}, x.safety),
      h('p', { class: 'muted small' }, t('gym.safetyNote'))),
    h('article', { class: 'card' }, h('h2', {}, t('gym.setsRepsRest')), guidance(ex),
      h('p', { class: 'muted small' }, t('gym.basedOn'))),
    ex.alts.length ? h('article', { class: 'card' }, h('h2', {}, t('gym.alternatives')),
      h('ul', { class: 'entries' }, ...ex.alts.map((id) => exRow(EX_BY_ID[id], () => openDetail(id, detailFrom))))) : null,
    h('article', { class: 'card' }, h('h2', {}, t('gym.history')),
      best ? h('p', {}, t('gym.best', { w: fmtW(best.kg), reps: fmt(best.reps), e1rm: fmtW(e1rm(best.kg, best.reps)) })) : h('p', { class: 'muted' }, t('gym.notLogged')),
      hist.slice(0, 5).map((s) => h('p', { class: 'muted small' }, `${shortDay(s.day)}: ${s.sets.map((y) => `${fmt(Math.round(toUnit(y.kg) * 4) / 4, 2)}×${y.reps}`).join(sep())} ${unit()}`)),
      h('button', { class: 'btn primary wide', onclick: () => { if (!extraExercises.includes(ex.id)) extraExercises.push(ex.id); sub = 'workout'; ctx.render(); } }, t('gym.logToday'))),
  ];
}

// ---------- PROGRESS ----------
function viewProgress() {
  const log = G().log;
  if (!log.length) return [pageHead(t('food.tab.progress')), h('p', { class: 'muted card' }, t('gym.progressEmpty'))];
  const today = dayKey();
  const week = new Set(dayRange(today, 7));
  // Weekly hard sets per muscle (helpers count half)
  const vol = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 0]));
  for (const s of log) {
    if (!week.has(s.day)) continue;
    const ex = EX_BY_ID[s.ex];
    ex.primary.forEach((m) => { vol[m] += 1; });
    ex.secondary.forEach((m) => { vol[m] += 0.5; });
  }
  const days = dayRange(today, 56);
  const trained = new Set(log.map((s) => s.day));
  const weeks = Array.from({ length: 8 }, (_, i) => days.slice(i * 7, i * 7 + 7).filter((d) => trained.has(d)).length);
  const withHist = EXERCISES.filter((ex) => log.some((s) => s.ex === ex.id));
  if (!progressEx || !withHist.some((e) => e.id === progressEx)) progressEx = withHist[0].id;
  const chartDays = dayRange(today, 90);
  const bestByDay = new Map();
  for (const s of log) if (s.ex === progressEx && s.kg > 0) bestByDay.set(s.day, Math.max(bestByDay.get(s.day) || 0, toUnit(e1rm(s.kg, s.reps))));
  const sel = h('select', { 'aria-label': t('gym.exercise'), onchange: (e) => { progressEx = e.target.value; ctx.render(); } },
    ...withHist.map((ex) => h('option', { value: ex.id, selected: ex.id === progressEx }, exName(ex.id))));
  const pts = [...bestByDay.entries()].sort();
  const change = pts.length >= 2 ? ((pts.at(-1)[1] - pts[0][1]) / pts[0][1]) * 100 : null;

  return [
    pageHead(t('food.tab.progress')),
    h('article', { class: 'card' },
      h('h2', {}, t('gym.perWeek')),
      barChart({ days: days.filter((_, i) => i % 7 === 6), values: weeks, color: '#4ADE9A', yMax: 7, label: t('gym.perWeek') }),
      h('p', { class: 'muted small' }, t('gym.thisWeekWho', { n: fmt(weeks.at(-1)) }))),
    h('article', { class: 'card' },
      h('h2', {}, t('gym.strength')),
      sel,
      pts.length ? barChart({ days: chartDays, values: chartDays.map((d) => bestByDay.get(d) ?? null), color: '#6CB4FF', label: t('gym.e1rm') }) : h('p', { class: 'muted' }, t('gym.logWeights')),
      h('p', { class: 'muted small' }, t('gym.e1rmNote', { unit: unit() }), change !== null ? ` ${t('gym.since', { pct: `${change >= 0 ? '+' : ''}${fmt(change)}`, day: shortDay(pts[0][0]) })}` : '')),
    h('article', { class: 'card' },
      h('h2', {}, t('gym.setsPerMuscle')),
      h('p', { class: 'muted small' }, t('gym.setsZone')),
      h('ul', { class: 'volume' }, ...Object.entries(vol).map(([m, v]) => h('li', {},
        h('span', { class: 'v-name' }, muscleText(m).name),
        h('span', { class: 'v-bar' }, h('span', { class: 'v-zone' }), h('span', { class: `v-fill${v >= 10 && v <= 20 ? ' ok' : v > 20 ? ' hi' : ''}`, css: { width: `${Math.min(100, (v / 25) * 100)}%` } })),
        h('span', { class: 'v-num num' }, fmt(v, 1)))))),
    h('article', { class: 'card' },
      h('h2', {}, t('gym.pbs')),
      h('ul', { class: 'entries' }, ...withHist.map((ex) => {
        const b = log.filter((s) => s.ex === ex.id).reduce((a, s) => (e1rm(s.kg, s.reps) > e1rm(a.kg, a.reps) ? s : a));
        return h('li', {}, h('span', { class: 'grow' }, exName(ex.id)), h('span', { class: 'small num' }, `${fmtW(b.kg)} × ${b.reps}`));
      }))),
  ];
}

// ---------- SAFETY ----------
function viewSafety() {
  const answers = Array.from({ length: 7 }, () => null);
  const result = h('div', {});
  const showResult = () => {
    if (answers.some((a) => a === null)) { result.replaceChildren(); return; }
    const yes = answers.filter(Boolean).length;
    result.replaceChildren(yes
      ? h('div', { class: 'alert warnbox' }, h('strong', {}, tn('parq.yesN', yes)), h('p', {}, t('parq.yesBody')))
      : h('div', { class: 'alert okbox' }, h('strong', {}, t('parq.clear')), h('p', {}, t('parq.clearBody'))));
    G().screen = { date: dayKey(), yes };
    ctx.save();
  };
  const prior = G().screen;
  const specials = ['bp', 'pregnancy', 'teen', 'back', 'diabetes', 'ramadan'];
  return [
    pageHead(t('gym.safetyTitle')),
    h('article', { class: 'card' },
      h('h2', {}, t('parq.title')),
      h('p', { class: 'muted small' }, t('parq.intro')),
      prior ? h('p', { class: prior.yes ? 'warn small' : 'ok small' }, prior.yes ? t('parq.lastYes', { day: prior.date, n: fmt(prior.yes) }) : t('parq.lastClear', { day: prior.date })) : null,
      h('ol', { class: 'parq' }, ...answers.map((_, i) => h('li', {}, h('p', {}, t(`parq.q${i + 1}`)), h('div', { class: 'row' }, ...[[t('no'), false], [t('yes'), true]].map(([l, v]) => h('button', {
        class: 'chip', type: 'button',
        onclick: (e) => { answers[i] = v; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); showResult(); },
      }, l)))))),
      result),
    h('article', { class: 'card dangerbox' },
      h('h2', { class: 'row' }, icon('alert', 'icon-sm'), t('stop.title')),
      h('ul', { class: 'bullets' }, ...[1, 2, 3, 4, 5, 6].map((i) => h('li', {}, t(`stop.${i}`)))),
      h('p', {}, h('strong', {}, t('stop.emergency')))),
    h('article', { class: 'card' },
      h('h2', {}, t('doms.title')),
      h('table', { class: 'guide' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, t('doms.normal')), h('th', {}, t('doms.injury')))),
        h('tbody', {}, ...['feels', 'where', 'when', 'move'].map((k) => h('tr', {}, h('td', {}, t(`doms.${k}`)), h('td', {}, t(`doms.${k}.n`)), h('td', {}, t(`doms.${k}.i`)))))),
      h('p', { class: 'muted small' }, t('doms.see'))),
    h('article', { class: 'card' },
      h('h2', {}, t('special.title')),
      ...specials.map((k) => h('details', { class: 'special' }, h('summary', {}, t(`special.${k}`)), h('p', {}, t(`special.${k}.body`))))),
    h('article', { class: 'card' },
      h('h2', {}, t('refs.title')),
      h('p', { class: 'muted small' }, t('refs.intro')),
      h('ol', { class: 'refs' }, ...REFERENCES.map((r0) => {
        const r = refText(r0);
        return h('li', {},
          h('a', { href: r0.url, target: '_blank', rel: 'noopener noreferrer' }, r.title),
          h('span', { class: 'muted small block' }, r.short, ' · ', h('bdi', { lang: 'en', dir: 'ltr', class: 'citation' }, r0.where)),
          h('span', { class: 'small block' }, r.note));
      }))),
    h('p', { class: 'muted small' }, t('gym.disclaimer')),
  ];
}

// ---------- entry ----------
export function viewGym(c) {
  ctx = c;
  const tabs = [['workout', t('gym.tab.workout')], ['library', t('gym.tab.library')], ['progress', t('food.tab.progress')], ['safety', t('gym.tab.safety')]];
  const active = sub === 'detail' ? detailFrom : sub;
  const seg = h('div', { class: 'chips seg', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', {
    class: `chip${k === active ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === active), onclick: () => { sub = k; ctx.render(); },
  }, l)));
  const body = sub === 'detail' ? viewDetail() : sub === 'library' ? viewLibrary() : sub === 'progress' ? viewProgress() : sub === 'safety' ? viewSafety() : viewWorkout();
  return h('section', { class: 'gym' }, seg, ...body);
}

export function resetGymView() { pdayIndex = null; }

