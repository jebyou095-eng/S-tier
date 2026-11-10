// Animated 2D demonstrations: a simple figure moves between the start and end
// position of each exercise. Angles are degrees from straight up, clockwise
// (90 = forward, 180 = down, -90 = backward). The figure faces right.
const NS = 'http://www.w3.org/2000/svg';
const L = { shin: 40, thigh: 42, torso: 52, neck: 10, head: 9, ua: 28, fa: 26, foot: 13 };
const W = 220; const H = 190; const GROUND = 182; const TOP = -30;

const ST = { shin: 0, thigh: 0, torso: 0, ua: 180, fa: 180, foot: 90 };
const pose = (o) => ({ ...ST, ...o });

/* eslint-disable object-curly-newline */
export const PATTERNS = {
  squat: { anchor: 'ankle', at: [120, GROUND], props: ['barBack'], a: pose({ ua: 205, fa: 25 }), b: pose({ shin: 35, thigh: -70, torso: 45, ua: 235, fa: 55 }) },
  goblet: { anchor: 'ankle', at: [120, GROUND], props: ['db'], a: pose({ ua: 165, fa: 15 }), b: pose({ shin: 35, thigh: -72, torso: 28, ua: 160, fa: 30 }) },
  legpress: { anchor: 'hip', at: [112, 150], props: ['seatRecline', 'platform'], a: pose({ torso: -62, shin: 225, thigh: 230, foot: 320, ua: 160, fa: 120 }), b: pose({ torso: -62, shin: 290, thigh: 185, foot: 345, ua: 160, fa: 120 }) },
  lunge: { anchor: 'ankle', at: [140, GROUND], props: ['db'], a: pose({ thigh2: 180, shin2: 180, foot2: 90 }), b: pose({ shin: 15, thigh: -75, torso: 8, thigh2: 192, shin2: 258, foot2: 115 }) },
  hinge: { anchor: 'ankle', at: [120, GROUND], props: ['bar'], a: pose({}), b: pose({ shin: 8, thigh: -35, torso: 70, ua: 200, fa: 190 }) },
  deadlift: { anchor: 'ankle', at: [110, GROUND], props: ['bar'], a: pose({ shin: 30, thigh: -65, torso: 75, ua: 195, fa: 195 }), b: pose({}) },
  thrust: { anchor: 'ankle', at: [170, GROUND], props: ['benchThrust', 'barHip'], a: pose({ shin: -30, thigh: 237, torso: -51, ua: 200, fa: 120 }), b: pose({ shin: 0, thigh: 270, torso: -84, ua: 200, fa: 120 }) },
  legext: { anchor: 'hip', at: [80, 120], props: ['seat', 'pad'], a: pose({ torso: -8, thigh: -90, shin: 0, foot: 100, ua: 175, fa: 150 }), b: pose({ torso: -8, thigh: -90, shin: -90, foot: 0, ua: 175, fa: 150 }) },
  legcurl: { anchor: 'hip', at: [80, 120], props: ['seat', 'pad'], a: pose({ torso: 10, thigh: -90, shin: -85, foot: 5, ua: 160, fa: 120 }), b: pose({ torso: 10, thigh: -90, shin: 25, foot: 115, ua: 160, fa: 120 }) },
  calf: { anchor: 'toe', at: [125, GROUND - 10], props: ['step', 'db'], a: pose({ foot: 75 }), b: pose({ foot: 125 }) },
  bench: { anchor: 'hip', at: [130, 132], props: ['bench', 'bar'], a: pose({ torso: -90, thigh: -90, shin: 0, ua: 0, fa: 0 }), b: pose({ torso: -90, thigh: -90, shin: 0, ua: 140, fa: 0 }) },
  incline: { anchor: 'hip', at: [130, 132], props: ['benchIncline', 'db'], a: pose({ torso: -55, thigh: -90, shin: 0, ua: 15, fa: 15 }), b: pose({ torso: -55, thigh: -90, shin: 0, ua: 150, fa: 10 }) },
  fly: { anchor: 'hip', at: [130, 132], props: ['bench', 'db'], a: pose({ torso: -90, thigh: -90, shin: 0, ua: 0, fa: 0 }), b: pose({ torso: -90, thigh: -90, shin: 0, ua: 165, fa: 150 }) },
  pushup: { anchor: 'toe', at: [30, GROUND], props: [], a: pose({ foot: 160, shin: 66, thigh: 66, torso: 66, ua: 180, fa: 180 }), b: pose({ foot: 170, shin: 80, thigh: 80, torso: 80, ua: 270, fa: 142 }) },
  dip: { anchor: 'hand', at: [120, 80], props: ['dipbar'], a: pose({ torso: 8, thigh: -10, shin: 60, ua: 180, fa: 180 }), b: pose({ torso: 25, thigh: 0, shin: 70, ua: 255, fa: 160 }) },
  pullup: { anchor: 'hand', at: [120, -18], props: ['pullbar'], a: pose({ ua: 5, fa: 0, shin: 55, thigh: -8 }), b: pose({ ua: 200, fa: 12, torso: -8, shin: 60, thigh: -12 }) },
  pulldown: { anchor: 'hip', at: [100, 140], props: ['seat', 'cableUp'], a: pose({ torso: -8, thigh: -90, shin: 0, ua: 8, fa: 5 }), b: pose({ torso: -15, thigh: -90, shin: 0, ua: 200, fa: 18 }) },
  row: { anchor: 'ankle', at: [120, GROUND], props: ['bar'], a: pose({ shin: 10, thigh: -25, torso: 65 }), b: pose({ shin: 10, thigh: -25, torso: 65, ua: 240, fa: 180 }) },
  cablerow: { anchor: 'hip', at: [60, GROUND - 6], props: ['cableFwd', 'floorSeat'], a: pose({ torso: 18, thigh: 265, shin: 300, foot: 0, ua: 95, fa: 95 }), b: pose({ torso: -5, thigh: 265, shin: 300, foot: 0, ua: 225, fa: 95 }) },
  facepull: { anchor: 'ankle', at: [90, GROUND], props: ['cableFace'], a: pose({ torso: -5, ua: 80, fa: 80 }), b: pose({ torso: -5, ua: 265, fa: 5 }) },
  shrug: { anchor: 'ankle', at: [110, GROUND], props: ['db'], a: pose({}), b: pose({ lift: 7 }) },
  press: { anchor: 'ankle', at: [110, GROUND], props: ['bar'], a: pose({ ua: 165, fa: 5 }), b: pose({ ua: 2, fa: 0 }) },
  curl: { anchor: 'ankle', at: [110, GROUND], props: ['db'], a: pose({}), b: pose({ ua: 172, fa: 25 }) },
  pushdown: { anchor: 'ankle', at: [100, GROUND], props: ['cablePush'], a: pose({ torso: 10, ua: 182, fa: 60 }), b: pose({ torso: 10, ua: 182, fa: 180 }) },
  ohext: { anchor: 'ankle', at: [110, GROUND], props: ['db'], a: pose({ ua: 12, fa: 195 }), b: pose({ ua: 8, fa: 8 }) },
  plank: { anchor: 'toe', at: [30, GROUND], props: [], a: pose({ foot: 160, shin: 78, thigh: 78, torso: 78, ua: 180, fa: 90 }), b: pose({ foot: 160, shin: 77, thigh: 77, torso: 77, ua: 180, fa: 90 }) },
  kneeraise: { anchor: 'hand', at: [120, -18], props: ['pullbar'], a: pose({ ua: 2, fa: 0 }), b: pose({ ua: 5, fa: 0, torso: -8, thigh: -95, shin: 5 }) },
  carry: { anchor: 'hip', at: [110, 100], props: ['db'], a: pose({ shin: -18, thigh: -12, thigh2: 196, shin2: 192, foot2: 90 }), b: pose({ shin: 14, thigh: 12, thigh2: 166, shin2: 172, foot2: 90 }) },
  lateral: { front: true, a: { arm: 8 }, b: { arm: 86 } },
};

