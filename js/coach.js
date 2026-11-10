// Adaptive coach: learns how you actually train from your own logs and adapts the plan.
// Pure functions (no screen code), so every rule is easy to test. Runs on the phone only.
import { EX_BY_ID, PROGRAMS } from './exercises.js';
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
    return { idx: i, reason: `You did ${Math.round(last.completion * 100)}% of ${prog.days[i][0]} last time, so it’s on again today.` };
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
    if (to && EX_BY_ID[to]) { it.notes.push(`instead of ${EX_BY_ID[it.id].name}`); it.id = to; }
  }
  const removed = items.filter((x) => ad.removed?.includes(x.from));
  if (removed.length) {
    items = items.filter((x) => !ad.removed.includes(x.from));
    changes.push({ key: 'removed', text: `Left out: ${removed.map((x) => EX_BY_ID[x.from].name).join(', ')} (you chose this).` });
  }
  // 2. Back after a break: one set fewer per exercise, lighter weights
  const welcomeBack = a.daysSinceLast !== null && a.daysSinceLast >= 10;
  if (welcomeBack && !ad.ignore?.welcome) {
    for (const it of items) if (it.sets > 2) { it.sets -= 1; it.notes.push('1 set fewer: back after a break'); }
    changes.push({ key: 'welcome', text: `Welcome back! ${a.daysSinceLast} days since your last workout, so today is lighter: one set fewer and about 15% less weight. You’ll be back to normal next time.` });
  }
  // 3. How sessions felt
  const r = a.ratings;
  if (r.length >= 2 && r.slice(-2).every((x) => x === 'too-much') && !ad.ignore?.tooMuch) {
    for (const it of items) if (!isCompound(it.id) && it.sets > 1) { it.sets -= 1; it.notes.push('1 set fewer: last sessions felt like too much'); }
    changes.push({ key: 'tooMuch', text: 'Your last two workouts felt like too much, so the extra (isolation) exercises have one set fewer. Recovery is where you grow.' });
  } else if (r.length >= 2 && r.slice(-2).every((x) => x === 'easy') && (a.completionAvg ?? 0) >= 0.9 && !ad.ignore?.easy) {
    changes.push({ key: 'easy', text: 'Your last workouts felt easy: go a bit heavier today (+2.5 kg on big lifts, +1 kg on small ones) or stop sets closer to failure.' });
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
      for (const x of iso) if (reduce(x, 2, 'shortened to fit your time')) return true;
      if (iso.length && items.length > 3) { const drop = iso[iso.length - 1]; items = items.filter((y) => y !== drop); trimmed.push(drop); return true; }
      for (const x of [...big].reverse()) if (reduce(x, 2, 'shortened to fit your time')) return true;
      return false;
    };
    let guard = 30;
    while (total() > budget && guard-- > 0 && step());
    const why = ad.minutes ? `you set ${ad.minutes} min` : `you usually train about ${budget} min and finished ${Math.round(a.completionAvg * 100)}% of your last 3 workouts`;
    const now = Math.round(total());
    changes.push({ key: 'time', text: `Shortened to about ${now} min (${why}): big lifts first${trimmed.length ? `, left out ${trimmed.map((x) => EX_BY_ID[x.id].name).join(', ')}` : ''}, extra sets trimmed. The full plan is about ${before} min.${now > budget + 2 ? ' Your main lifts are kept even if it runs a little over.' : ''}` });
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
      out.push({ key: `skip:${id}`, type: 'skip', id, alt, text: `You skipped ${EX_BY_ID[id].name} in ${s.skipped} of your last ${s.planned} workouts.` });
    }
  }
  // Program asks for more days than you train
  const want = prog.days.length;
  if (a.perWeek !== null && a.weeksOfData >= 3 && gym.program !== 'fb3' && a.perWeek + 0.75 < Math.min(want, gym.program === 'ppl' ? 3 : want) && !ad.dismissed?.includes('freq')) {
    out.push({ key: 'freq', type: 'program', to: 'fb3', text: `You’ve trained about ${a.perWeek.toFixed(1)} days a week lately, but ${prog.name.split(' · ')[0]} is built for ${gym.program === 'ppl' ? '3–6' : want}. Full body (2–3 days) would train every muscle twice a week on your schedule.` });
  }
  return out;
}

/** Tip for one exercise: progression, deload after repeated misses, or lighter after a break. */
export function loadTip(ex, reps, history, { welcomeBack = false, lb = false } = {}) {
  const prior = history; // sessions for this exercise, newest first, excluding today
  if (!prior.length) return 'First time: pick a weight you could lift for 2–3 more reps than the target. Focus on form.';
  if (welcomeBack) return 'Back after a break: use about 15% less weight than last time and focus on clean reps.';
  const m = String(reps).match(/(\d+)\s*[–-]\s*(\d+)/);
  const range = m ? [+m[1], +m[2]] : null;
  const top = (s) => { const w = Math.max(...s.sets.map((x) => x.kg)); return s.sets.filter((x) => x.kg === w); };
  if (range && prior.length >= 2 && prior.slice(0, 2).every((s) => top(s).some((x) => x.reps < range[0]))) {
    return `Two sessions in a row below ${range[0]} reps: drop the weight by about 10% today and build back up. That’s normal and gets you moving again.`;
  }
  const last = top(prior[0]);
  if (range && last[0]?.kg > 0 && last.every((x) => x.reps >= range[1])) {
    const inc = ex.kind === 'compound' && ['Legs', 'Back'].includes(ex.group) ? (lb ? '5–10 lb' : '2.5–5 kg') : (lb ? '2.5–5 lb' : '1–2.5 kg');
    return `You hit ${range[1]}+ reps on every set last time → add ${inc} today.`;
  }
  if (range && last.some((x) => x.reps < range[0])) return 'Last time fell below the rep range. Keep the same weight, or drop 5–10%, and own the form.';
  return 'Same weight as last time and try to beat it by 1 rep on at least one set.';
}
