// Adaptive coach: learns how you actually train from your own logs and adapts the plan.
// Pure functions (no screen code), so every rule is easy to test. Runs on the phone only.
import { EX_BY_ID, PROGRAMS, exName, dayName, programName } from './exercises.js';
import { t, fmt, sep } from './i18n.js';
import { dayKey, addDays, parseDay } from './stats.js';

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

/** Planned exercises for a program day id like "fb3:0" → [[exId, sets, reps], ...]. */
export function planned(pday) {
  const [prog, i] = String(pday || '').split(':');
  return PROGRAMS[prog]?.days[+i]?.[1] || [];
}

/**
 * Group logged sets into sessions (one per day + program day), oldest first. `adapt` makes a
 * swapped exercise count for the one it replaced, and leaves removed ones out of the plan.
 */
export function sessionsFromLog(log, adapt = {}) {
  const back = Object.fromEntries(Object.entries(adapt.swaps || {}).map(([from, to]) => [to, from]));
  const map = new Map();
  for (const s of log) {
    if (!s.pday) continue;
    const k = `${s.day}|${s.pday}`;
    if (!map.has(k)) map.set(k, { day: s.day, pday: s.pday, sets: [], start: s.ts, end: s.ts });
    const x = map.get(k);
    x.sets.push(s);
    x.start = Math.min(x.start, s.ts); x.end = Math.max(x.end, s.ts);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start).map((x) => {
    const plan = planned(x.pday).filter(([id]) => !(adapt.removed || []).includes(id));
    const count = {};
    for (const s of x.sets) { const id = back[s.ex] || s.ex; count[id] = (count[id] || 0) + 1; }
    const plannedSets = plan.reduce((t, [, n]) => t + n, 0);
    const doneSets = plan.reduce((t, [id, n]) => t + Math.min(n, count[id] || 0), 0);
    // Exercises with no sets, split into "skipped" (something later in the plan was done)
    // and "ran out" (nothing after it was done: the session ended early).
    let lastDone = -1;
    plan.forEach(([id], i) => { if (count[id]) lastDone = i; });
    const skipped = []; const ranOut = [];
    plan.forEach(([id], i) => { if (!count[id]) (i < lastDone ? skipped : ranOut).push(id); });
    return { ...x, count, plannedSets, doneSets, completion: plannedSets ? doneSets / plannedSets : 1, skipped, ranOut, minutes: (x.end - x.start) / 60000 };
  });
}

/** Everything the coach knows about your training, from the log (+ optional ratings). */
export function analyze(gym, today = dayKey()) {
  const program = gym.program;
  const all = sessionsFromLog(gym.log || [], gym.adapt || {});
  const mine = all.filter((s) => s.pday.startsWith(`${program}:`));
  const recent = mine.slice(-6);
  const last3 = mine.slice(-3);
  const completionAvg = last3.length ? last3.reduce((t, s) => t + s.completion, 0) / last3.length : null;

  // Minutes per set (including rest), from gaps between consecutive sets
  const gaps = [];
  for (const s of all.slice(-10)) {
    const ts = s.sets.map((x) => x.ts).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) { const g = (ts[i] - ts[i - 1]) / 60000; if (g > 0.5 && g < 8) gaps.push(g); }
  }
  const setMinutes = Math.min(5, Math.max(1.2, median(gaps) ?? 2.5));
  // How long you actually train: sessions with ≥ 4 sets
  const lengths = all.slice(-6).filter((s) => s.sets.length >= 4).map((s) => s.minutes + setMinutes);
  const typicalMinutes = median(lengths);

  // Per exercise: how often it was skipped (not just "ran out of time")
  const skip = {};
  for (const s of recent) {
    for (const [id] of planned(s.pday).filter(([x]) => !(gym.adapt?.removed || []).includes(x))) {
      skip[id] ??= { planned: 0, skipped: 0, ranOut: 0 };
      skip[id].planned++;
      if (s.skipped.includes(id)) skip[id].skipped++;
      if (s.ranOut.includes(id)) skip[id].ranOut++;
    }
  }

  // Training days per week over the last 3 weeks
  const since = addDays(today, -20);
  const days = new Set(all.filter((s) => s.day >= since && s.sets.length >= 3).map((s) => s.day));
  const weeksOfData = all.length ? Math.min(3, Math.max(1, Math.ceil((daysBetween(all[0].day, today) + 1) / 7))) : 0;
  const perWeek = weeksOfData ? days.size / weeksOfData : null;
  const lastDay = all.length ? all[all.length - 1].day : null;
  const daysSinceLast = lastDay ? daysBetween(lastDay, today) : null;
  const ratings = (gym.sessions || []).filter((r) => r.rating).slice(-3).map((r) => r.rating);

  return { sessions: mine, all, recent, completionAvg, setMinutes, typicalMinutes, skip, perWeek, weeksOfData, daysSinceLast, lastSession: mine[mine.length - 1] || null, ratings };
}