const rad = (a) => (a * Math.PI) / 180;
const step = ([x, y], len, a) => [x + len * Math.sin(rad(a)), y - len * Math.cos(rad(a))];

function joints(p) {
  const j = {};
  j.ankle = [0, 0];
  j.toe = step(j.ankle, L.foot, p.foot);
  j.knee = step(j.ankle, L.shin, p.shin);
  j.hip = step(j.knee, L.thigh, p.thigh);
  j.shoulder = step(j.hip, L.torso - (p.lift || 0), p.torso);
  const neckBase = step(j.hip, L.torso, p.torso);
  j.head = step(neckBase, L.neck + L.head, p.torso);
  j.elbow = step(j.shoulder, L.ua, p.ua);
  j.hand = step(j.elbow, L.fa, p.fa);
  if (p.thigh2 !== undefined) {
    j.knee2 = step(j.hip, L.thigh, p.thigh2);
    j.ankle2 = step(j.knee2, L.shin, p.shin2);
    j.toe2 = step(j.ankle2, L.foot, p.foot2 ?? 90);
  }
  return j;
}

function place(pat, p) {
  const j = joints(p);
  const [ax, ay] = j[pat.anchor];
  const dx = pat.at[0] - ax; const dy = pat.at[1] - ay;
  for (const k of Object.keys(j)) j[k] = [j[k][0] + dx, j[k][1] + dy];
  return j;
}

