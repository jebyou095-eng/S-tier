// 2D anatomical muscle maps (front and back), drawn as SVG. Tap a muscle to select it.
// Shapes are defined for the figure's right side (viewer's left) and mirrored.
const NS = 'http://www.w3.org/2000/svg';

const SILHOUETTE = [
  ['ellipse', { cx: 100, cy: 32, rx: 17, ry: 21 }, true],
  ['path', { d: 'M90,50 L110,50 L112,66 L88,66 Z' }, true],
  ['path', { d: 'M70,66 Q100,60 130,66 Q143,72 141,92 L135,150 Q135,178 129,198 L71,198 Q65,178 65,150 L59,92 Q57,72 70,66 Z' }, true],
  ['path', { d: 'M62,70 Q47,76 45,100 L43,140 Q45,151 54,151 L63,140 Q67,110 66,88 Z' }],
  ['path', { d: 'M43,146 Q37,172 39,200 Q43,209 50,207 Q56,180 58,148 Z' }],
  ['ellipse', { cx: 44, cy: 216, rx: 7, ry: 10 }],
  ['path', { d: 'M71,192 Q63,232 69,272 Q74,288 87,287 Q96,250 100,200 Z' }],
  ['path', { d: 'M70,288 Q63,322 71,362 L84,364 Q91,322 88,289 Z' }],
  ['ellipse', { cx: 78, cy: 372, rx: 11, ry: 6 }],
];

const FRONT = {
  traps: ['M89,58 Q80,64 72,69 L90,67 Z'],
  'side-delts': ['M68,67 Q51,70 47,90 Q50,98 56,95 Q58,79 70,71 Z'],
  'front-delts': ['M71,70 Q60,76 57,95 Q63,100 70,97 Q74,84 77,73 Z'],
  chest: ['M98,73 Q84,69 74,76 Q67,93 74,109 Q88,117 98,111 Z'],
  biceps: ['M60,101 Q50,105 49,124 Q51,140 57,143 Q64,126 64,104 Z'],
  forearms: ['M45,151 Q39,172 41,197 L49,199 Q55,175 56,153 Z'],
  abs: ['M88,116 h10 v15 h-10 Z', 'M88,134 h10 v15 h-10 Z', 'M88,152 h10 v15 h-10 Z', 'M89,170 h9 v20 h-9 Z'],
  obliques: ['M85,114 Q73,121 71,150 Q73,173 85,186 Z'],
  quads: ['M74,201 Q65,234 71,267 Q77,279 87,278 Q94,247 95,207 Z'],
  adductors: ['M99,201 Q91,213 92,242 L99,238 Z'],
  calves: ['M71,296 Q66,322 73,348 L79,347 Q81,318 78,296 Z'],
};

const BACK = {
  traps: ['M100,52 L75,69 L100,82 Z'],
  'upper-back': ['M100,82 L77,72 Q78,90 85,102 L100,112 Z'],
  'side-delts': ['M68,67 Q51,70 47,90 Q50,98 56,95 Q58,79 70,71 Z'],
  'rear-delts': ['M71,70 Q60,76 57,95 Q63,100 70,97 Q74,84 77,73 Z'],
  lats: ['M83,100 Q68,107 69,131 Q77,160 95,172 L97,150 Q90,120 88,106 Z'],
  'lower-back': ['M93,150 L99,150 L99,192 L87,192 Q86,170 93,150 Z'],
  triceps: ['M60,101 Q50,105 49,124 Q51,140 57,143 Q64,126 64,104 Z'],
  forearms: ['M45,151 Q39,172 41,197 L49,199 Q55,175 56,153 Z'],
  glutes: ['M99,194 Q80,189 71,201 Q69,224 84,230 Q96,230 99,219 Z'],
  hamstrings: ['M73,234 Q67,257 73,277 L86,279 Q94,257 95,234 Z'],
  adductors: ['M99,233 L93,237 Q92,251 96,263 L99,259 Z'],
  calves: ['M70,291 Q63,313 71,337 Q79,342 84,335 Q89,311 86,291 Z'],
};

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function figure(shapes, { primary, secondary, selected, onPick, label }) {
  const svg = el('svg', { viewBox: '0 0 200 390', class: 'body-map', role: 'group', 'aria-label': label });
  const base = el('g', { class: 'silhouette' });
  for (const [tag, attrs, center] of SILHOUETTE) {
    base.append(el(tag, attrs));
    if (!center) base.append(el(tag, { ...attrs, transform: 'translate(200,0) scale(-1,1)' }));
  }
  svg.append(base);
  for (const [muscle, paths] of Object.entries(shapes)) {
    const g = el('g', {
      class: `muscle${primary.includes(muscle) ? ' primary' : secondary.includes(muscle) ? ' secondary' : ''}${selected === muscle ? ' selected' : ''}`,
      'data-muscle': muscle,
    });
    for (const d of paths) {
      g.append(el('path', { d }));
      g.append(el('path', { d, transform: 'translate(200,0) scale(-1,1)' }));
    }
    if (onPick) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.addEventListener('click', () => onPick(muscle));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(muscle); } });
    }
    const t = el('title', {});
    t.textContent = muscle;
    g.append(t);
    svg.append(g);
  }
  const cap = el('text', { x: 100, y: 388, 'text-anchor': 'middle', class: 'map-label' });
  cap.textContent = label;
  svg.append(cap);
  return svg;
}

/** Front + back maps side by side. primary/secondary: muscle ids to highlight. */
export function bodyMaps({ primary = [], secondary = [], selected = null, onPick = null, names = {} } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'body-maps';
  const opts = { primary, secondary, selected, onPick };
  wrap.append(figure(FRONT, { ...opts, label: 'Front' }), figure(BACK, { ...opts, label: 'Back' }));
  // Friendlier tooltips
  wrap.querySelectorAll('[data-muscle] title').forEach((t) => { t.textContent = names[t.parentNode.dataset.muscle] || t.textContent; });
  return wrap;
}