const isCompound = (id) => EX_BY_ID[id]?.kind === 'compound';

/** Rough minutes for an exercise: sets × minutes per set (compounds rest longer) + 1 min to set up. */
export function exerciseMinutes(id, sets, setMinutes = 2.5) {
  return sets * setMinutes * (isCompound(id) ? 1.2 : 0.8) + 1;
}

/** Which program day to do next. An unfinished last session (< 50%) is repeated. */
export function nextDay(gym, prog, a, today = dayKey()) {
  const last = a.lastSession;
  if (!last) return { idx: 0, reason: null };
  const i = +last.pday.split(':')[1];
  if (last.day === today) return { idx: i, reason: null };
  if (gym.adapt?.on !== false && gym.adapt?.repeat !== false && last.completion < 0.5 && last.sets.length) {
    return { idx: i, reason: t('coach.repeat', { pct: fmt(last.completion * 100), day: dayName(prog.days[i][0]) }) };
  }
  return { idx: (i + 1) % prog.days.length, reason: null };
}

/**
 * Today's plan, adapted to you. Returns the exercises plus a list of changes (each explained,
 * each can be undone in the app).
 */
export function adaptPlan(gym, idx, a) {
  const prog = PROGRAMS[gym.program];
  const base = prog.days[idx][1].map(([id, sets, reps]) => ({ id, sets, reps, from: id, notes: [] }));
  const ad = gym.adapt || {};
  const changes = [];
  if (ad.on === false) return { items: base, changes, minutes: Math.round(base.reduce((t, x) => t + exerciseMinutes(x.id, x.sets, a.setMinutes), 0)), budget: null, welcomeBack: false };

  let items = base.map((x) => ({ ...x, notes: [] }));
  // 1. Your swaps and removals
  for (const it of items) {
    const to = ad.swaps?.[it.id];
    if (to && EX_BY_ID[to]) { it.notes.push(t('coach.insteadOf', { name: exName(it.id) })); it.id = to; }
  }
  const removed = items.filter((x) => ad.removed?.includes(x.from));
  if (removed.length) {
    items = items.filter((x) => !ad.removed.includes(x.from));
    changes.push({ key: 'removed', text: t('coach.leftOut', { list: removed.map((x) => exName(x.from)).join(sep()) }) });
  }
  // 2. Back after a break: one set fewer per exercise, lighter weights
  const welcomeBack = a.daysSinceLast !== null && a.daysSinceLast >= 10;
  if (welcomeBack && !ad.ignore?.welcome) {
    for (const it of items) if (it.sets > 2) { it.sets -= 1; it.notes.push(t('coach.note.break')); }
    changes.push({ key: 'welcome', text: t('coach.welcome', { n: fmt(a.daysSinceLast) }) });
  }
  // 3. How sessions felt
  const r = a.ratings;
  if (r.length >= 2 && r.slice(-2).every((x) => x === 'too-much') && !ad.ignore?.tooMuch) {
    for (const it of items) if (!isCompound(it.id) && it.sets > 1) { it.sets -= 1; it.notes.push(t('coach.note.tooMuch')); }
    changes.push({ key: 'tooMuch', text: t('coach.tooMuch') });
  } else if (r.length >= 2 && r.slice(-2).every((x) => x === 'easy') && (a.completionAvg ?? 0) >= 0.9 && !ad.ignore?.easy) {
    changes.push({ key: 'easy', text: t('coach.easy') });
  }
  // 4. Fit the time you actually have
  const budget = ad.minutes || (a.completionAvg !== null && a.completionAvg < 0.75 && a.sessions.length >= 3 && a.typicalMinutes ? Math.max(20, Math.round(a.typicalMinutes / 5) * 5) : null);
  const total = () => items.reduce((t, x) => t + exerciseMinutes(x.id, x.sets, a.setMinutes), 0);
  const before = Math.round(total());
  if (budget && total() > budget && !ad.ignore?.time) {
    // Big lifts first, so the most valuable work happens even if you stop early
    items.sort((x, y) => isCompound(y.id) - isCompound(x.id));
    const trimmed = [];
    const step = () => {
      const iso = items.filter((x) => !isCompound(x.id));
      const big = items.filter((x) => isCompound(x.id));
      const reduce = (x, min, why) => { if (x && x.sets > min) { x.sets -= 1; x.notes.push(why); return true; } return false; };
      for (const x of iso) if (reduce(x, 2, t('coach.note.time'))) return true;
      if (iso.length && items.length > 3) { const drop = iso[iso.length - 1]; items = items.filter((y) => y !== drop); trimmed.push(drop); return true; }
      for (const x of [...big].reverse()) if (reduce(x, 2, t('coach.note.time'))) return true;
      return false;
    };
    let guard = 30;
    while (total() > budget && guard-- > 0 && step());
    const why = ad.minutes ? t('coach.why.set', { n: fmt(ad.minutes) }) : t('coach.why.usual', { n: fmt(budget), pct: fmt(a.completionAvg * 100) });
    const now = Math.round(total());
    changes.push({ key: 'time', text: t('coach.shortened', { now: fmt(now), why, left: trimmed.length ? t('coach.leftOutShort', { list: trimmed.map((x) => exName(x.id)).join(sep()) }) : '', before: fmt(before), over: now > budget + 2 ? t('coach.overNote') : '' }) });
  }
  return { items, changes, minutes: Math.round(total()), budget, welcomeBack: welcomeBack && !ad.ignore?.welcome };
}