function lerp(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? b[k]; const y = b[k] ?? a[k];
    out[k] = x + (y - x) * t;
  }
  return out;
}

const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

const line = (g, a, b, cls) => g.append(svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls }));

function drawProps(g, pat, j) {
  for (const pr of pat.props || []) {
    const [hx, hy] = j.hand;
    if (pr === 'bar') g.append(svgEl('circle', { cx: hx, cy: hy, r: 9, class: 'plate' }));
    if (pr === 'db') g.append(svgEl('rect', { x: hx - 7, y: hy - 4, width: 14, height: 8, rx: 2, class: 'plate' }));
    if (pr === 'barBack') g.append(svgEl('circle', { cx: j.shoulder[0] - 5, cy: j.shoulder[1] + 2, r: 9, class: 'plate' }));
    if (pr === 'barHip') g.append(svgEl('circle', { cx: j.hip[0], cy: j.hip[1] - 9, r: 9, class: 'plate' }));
    if (pr === 'bench') g.append(svgEl('rect', { x: 40, y: 138, width: 100, height: 7, rx: 3, class: 'prop' }), svgEl('rect', { x: 50, y: 145, width: 5, height: 37, class: 'prop' }), svgEl('rect', { x: 125, y: 145, width: 5, height: 37, class: 'prop' }));
    if (pr === 'benchIncline') g.append(svgEl('path', { d: 'M136,140 L84,104 L78,112 L128,146 Z', class: 'prop' }), svgEl('rect', { x: 110, y: 140, width: 5, height: 42, class: 'prop' }));
    if (pr === 'benchThrust') g.append(svgEl('rect', { x: 30, y: 138, width: 48, height: 44, rx: 3, class: 'prop' }));
    if (pr === 'seat') g.append(svgEl('rect', { x: j.hip[0] - 22, y: j.hip[1] + 6, width: 50, height: 7, rx: 3, class: 'prop' }), svgEl('rect', { x: j.hip[0] - 4, y: j.hip[1] + 13, width: 6, height: GROUND - j.hip[1] - 13, class: 'prop' }));
    if (pr === 'seatRecline') g.append(svgEl('path', { d: `M${j.hip[0] - 50},${j.hip[1] - 36} L${j.hip[0] + 4},${j.hip[1] + 8} L${j.hip[0] - 2},${j.hip[1] + 16} L${j.hip[0] - 56},${j.hip[1] - 28} Z`, class: 'prop' }));
    if (pr === 'platform') {
      const [x, y] = j.ankle; const d = [Math.cos(rad(40)), Math.sin(rad(40))];
      g.append(svgEl('line', { x1: x - 18 * d[0] + 3, y1: y - 18 * d[1] - 3, x2: x + 22 * d[0] + 3, y2: y + 22 * d[1] - 3, class: 'prop-line' }));
    }
    if (pr === 'pad') g.append(svgEl('circle', { cx: j.ankle[0] + 4, cy: j.ankle[1] - 2, r: 5, class: 'prop' }));
    if (pr === 'step') g.append(svgEl('rect', { x: 95, y: GROUND - 10, width: 40, height: 10, class: 'prop' }));
    if (pr === 'pullbar') g.append(svgEl('line', { x1: 60, y1: -18, x2: 180, y2: -18, class: 'prop-line' }));
    if (pr === 'dipbar') g.append(svgEl('line', { x1: 90, y1: 82, x2: 160, y2: 82, class: 'prop-line' }), svgEl('line', { x1: 150, y1: 82, x2: 150, y2: GROUND, class: 'prop-line thin' }));
    if (pr === 'cableUp') g.append(svgEl('line', { x1: hx, y1: hy, x2: j.hip[0] + 8, y2: -26, class: 'cable' }));
    if (pr === 'cableFwd') g.append(svgEl('line', { x1: hx, y1: hy, x2: W - 6, y2: GROUND - 12, class: 'cable' }));
    if (pr === 'cableFace') g.append(svgEl('line', { x1: hx, y1: hy, x2: W - 6, y2: j.head[1] + 4, class: 'cable' }));
    if (pr === 'cablePush') g.append(svgEl('line', { x1: hx, y1: hy, x2: j.shoulder[0] + 30, y2: 6, class: 'cable' }));
    if (pr === 'floorSeat') { /* sitting on the floor */ }
  }
}

