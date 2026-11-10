// Tiny dependency-free SVG charts.
import { parseDay } from './stats.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k);
  return el;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const shortDate = (k) => parseDay(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Daily bar chart. `values` may contain nulls (no bar). */
export function barChart({ days, values, color, yMax, goal, label }) {
  const W = 320; const H = 150; const L = 30; const R = 6; const T = 10; const B = 22;
  const iw = W - L - R; const ih = H - T - B;
  const max = yMax ?? niceMax(Math.max(goal || 0, ...values.filter((v) => v !== null), 0));
  const n = values.length;
  const step = iw / n;
  const bw = Math.max(1, Math.min(18, step * 0.72));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });

  for (const f of [0, 0.5, 1]) {
    const y = T + ih - ih * f;
    svg.append(s('line', { x1: L, x2: W - R, y1: y, y2: y, class: f === 0 ? 'axis' : 'grid' }));
    svg.append(s('text', { x: L - 5, y: y + 3.5, class: 'tick', 'text-anchor': 'end' }, document.createTextNode(fmt.format(max * f))));
  }
  if (goal) {
    const y = T + ih - (goal / max) * ih;
    svg.append(s('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'goal' }));
  }
  values.forEach((v, i) => {
    if (v === null) return;
    const h = Math.max(1.5, (Math.min(v, max) / max) * ih);
    const x = L + i * step + (step - bw) / 2;
    const r = Math.min(3, bw / 2);
    const bar = s('rect', { x, y: T + ih - h, width: bw, height: h, rx: r, fill: color });
    bar.append(s('title', {}, document.createTextNode(`${shortDate(days[i])}: ${fmt.format(v)}`)));
    svg.append(bar);
  });
  const ticks = n <= 7 ? days.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  for (const i of ticks) {
    const x = L + i * step + step / 2;
    const text = n <= 7 ? parseDay(days[i]).toLocaleDateString(undefined, { weekday: 'narrow' }) : shortDate(days[i]);
    const anchor = n <= 7 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    svg.append(s('text', { x: n <= 7 ? x : i === 0 ? L : i === n - 1 ? W - R : x, y: H - 6, class: 'tick', 'text-anchor': anchor }, document.createTextNode(text)));
  }
  return svg;
}

/** Calendar grid (weeks as columns, Mon–Sun rows) for yes/no trackers. */
export function heatmap({ days, values, color, label }) {
  const pad = (parseDay(days[0]).getDay() + 6) % 7; // Monday-first offset
  const cells = [...Array(pad).fill(undefined), ...values];
  const weeks = Math.ceil(cells.length / 7);
  const gap = 3;
  const size = Math.min(16, Math.max(6, (320 - 20 - gap * weeks) / weeks));
  const W = 20 + weeks * (size + gap); const H = 7 * (size + gap);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart heat', role: 'img', 'aria-label': label });
  ['M', '', 'W', '', 'F', '', 'S'].forEach((t, r) => {
    if (t) svg.append(s('text', { x: 0, y: r * (size + gap) + size * 0.8, class: 'tick' }, document.createTextNode(t)));
  });
  cells.forEach((v, i) => {
    if (v === undefined) return;
    const c = Math.floor(i / 7); const r = i % 7;
    const rect = s('rect', {
      x: 20 + c * (size + gap), y: r * (size + gap), width: size, height: size, rx: Math.min(3, size / 4),
      fill: v ? color : null, class: v ? null : 'empty',
    });
    rect.append(s('title', {}, document.createTextNode(`${shortDate(days[i - pad])}: ${v ? 'done' : '—'}`)));
    svg.append(rect);
  });
  return svg;
}

/** Seven small bars, Monday first. */
export function weekdayChart({ values, color, yMax, label }) {
  const W = 320; const H = 90; const T = 6; const B = 18;
  const ih = H - T - B; const step = W / 7; const bw = step * 0.5;
  const max = yMax ?? niceMax(Math.max(...values.filter((v) => v !== null), 0));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  svg.append(s('line', { x1: 0, x2: W, y1: T + ih, y2: T + ih, class: 'axis' }));
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d, i) => {
    const v = values[i];
    const x = i * step + (step - bw) / 2;
    if (v !== null) {
      const h = Math.max(1.5, (v / max) * ih);
      const bar = s('rect', { x, y: T + ih - h, width: bw, height: h, rx: 3, fill: color });
      bar.append(s('title', {}, document.createTextNode(`${d}: ${fmt.format(v)}`)));
      svg.append(bar);
    }
    svg.append(s('text', { x: i * step + step / 2, y: H - 4, class: 'tick', 'text-anchor': 'middle' }, document.createTextNode(d)));
  });
  return svg;
}
