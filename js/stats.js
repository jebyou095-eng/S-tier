// Pure date and statistics helpers. No I/O.

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function parseDay(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseDay(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** n consecutive day keys ending at `end` (oldest first). */
export function dayRange(end, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export function entriesByDay(state, trackerId) {
  const map = new Map();
  for (const e of state.entries) {
    if (e.trackerId !== trackerId) continue;
    if (!map.has(e.day)) map.set(e.day, []);
    map.get(e.day).push(e);
  }
  return map;
}

/** One value per day for a tracker, or null if nothing was logged that day. */
export function dailyValue(tracker, entries) {
  if (!entries || !entries.length) return null;
  if (tracker.type === 'check') return 1;
  const vals = entries.map((e) => e.value);
  if (tracker.type === 'rating') return mean(vals);
  if (tracker.agg === 'avg') return mean(vals);
  if (tracker.agg === 'last') return [...entries].sort((a, b) => a.ts - b.ts).at(-1).value;
  return vals.reduce((a, b) => a + b, 0);
}

export function series(state, tracker, days) {
  const map = entriesByDay(state, tracker.id);
  return days.map((d) => dailyValue(tracker, map.get(d)));
}

export function mean(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}

/** Current and best streak of consecutive logged days. Today counts if logged, but an unlogged today doesn't break the streak. */
export function streaks(state, tracker, today) {
  const days = new Set(state.entries.filter((e) => e.trackerId === tracker.id).map((e) => e.day));
  let current = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) { current++; d = addDays(d, -1); }
  let best = 0;
  for (const day of days) {
    if (days.has(addDays(day, -1))) continue; // not a run start
    let len = 0; let x = day;
    while (days.has(x)) { len++; x = addDays(x, 1); }
    best = Math.max(best, len);
  }
  return { current, best };
}

export function summarize(tracker, values) {
  const logged = values.filter((v) => v !== null);
  const n = logged.length;
  const out = { n, days: values.length, rate: values.length ? n / values.length : 0 };
  if (!n) return out;
  out.mean = mean(logged);
  out.min = Math.min(...logged);
  out.max = Math.max(...logged);
  out.total = logged.reduce((a, b) => a + b, 0);
  // Trend: compare the average of the newer half of the range with the older half.
  const half = Math.floor(values.length / 2);
  const older = values.slice(0, half).filter((v) => v !== null);
  const newer = values.slice(half).filter((v) => v !== null);
  if (older.length >= 2 && newer.length >= 2) {
    const a = mean(older); const b = mean(newer);
    out.trend = b - a;
    out.trendPct = a !== 0 ? (b - a) / Math.abs(a) : null;
  }
  return out;
}

/** Average value per weekday, Monday first. */
export function byWeekday(days, values) {
  const buckets = Array.from({ length: 7 }, () => []);
  days.forEach((d, i) => {
    if (values[i] === null) return;
    const wd = (parseDay(d).getDay() + 6) % 7;
    buckets[wd].push(values[i]);
  });
  return buckets.map((b) => (b.length ? mean(b) : null));
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs); const my = mean(ys);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx; const dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Pairwise relationships between trackers over the given days.
 * Check trackers count unlogged days as 0 (not done); other trackers use only days with a value.
 */
export function correlations(state, days, minDays = 7) {
  const cols = state.trackers.map((t) => {
    const s = series(state, t, days);
    return { t, s: t.type === 'check' ? s.map((v) => v ?? 0) : s };
  });
  const out = [];
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const xs = []; const ys = [];
      cols[i].s.forEach((v, k) => {
        const w = cols[j].s[k];
        if (v !== null && w !== null) { xs.push(v); ys.push(w); }
      });
      if (xs.length < minDays) continue;
      const r = pearson(xs, ys);
      if (r !== null && Math.abs(r) >= 0.3) out.push({ a: cols[i].t, b: cols[j].t, r, n: xs.length });
    }
  }
  return out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
}