function drawSide(g, pat, p) {
  const j = place(pat, p);
  g.replaceChildren();
  if (j.knee2) { line(g, j.hip, j.knee2, 'limb far'); line(g, j.knee2, j.ankle2, 'limb far'); line(g, j.ankle2, j.toe2, 'limb far'); }
  drawProps(g, pat, j);
  line(g, j.ankle, j.toe, 'limb');
  line(g, j.ankle, j.knee, 'limb');
  line(g, j.knee, j.hip, 'limb');
  line(g, j.hip, j.shoulder, 'limb torso');
  line(g, j.shoulder, j.elbow, 'limb');
  line(g, j.elbow, j.hand, 'limb');
  g.append(svgEl('circle', { cx: j.head[0], cy: j.head[1], r: L.head, class: 'head' }));
  for (const k of ['knee', 'hip', 'shoulder', 'elbow']) g.append(svgEl('circle', { cx: j[k][0], cy: j[k][1], r: 3.2, class: 'joint' }));
}

function drawFront(g, p) {
  g.replaceChildren();
  const cx = W / 2; const sy = 66; const hy = 120;
  line(g, [cx - 10, hy], [cx - 12, GROUND], 'limb');
  line(g, [cx + 10, hy], [cx + 12, GROUND], 'limb');
  g.append(svgEl('path', { d: `M${cx - 20},${sy} L${cx + 20},${sy} L${cx + 12},${hy} L${cx - 12},${hy} Z`, class: 'torso-fill' }));
  g.append(svgEl('circle', { cx, cy: sy - 20, r: L.head + 1, class: 'head' }));
  for (const s of [-1, 1]) {
    const sh = [cx + s * 20, sy + 2];
    const el = [sh[0] + s * L.ua * Math.sin(rad(p.arm)), sh[1] + L.ua * Math.cos(rad(p.arm))];
    const hd = [el[0] + s * L.fa * Math.sin(rad(p.arm + 6)), el[1] + L.fa * Math.cos(rad(p.arm + 6))];
    line(g, sh, el, 'limb'); line(g, el, hd, 'limb');
    g.append(svgEl('rect', { x: hd[0] - 5, y: hd[1] - 6, width: 10, height: 12, rx: 2, class: 'plate' }));
    g.append(svgEl('circle', { cx: el[0], cy: el[1], r: 3.2, class: 'joint' }));
  }
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Returns an <svg> that loops start → end → start. With reduced motion,
 * shows the start position solid and the end position faded.
 */
export function demo(patternId, label) {
  const pat = PATTERNS[patternId];
  const svg = svgEl('svg', { viewBox: `0 ${TOP} ${W} ${H - TOP}`, class: 'demo', role: 'img', 'aria-label': label });
  svg.append(svgEl('line', { x1: 0, y1: GROUND, x2: W, y2: GROUND, class: 'ground' }));
  if (!pat) return svg;
  const ghost = svgEl('g', { class: 'ghost' });
  const fig = svgEl('g', { class: 'figure' });
  svg.append(ghost, fig);
  const draw = (g, p) => (pat.front ? drawFront(g, p) : drawSide(g, pat, p));
  draw(ghost, pat.b);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { draw(fig, pat.a); return svg; }
  const T = [1400, 400, 1800, 500]; // up, hold, down, hold
  const total = T.reduce((a, b) => a + b, 0);
  const t0 = performance.now();
  const frame = (now) => {
    if (!svg.isConnected && now - t0 > 1000) return; // stop when removed from the page
    const t = (now - t0) % total;
    let k;
    if (t < T[0]) k = ease(t / T[0]);
    else if (t < T[0] + T[1]) k = 1;
    else if (t < T[0] + T[1] + T[2]) k = 1 - ease((t - T[0] - T[1]) / T[2]);
    else k = 0;
    draw(fig, lerp(pat.a, pat.b, k));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return svg;
}
