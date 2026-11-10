// Gym tab: workout logger, exercise library with muscle maps and animated
// demonstrations, progress analytics, and a safety & evidence guide.
import { h, uid, toast, confirmDialog, modal } from './ui.js';
import { dayKey, addDays, dayRange, parseDay } from './stats.js';
import { barChart } from './charts.js';
import { MUSCLES, EXERCISES, EX_BY_ID, PROGRAMS, REFERENCES } from './exercises.js';
import { bodyMaps } from './body.js';
import { demo } from './poses.js';
import { analyze, adaptPlan, suggestions, nextDay, loadTip } from './coach.js';

const LB = 0.45359237;
const k0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const k1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const MUSCLE_NAMES = Object.fromEntries(Object.entries(MUSCLES).map(([k, v]) => [k, v.name]));

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
const unit = () => (isLb() ? 'lb' : 'kg');
const toUnit = (kg) => (isLb() ? kg / LB : kg);
const fromUnit = (v) => (isLb() ? v * LB : v);
const fmtW = (kg) => `${k1.format(Math.round(toUnit(kg) * 4) / 4)} ${unit()}`;

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
      $timer.replaceChildren(h('strong', {}, 'Rest done: next set!'), h('button', { class: 'btn ghost', onclick: () => { $timer.hidden = true; } }, 'OK'));
      navigator.vibrate?.([200, 100, 200]);
      setTimeout(() => { if (Date.now() > timer.end + 6000) $timer.hidden = true; }, 6500);
      return;
    }
    $timer.replaceChildren(
      h('span', { class: 'grow' }, 'Rest ', h('strong', {}, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`)),
      h('button', { class: 'btn ghost', onclick: () => { timer.end += 30000; tick(); } }, '+30 s'),
      h('button', { class: 'btn ghost', onclick: () => { clearInterval(timer.id); $timer.hidden = true; } }, 'Skip'));
  };
  $timer.hidden = false;
  tick();
  timer.id = setInterval(tick, 1000);
}

// ---------- shared pieces ----------
const musclesText = (list) => list.map((m) => MUSCLES[m].name).join(', ');

function exRow(ex, onClick) {
  return h('li', {}, h('button', { class: 'entry ex-row', onclick: onClick },
    h('span', { class: 'grow' }, h('strong', {}, ex.name), h('span', { class: 'muted small block' }, `${musclesText(ex.primary)} · ${ex.equip}`)),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
}

function openDetail(id, from) {
  detailId = id; detailFrom = from; sub = 'detail';
  ctx.render();
  window.scrollTo(0, 0);
}

// ---------- WORKOUT ----------

function exerciseCard(ex, sets, reps, pday, notes = [], welcomeBack = false) {
  const today = dayKey();
  const done = G().log.filter((s) => s.ex === ex.id && s.day === today).sort((a, b) => a.ts - b.ts);
  const last = sessionsFor(ex.id).find((s) => s.day !== today);
  const prev = done.at(-1) || last?.sets.at(-1);
  const w = h('input', { type: 'text', inputmode: 'decimal', placeholder: unit(), value: prev ? String(Math.round(toUnit(prev.kg) * 4) / 4) : '', 'aria-label': `${ex.name} weight in ${unit()}` });
  const r = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'reps', value: prev ? String(prev.reps) : '', 'aria-label': `${ex.name} reps` });
  const rest = ex.kind === 'compound' ? 150 : 75;
  return h('article', { class: 'card ex-card' },
    h('button', { class: 'ex-title', onclick: () => openDetail(ex.id, 'workout') },
      h('span', { class: 'grow' }, h('h2', {}, ex.name), h('span', { class: 'muted small' }, `${sets ? `${sets} sets × ${reps} · ` : ''}rest ${ex.kind === 'compound' ? '2–3 min' : '60–90 s'} · ${musclesText(ex.primary)}`)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, 'ⓘ')),
    last ? h('p', { class: 'muted small' }, `Last time (${parseDay(last.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}): ${last.sets.map((s) => `${k1.format(Math.round(toUnit(s.kg) * 4) / 4)}×${s.reps}`).join(', ')} ${unit()}`) : null,
    notes.length ? h('p', { class: 'adapted small' }, '↻ ', [...new Set(notes)].join(' · ')) : null,
    h('p', { class: 'tip small' }, loadTip(ex, reps, sessionsFor(ex.id).filter((x) => x.day !== today), { welcomeBack, lb: isLb() })),
    done.length ? h('ol', { class: 'sets' }, ...done.map((s) => h('li', {},
      h('span', { class: 'grow' }, `${fmtW(s.kg)} × ${s.reps}`),
      h('button', { class: 'icon-btn small', 'aria-label': 'Delete set', onclick: async () => { G().log = G().log.filter((x) => x !== s); await ctx.commit(); } }, '✕')))) : null,
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
        if (best > 0 && kg > 0 && e1rm(kg, reps) > best) toast(`🏆 New best for ${ex.name}!`);
      },
    },
    w, h('span', { class: 'muted' }, '×'), r,
    h('button', { class: 'btn primary', type: 'submit' }, sets && done.length >= sets ? 'Extra set' : `Log set ${done.length + 1}`)));
}

function viewWorkout() {
  const out = [];
  if (!G().screen) {
    out.push(h('article', { class: 'card callout' },
      h('h2', {}, 'Before your first workout'),
      h('p', { class: 'muted' }, 'Take the 1-minute health check (7 questions from the PAR-Q+, the standard pre-exercise screening). It tells you whether to see a doctor first.'),
      h('button', { class: 'btn primary wide', onclick: () => { sub = 'safety'; ctx.render(); } }, 'Take the health check')));
  }
  const prog = PROGRAMS[G().program];
  if (!prog) {
    out.push(h('h1', {}, 'Choose a program'),
      h('p', { class: 'muted' }, 'Each program trains every muscle about twice a week with 10+ hard sets, which research shows builds the most muscle and strength.'),
      ...Object.entries(PROGRAMS).map(([k, p]) => h('article', { class: 'card' },
        h('h2', {}, p.name),
        h('p', { class: 'muted small' }, p.who),
        h('ul', { class: 'bullets small' }, ...p.days.map(([n, list]) => h('li', {}, h('b', {}, `${n}: `), list.map(([id]) => EX_BY_ID[id].name).join(', ')))),
        h('button', { class: 'btn primary wide', onclick: async () => { G().program = k; pdayIndex = null; await ctx.commit(); } }, 'Start this program'))));
    return out;
  }
  const today = dayKey();
  const ad = G().adapt;
  for (const [k, v] of Object.entries(ad.ignore)) if (v !== today) delete ad.ignore[k]; // "undo" lasts for today only
  const a = analyze(G(), today);
  const next = nextDay(G(), prog, a, today);
  const idx = pdayIndex ?? next.idx;
  const [dayName] = prog.days[idx];
  const plan = adaptPlan(G(), idx, a);
  const sugg = suggestions(G(), a);
  const pday = `${G().program}:${idx}`;
  const todaySets = G().log.filter((x) => x.day === today && x.pday === pday);
  const plannedSets = plan.items.reduce((t, x) => t + x.sets, 0);
  out.push(
    h('div', { class: 'row' }, h('h1', { class: 'grow' }, dayName), h('span', { class: 'muted small' }, `≈ ${plan.minutes} min · ${todaySets.length}/${plannedSets} sets`)),
    h('div', { class: 'chips' }, ...prog.days.map(([n], i) => h('button', { class: `chip${i === idx ? ' on' : ''}`, onclick: () => { pdayIndex = i; ctx.render(); } }, n))),
    coachCard(prog, a, plan, sugg, next, pdayIndex === null),
    h('p', { class: 'muted small' }, 'Warm up 5–10 min (bike, brisk walk), then do 1–2 light sets before your first heavy exercise. Stop each set with about 1–3 reps left in the tank.'),
    ...plan.items.map((it) => exerciseCard(EX_BY_ID[it.id], it.sets, it.reps, pday, it.notes, plan.welcomeBack)),
    ...extraExercises.filter((id) => !plan.items.some((x) => x.id === id)).map((id) => exerciseCard(EX_BY_ID[id], 0, '8–15', pday)),
    h('details', { class: 'card add-ex' },
      h('summary', {}, '+ Add another exercise'),
      h('ul', { class: 'entries' }, ...EXERCISES.map((ex) => exRow(ex, () => { if (!extraExercises.includes(ex.id)) extraExercises.push(ex.id); ctx.render(); })))),
    todaySets.length ? h('button', { class: 'btn primary wide', onclick: () => finishWorkout(pday, plannedSets) }, '✓ Finish workout') : null,
    h('button', {
      class: 'link small', onclick: async () => {
        if (!await confirmDialog('Change program?', 'Your logged sets are kept.', 'Change')) return;
        G().program = null; pdayIndex = null; await ctx.commit();
      },
    }, `Program: ${prog.name} · change`));
  return out;
}

// ---------- adaptive coach ----------
function coachCard(prog, a, plan, sugg, next, auto) {
  const ad = G().adapt;
  const today = dayKey();
  const save = async () => { await ctx.commit(); };
  if (!ad.on) {
    return h('article', { class: 'card coach off' }, h('div', { class: 'row' },
      h('span', { class: 'grow muted small' }, 'Adaptive coach is off: the plan is shown exactly as written.'),
      h('button', { class: 'link small', onclick: async () => { ad.on = true; await save(); } }, 'Turn on')));
  }
  const lines = [];
  if (auto && next.reason) {
    lines.push(h('li', {}, h('span', { class: 'grow' }, next.reason),
      h('button', { class: 'link small', onclick: () => { pdayIndex = (next.idx + 1) % prog.days.length; ctx.render(); } }, 'Do the next day')));
  }
  for (const c of plan.changes) {
    lines.push(h('li', {}, h('span', { class: 'grow' }, c.text),
      c.key === 'removed'
        ? h('button', { class: 'link small', onclick: async () => { ad.removed = []; await save(); } }, 'Restore all')
        : c.key === 'easy' ? null
          : h('button', { class: 'link small', onclick: async () => { ad.ignore[c.key] = today; if (c.key === 'time') ad.minutes = null; await save(); } }, 'Undo for today')));
  }
  for (const sg of sugg) {
    if (sg.type === 'skip') {
      const ex = EX_BY_ID[sg.id]; const alt = sg.alt && EX_BY_ID[sg.alt];
      lines.push(h('li', { class: 'suggest' }, h('span', { class: 'grow' }, sg.text, ' Want to change it?'),
        h('span', { class: 'row wrap' },
          alt ? h('button', { class: 'btn ghost small-btn', onclick: async () => { ad.swaps[sg.id] = sg.alt; await save(); toast(`${ex.name} → ${alt.name}`); } }, `Swap for ${alt.name}`) : null,
          h('button', { class: 'btn ghost small-btn', onclick: async () => { ad.removed.push(sg.id); await save(); } }, 'Remove it'),
          h('button', { class: 'link small', onclick: async () => { ad.dismissed.push(sg.key); await save(); } }, 'Keep it'))));
    } else if (sg.type === 'program') {
      lines.push(h('li', { class: 'suggest' }, h('span', { class: 'grow' }, sg.text),
        h('span', { class: 'row wrap' },
          h('button', { class: 'btn ghost small-btn', onclick: async () => { G().program = sg.to; pdayIndex = null; ad.swaps = {}; ad.removed = []; await save(); toast('Switched to Full body'); } }, 'Switch to Full body'),
          h('button', { class: 'link small', onclick: async () => { ad.dismissed.push(sg.key); await save(); } }, 'Not now'))));
    }
  }
  const swaps = Object.entries(ad.swaps);
  if (swaps.length) {
    lines.push(h('li', {}, h('span', { class: 'grow muted' }, `Your swaps: ${swaps.map(([f, t]) => `${EX_BY_ID[f].name} → ${EX_BY_ID[t].name}`).join(', ')}`),
      h('button', { class: 'link small', onclick: async () => { ad.swaps = {}; await save(); } }, 'Undo swaps')));
  }
  const stats = a.sessions.length
    ? `Based on ${a.sessions.length} workout${a.sessions.length > 1 ? 's' : ''}${a.completionAvg !== null ? ` · finished ${Math.round(a.completionAvg * 100)}% of the last ${Math.min(3, a.sessions.length)}` : ''}${a.typicalMinutes ? ` · usually ~${Math.round(a.typicalMinutes)} min` : ''}${a.perWeek !== null && a.weeksOfData >= 2 ? ` · ${a.perWeek.toFixed(1)} days/week` : ''}`
    : 'The coach learns from your workouts: how long you train, what you finish, what you skip and how it feels.';
  return h('article', { class: 'card coach' },
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Your coach'),
      h('button', { class: 'link small', onclick: async () => { ad.on = false; await save(); } }, 'Turn off')),
    lines.length ? h('ul', { class: 'coach-list' }, ...lines) : h('p', { class: 'muted small' }, 'Nothing to change today: the plan fits how you’ve been training.'),
    h('div', { class: 'time-row' }, h('span', { class: 'muted small' }, 'Time today'),
      h('div', { class: 'chips' }, ...[[null, 'Auto'], [30, '30'], [45, '45'], [60, '60'], [90, '90 min']].map(([v, l]) => h('button', {
        class: `chip small${ad.minutes === v ? ' on' : ''}`, onclick: async () => { ad.minutes = v; delete ad.ignore.time; await save(); },
      }, l)))),
    h('p', { class: 'muted small' }, stats));
}

function finishWorkout(pday, plannedSets) {
  const today = dayKey();
  const done = G().log.filter((x) => x.day === today && x.pday === pday).length;
  return modal((close) => h('div', { class: 'sheet-body' },
    h('h2', {}, done >= plannedSets ? 'Workout complete 💪' : 'Good work today'),
    h('p', {}, `${done} of ${plannedSets} planned sets${done < plannedSets ? '. Stopping early is fine: the coach adjusts the next plans to how you really train.' : '.'}`),
    h('p', { class: 'muted small' }, 'How did it feel? (helps the coach set the next workouts)'),
    h('div', { class: 'feel' }, ...[['easy', '😌', 'Easy'], ['good', '🙂', 'Good'], ['hard', '😤', 'Hard'], ['too-much', '🥵', 'Too much']].map(([k, e, l]) => h('button', {
      class: 'feel-btn', type: 'button',
      onclick: async () => {
        G().sessions = G().sessions.filter((x) => !(x.day === today && x.pday === pday));
        G().sessions.push({ day: today, pday, rating: k });
        close(k); await ctx.commit(); toast('Saved. See you next time!');
      },
    }, h('span', { class: 'feel-emoji', 'aria-hidden': 'true' }, e), l))),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Skip'))));
}

// ---------- LIBRARY ----------
function viewLibrary() {
  const groups = ['All', 'Legs', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core'];
  const list = EXERCISES.filter((ex) => (groupFilter === 'All' || ex.group === groupFilter)
    && (!muscleFilter || ex.primary.includes(muscleFilter) || ex.secondary.includes(muscleFilter))
    && (!query || `${ex.name} ${ex.equip} ${musclesText([...ex.primary, ...ex.secondary])}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => (muscleFilter ? (b.primary.includes(muscleFilter) - a.primary.includes(muscleFilter)) : 0));
  const m = muscleFilter && MUSCLES[muscleFilter];
  const search = h('input', { type: 'search', value: query, placeholder: 'Search exercises or muscles', 'aria-label': 'Search exercises' });
  search.addEventListener('input', () => { query = search.value; const pos = search.selectionStart; ctx.render(); const s = document.querySelector('.lib-search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } });
  search.className = 'lib-search';
  return [
    h('h1', {}, 'Exercises'),
    h('article', { class: 'card' },
      h('p', { class: 'muted small center' }, 'Tap a muscle to see what trains it'),
      bodyMaps({ primary: muscleFilter ? [muscleFilter] : [], selected: muscleFilter, names: MUSCLE_NAMES, onPick: (mu) => { muscleFilter = muscleFilter === mu ? null : mu; ctx.render(); } }),
      m ? h('div', { class: 'muscle-info' },
        h('div', { class: 'row' }, h('h2', { class: 'grow' }, m.name), h('button', { class: 'link small', onclick: () => { muscleFilter = null; ctx.render(); } }, 'Clear')),
        h('p', { class: 'muted small' }, h('i', {}, m.latin)),
        h('p', {}, m.does)) : null),
    search,
    h('div', { class: 'chips' }, ...groups.map((g) => h('button', { class: `chip${g === groupFilter ? ' on' : ''}`, onclick: () => { groupFilter = g; ctx.render(); } }, g))),
    list.length ? h('article', { class: 'card' }, h('ul', { class: 'entries' }, ...list.map((ex) => exRow(ex, () => openDetail(ex.id, 'library')))))
      : h('p', { class: 'muted card' }, 'No exercises match.'),
  ];
}

function guidance(ex) {
  const rows = ex.kind === 'compound'
    ? [['Strength', '3–5 sets × 3–6 reps', '2–5 min'], ['Muscle growth', '3–4 sets × 6–12 reps', '2–3 min'], ['Endurance', '2–3 sets × 12–20 reps', '1–2 min']]
    : [['Muscle growth', '2–4 sets × 10–20 reps', '60–90 s'], ['Endurance', '2–3 sets × 15–25 reps', '30–60 s']];
  return h('table', { class: 'guide' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Goal'), h('th', {}, 'Sets × reps'), h('th', {}, 'Rest'))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c))))));
}

function viewDetail() {
  const ex = EX_BY_ID[detailId];
  const hist = sessionsFor(ex.id);
  const best = hist.flatMap((s) => s.sets).reduce((b, s) => (e1rm(s.kg, s.reps) > (b ? e1rm(b.kg, b.reps) : 0) ? s : b), null);
  return [
    h('button', { class: 'link back', onclick: () => { sub = detailFrom; ctx.render(); } }, '‹ Back'),
    h('h1', {}, ex.name),
    h('div', { class: 'chips tags' }, h('span', { class: 'tag' }, ex.level), h('span', { class: 'tag' }, ex.equip), h('span', { class: 'tag' }, ex.kind === 'compound' ? 'Compound (multi-joint)' : 'Isolation (single joint)')),
    h('article', { class: 'card' },
      demo(ex.pattern, `${ex.name}: start and end position`),
      h('p', { class: 'muted small center' }, 'Animated: start ↔ end position (side view). Faded figure = end position.')),
    h('article', { class: 'card' },
      h('h2', {}, 'Muscles worked'),
      bodyMaps({ primary: ex.primary, secondary: ex.secondary, names: MUSCLE_NAMES }),
      h('div', { class: 'legend' }, h('span', { class: 'sw primary' }), h('span', { class: 'grow-wrap' }, h('b', {}, 'Main: '), musclesText(ex.primary))),
      ex.secondary.length ? h('div', { class: 'legend' }, h('span', { class: 'sw secondary' }), h('span', { class: 'grow-wrap' }, h('b', {}, 'Helpers: '), musclesText(ex.secondary))) : null),
    h('article', { class: 'card' },
      h('h2', {}, 'Starting position'), h('p', {}, ex.setup),
      h('h2', {}, 'How to do it'), h('ol', { class: 'steps' }, ...ex.steps.map((s) => h('li', {}, s))),
      h('h2', {}, 'Form cues'), h('ul', { class: 'bullets' }, ...ex.cues.map((s) => h('li', {}, s))),
      h('h2', {}, 'Common mistakes'), h('ul', { class: 'bullets mistakes' }, ...ex.mistakes.map((s) => h('li', {}, s)))),
    h('article', { class: 'card safety-card' }, h('h2', {}, '⚕ Safety'), h('p', {}, ex.safety),
      h('p', { class: 'muted small' }, 'Effort and a muscle burn are normal. Sharp, stabbing or joint pain is not: stop the set.')),
    h('article', { class: 'card' }, h('h2', {}, 'Sets, reps & rest'), guidance(ex),
      h('p', { class: 'muted small' }, 'Based on the ACSM position stand and Schoenfeld et al. Finish sets with about 1–3 reps left in reserve.')),
    ex.alts.length ? h('article', { class: 'card' }, h('h2', {}, 'Alternatives'),
      h('ul', { class: 'entries' }, ...ex.alts.map((id) => exRow(EX_BY_ID[id], () => openDetail(id, detailFrom))))) : null,
    h('article', { class: 'card' }, h('h2', {}, 'Your history'),
      best ? h('p', {}, `Best: ${fmtW(best.kg)} × ${best.reps} (estimated 1-rep max ≈ ${fmtW(e1rm(best.kg, best.reps))})`) : h('p', { class: 'muted' }, 'Not logged yet.'),
      hist.slice(0, 5).map((s) => h('p', { class: 'muted small' }, `${parseDay(s.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${s.sets.map((x) => `${k1.format(Math.round(toUnit(x.kg) * 4) / 4)}×${x.reps}`).join(', ')} ${unit()}`)),
      h('button', { class: 'btn primary wide', onclick: () => { if (!extraExercises.includes(ex.id)) extraExercises.push(ex.id); sub = 'workout'; ctx.render(); } }, 'Log this exercise today')),
  ];
}

// ---------- PROGRESS ----------
function viewProgress() {
  const log = G().log;
  if (!log.length) return [h('h1', {}, 'Progress'), h('p', { class: 'muted card' }, 'Log a few workouts and your strength, volume per muscle and consistency will show up here.')];
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
  // Workouts per week, last 8 weeks
  const days = dayRange(today, 56);
  const trained = new Set(log.map((s) => s.day));
  const weeks = Array.from({ length: 8 }, (_, i) => days.slice(i * 7, i * 7 + 7).filter((d) => trained.has(d)).length);
  // Strength chart
  const withHist = EXERCISES.filter((ex) => log.some((s) => s.ex === ex.id));
  if (!progressEx || !withHist.some((e) => e.id === progressEx)) progressEx = withHist[0].id;
  const chartDays = dayRange(today, 90);
  const bestByDay = new Map();
  for (const s of log) if (s.ex === progressEx && s.kg > 0) bestByDay.set(s.day, Math.max(bestByDay.get(s.day) || 0, toUnit(e1rm(s.kg, s.reps))));
  const sel = h('select', { 'aria-label': 'Exercise', onchange: (e) => { progressEx = e.target.value; ctx.render(); } },
    ...withHist.map((ex) => h('option', { value: ex.id, selected: ex.id === progressEx }, ex.name)));
  const pts = [...bestByDay.entries()].sort();
  const change = pts.length >= 2 ? ((pts.at(-1)[1] - pts[0][1]) / pts[0][1]) * 100 : null;

  return [
    h('h1', {}, 'Progress'),
    h('article', { class: 'card' },
      h('h2', {}, 'Workouts per week'),
      barChart({ days: days.filter((_, i) => i % 7 === 6), values: weeks, color: '#2f7d6d', yMax: 7, label: 'Workouts per week' }),
      h('p', { class: 'muted small' }, `${weeks.at(-1)} this week · WHO recommends strength training at least 2 days a week.`)),
    h('article', { class: 'card' },
      h('h2', {}, 'Strength'),
      sel,
      pts.length ? barChart({ days: chartDays, values: chartDays.map((d) => bestByDay.get(d) ?? null), color: '#3b6fb6', label: 'Estimated 1-rep max' }) : h('p', { class: 'muted' }, 'Log sets with weight to see strength trends.'),
      h('p', { class: 'muted small' }, `Estimated 1-rep max per session (Epley formula), in ${unit()}.`, change !== null ? ` ${change >= 0 ? '+' : ''}${k0.format(change)}% since ${parseDay(pts[0][0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.` : '')),
    h('article', { class: 'card' },
      h('h2', {}, 'Sets per muscle, last 7 days'),
      h('p', { class: 'muted small' }, 'Target zone 10–20 hard sets per muscle per week for growth (Schoenfeld et al., 2017). Helper muscles count as half a set.'),
      h('ul', { class: 'volume' }, ...Object.entries(vol).map(([m, v]) => h('li', {},
        h('span', { class: 'v-name' }, MUSCLES[m].name),
        h('span', { class: 'v-bar' }, h('span', { class: 'v-zone' }), h('span', { class: `v-fill${v >= 10 && v <= 20 ? ' ok' : v > 20 ? ' hi' : ''}`, css: { width: `${Math.min(100, (v / 25) * 100)}%` } })),
        h('span', { class: 'v-num' }, k1.format(v)))))),
    h('article', { class: 'card' },
      h('h2', {}, 'Personal bests'),
      h('ul', { class: 'entries' }, ...withHist.map((ex) => {
        const b = log.filter((s) => s.ex === ex.id).reduce((a, s) => (e1rm(s.kg, s.reps) > e1rm(a.kg, a.reps) ? s : a));
        return h('li', {}, h('span', { class: 'grow' }, ex.name), h('span', { class: 'small' }, `${fmtW(b.kg)} × ${b.reps}`));
      }))),
  ];
}

// ---------- SAFETY ----------
const PARQ = [
  'Has a doctor ever said you have a heart condition or high blood pressure?',
  'Do you feel pain in your chest at rest, during daily activities, or when you are physically active?',
  'Do you lose balance because of dizziness, or have you lost consciousness, in the last 12 months?',
  'Have you been diagnosed with another chronic medical condition (other than heart disease or high blood pressure), e.g. diabetes, asthma, kidney disease?',
  'Are you currently taking prescribed medicine for a chronic medical condition?',
  'Do you have (or had in the last 12 months) a bone, joint or soft-tissue problem (muscle, ligament, tendon) that could get worse with more activity?',
  'Has a doctor ever said you should only do medically supervised physical activity?',
];

function viewSafety() {
  const answers = PARQ.map(() => null);
  const result = h('div', {});
  const showResult = () => {
    if (answers.some((a) => a === null)) { result.replaceChildren(); return; }
    const yes = answers.filter(Boolean).length;
    result.replaceChildren(yes
      ? h('div', { class: 'alert warnbox' }, h('strong', {}, `You answered yes to ${yes} question${yes > 1 ? 's' : ''}.`),
        h('p', {}, 'Talk to a doctor before starting or intensifying training. Show them this list and the type of training you plan. Most people with these conditions can and should strength train. It often helps, but the plan may need adjusting.'))
      : h('div', { class: 'alert okbox' }, h('strong', {}, '✓ You’re cleared to start.'), h('p', {}, 'Start light and build up gradually. Redo this check if your health changes.')));
    G().screen = { date: dayKey(), yes };
    ctx.save();
  };
  const prior = G().screen;
  return [
    h('h1', {}, 'Safety & evidence'),
    h('article', { class: 'card' },
      h('h2', {}, 'Health check before exercise'),
      h('p', { class: 'muted small' }, 'Based on the PAR-Q+ (the internationally used pre-exercise screening). Your answers stay on this phone.'),
      prior ? h('p', { class: prior.yes ? 'warn small' : 'ok small' }, `Last check ${prior.date}: ${prior.yes ? `${prior.yes} yes answer(s). Get medical advice first.` : 'all clear.'}`) : null,
      h('ol', { class: 'parq' }, ...PARQ.map((q, i) => h('li', {}, h('p', {}, q), h('div', { class: 'row' }, ...[['No', false], ['Yes', true]].map(([l, v]) => h('button', {
        class: 'chip', type: 'button',
        onclick: (e) => { answers[i] = v; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); showResult(); },
      }, l)))))),
      result),
    h('article', { class: 'card dangerbox' },
      h('h2', {}, '🛑 Stop immediately and get help if you have'),
      h('ul', { class: 'bullets' },
        h('li', {}, 'Chest pain, pressure or tightness, or pain spreading to the arm, jaw or back'),
        h('li', {}, 'Severe shortness of breath, fainting, or feeling like you might faint'),
        h('li', {}, 'A racing or irregular heartbeat that doesn’t settle with rest'),
        h('li', {}, 'Sudden severe headache, confusion, or vision problems'),
        h('li', {}, 'Sharp, stabbing pain in a joint, a "pop" with swelling, or numbness/tingling down an arm or leg'),
        h('li', {}, 'Very dark (cola-coloured) urine with extreme muscle pain and swelling 1–3 days after a hard session. This can be rhabdomyolysis, a medical emergency.')),
      h('p', {}, h('strong', {}, 'Morocco emergency: 15 (ambulance / civil protection) or 141 (SAMU). From a mobile phone, 112 also works.'))),
    h('article', { class: 'card' },
      h('h2', {}, 'Normal soreness vs. injury'),
      h('table', { class: 'guide' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Normal soreness (DOMS)'), h('th', {}, 'Possible injury'))),
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Feels'), h('td', {}, 'Dull, achy, stiff'), h('td', {}, 'Sharp, stabbing, burning')),
          h('tr', {}, h('td', {}, 'Where'), h('td', {}, 'Across the muscle, both sides'), h('td', {}, 'One spot, one side, or a joint')),
          h('tr', {}, h('td', {}, 'When'), h('td', {}, 'Starts 12–24 h after, peaks 24–72 h'), h('td', {}, 'During the set, sudden')),
          h('tr', {}, h('td', {}, 'Movement'), h('td', {}, 'Eases as you warm up'), h('td', {}, 'Gets worse; may swell or bruise')))),
      h('p', { class: 'muted small' }, 'See a doctor or physiotherapist if pain lasts more than 1–2 weeks, keeps you up at night, or comes with swelling or weakness.')),
    h('article', { class: 'card' },
      h('h2', {}, 'Special situations'),
      ...[
        ['High blood pressure or heart disease', 'Strength training is recommended for most people, with medical clearance first. Use moderate weights (stop well short of failure), breathe out as you lift and never hold your breath, and avoid 1-rep-max attempts. (AHA, 2007)'],
        ['Pregnancy', 'Strength training is encouraged in an uncomplicated pregnancy. Avoid lying flat on your back for long periods after the first trimester, avoid heavy straining and contact risks, and stop with bleeding, dizziness, chest pain or contractions. (ACOG, 2020)'],
        ['Under 18', 'Resistance training is safe and beneficial for teens when supervised, with technique first and gradual loading. Avoid max lifts until technique is solid. (NSCA, 2009)'],
        ['Back pain', 'For most ongoing low-back pain, staying active and strengthening helps. Start light, skip movements that clearly worsen symptoms, and build up slowly. Leg pain, numbness, weakness, or bladder/bowel changes need a doctor urgently.'],
        ['Diabetes', 'Training improves blood sugar control. If you use insulin or certain tablets, check glucose before and after, carry fast sugar (dates, juice), and ask your doctor how to adjust doses around training.'],
        ['Training during Ramadan', 'Train lighter. The best times are about 60–90 min before iftar (eat right after) or 1–2 h after iftar. Drink plenty of water between iftar and suhoor, keep protein at both meals, and cut volume by about a third rather than skipping training entirely.'],
      ].map(([t, d]) => h('details', { class: 'special' }, h('summary', {}, t), h('p', {}, d)))),
    h('article', { class: 'card' },
      h('h2', {}, 'Research & guidelines this app is based on'),
      h('p', { class: 'muted small' }, 'Tap to look up the paper on PubMed (US National Library of Medicine). This opens your browser and is the only time the Gym section uses the internet.'),
      h('ol', { class: 'refs' }, ...REFERENCES.map((r) => h('li', {},
        h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title),
        h('span', { class: 'muted small block' }, `${r.short} · ${r.where}`),
        h('span', { class: 'small block' }, r.note))))),
    h('p', { class: 'muted small' }, 'This is general education for healthy adults, not a diagnosis or personal medical advice. If you have a health condition or injury, follow your doctor’s or physiotherapist’s guidance.'),
  ];
}

// ---------- entry ----------
export function viewGym(c) {
  ctx = c;
  const tabs = [['workout', 'Workout'], ['library', 'Exercises'], ['progress', 'Progress'], ['safety', 'Safety']];
  const active = sub === 'detail' ? detailFrom : sub;
  const seg = h('div', { class: 'chips seg', role: 'tablist' }, ...tabs.map(([k, l]) => h('button', {
    class: `chip${k === active ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === active), onclick: () => { sub = k; ctx.render(); },
  }, l)));
  const body = sub === 'detail' ? viewDetail() : sub === 'library' ? viewLibrary() : sub === 'progress' ? viewProgress() : sub === 'safety' ? viewSafety() : viewWorkout();
  return h('section', { class: 'gym' }, seg, ...body);
}

export function resetGymView() { pdayIndex = null; }