/** Suggestions you can accept or dismiss (they never change anything on their own). */
export function suggestions(gym, a) {
  const out = [];
  const ad = gym.adapt || {};
  if (ad.on === false) return out;
  const prog = PROGRAMS[gym.program];
  // Exercises you keep skipping (while doing ones after them)
  for (const [id, s] of Object.entries(a.skip)) {
    if (s.planned >= 3 && s.skipped / s.planned >= 0.6 && !ad.removed?.includes(id) && !ad.swaps?.[id] && !ad.dismissed?.includes(`skip:${id}`)) {
      const inPlan = new Set(prog.days.flatMap(([, l]) => l.map(([x]) => x)));
      const alt = (EX_BY_ID[id].alts || []).find((x) => !inPlan.has(x)) || EX_BY_ID[id].alts?.[0];
      out.push({ key: `skip:${id}`, type: 'skip', id, alt, text: t('coach.skipped', { name: exName(id), n: fmt(s.skipped), of: fmt(s.planned) }) });
    }
  }
  // Program asks for more days than you train
  const want = prog.days.length;
  if (a.perWeek !== null && a.weeksOfData >= 3 && gym.program !== 'fb3' && a.perWeek + 0.75 < Math.min(want, gym.program === 'ppl' ? 3 : want) && !ad.dismissed?.includes('freq')) {
    out.push({ key: 'freq', type: 'program', to: 'fb3', text: t('coach.freq', { n: fmt(a.perWeek, 1), prog: programName(gym.program).split(' · ')[0], want: gym.program === 'ppl' ? '3–6' : fmt(want) }) });
  }
  return out;
}

/** Tip for one exercise: progression, deload after repeated misses, or lighter after a break. */
export function loadTip(ex, reps, history, { welcomeBack = false, lb = false } = {}) {
  const prior = history; // sessions for this exercise, newest first, excluding today
  if (!prior.length) return t('tip.first');
  if (welcomeBack) return t('tip.back');
  const m = String(reps).match(/(\d+)\s*[–-]\s*(\d+)/);
  const range = m ? [+m[1], +m[2]] : null;
  const top = (s) => { const w = Math.max(...s.sets.map((x) => x.kg)); return s.sets.filter((x) => x.kg === w); };
  if (range && prior.length >= 2 && prior.slice(0, 2).every((s) => top(s).some((x) => x.reps < range[0]))) {
    return t('tip.deload', { n: fmt(range[0]) });
  }
  const last = top(prior[0]);
  if (range && last[0]?.kg > 0 && last.every((x) => x.reps >= range[1])) {
    const big = ex.kind === 'compound' && ['Legs', 'Back'].includes(ex.group);
    const inc = big ? (lb ? `5–10 ${t('unit.lb')}` : `2.5–5 ${t('unit.kg')}`) : (lb ? `2.5–5 ${t('unit.lb')}` : `1–2.5 ${t('unit.kg')}`);
    return t('tip.add', { n: fmt(range[1]), inc });
  }
  if (range && last.some((x) => x.reps < range[0])) return t('tip.below');
  return t('tip.same');
}
