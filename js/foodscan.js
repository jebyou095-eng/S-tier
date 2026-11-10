// "Teach the app your food": an on-device visual memory of foods.
//
// A scan captures ~10 views as you move around the plate. Each view is turned into a
// visual fingerprint (a 1280-number embedding from a small MobileNetV2 network) right on
// the phone. When you link a scan to a food, its fingerprints are saved; later scans are
// compared against everything you've taught it. No image ever leaves the phone, and the
// fingerprints are encrypted with your passcode like the rest of your data.
import { runBundledLib } from './ui.js';
import { repoFile } from './fooddb.js';
import { cacheGet, cacheSet } from './db.js';

const MODEL_DIR = 'ml/mobilenet_v2_0.35_224/';
const SIZE = 224;
const MAX_PER_FOOD = 40; // fingerprints kept per food (oldest dropped)

let model = null;
let loading = null;

function loadTf() {
  if (globalThis.tf || runBundledLib('lib-tf')) return Promise.resolve(globalThis.tf);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/tf.min.js';
    s.onload = () => resolve(globalThis.tf);
    s.onerror = () => reject(new Error('Could not load the scanner engine'));
    document.head.append(s);
  });
}

async function getModelFiles() {
  const cached = await cacheGet('ml:mobilenet').catch(() => null);
  if (cached?.json && cached?.bin) return cached;
  const opts = { credentials: 'omit', referrerPolicy: 'no-referrer' };
  // The claude.ai web link can't serve binary files, so there the weights come as base64 text.
  const hosted = !!globalThis.POCKET_STATS_HOSTED;
  const weights = hosted ? `${MODEL_DIR}weights.b64.txt` : `${MODEL_DIR}group1-shard1of1.bin`;
  const [jr, br] = await Promise.all([fetch(repoFile(`${MODEL_DIR}model.json`), opts), fetch(repoFile(weights), opts)]);
  if (!jr.ok || !br.ok) throw new Error('Could not download the scanner model');
  const bin = hosted ? Uint8Array.from(atob((await br.text()).trim()), (c) => c.charCodeAt(0)).buffer : await br.arrayBuffer();
  const files = { json: await jr.json(), bin };
  cacheSet('ml:mobilenet', files).catch(() => {});
  return files;
}

/** Load TensorFlow.js and the model once (≈1.6 MB, downloaded from the app's repo the first time). */
export function prepareScanner(onStatus = () => {}) {
  if (model) return Promise.resolve();
  loading ??= (async () => {
    onStatus('Loading the scanner…');
    const tf = await loadTf();
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();
    const { json, bin } = await getModelFiles();
    model = await tf.loadLayersModel({
      load: async () => ({ modelTopology: json.modelTopology, weightSpecs: json.weightsManifest.flatMap((g) => g.weights), weightData: bin }),
    });
    tf.tidy(() => { model.predict(tf.zeros([1, SIZE, SIZE, 3])); }); // warm up
  })().catch((err) => { loading = null; throw err; });
  return loading;
}

/** Fingerprint of one view: L2-normalised 1280-number vector. */
export function fingerprint(source) {
  const { tf } = globalThis;
  return tf.tidy(() => {
    // Plain tf.* functions (the bundle only includes TensorFlow.js core, without chainable methods)
    const img = tf.browser.fromPixels(source);
    const [h, w] = img.shape;
    const side = Math.min(h, w); // centre square crop (where the guide ring is)
    const crop = tf.slice(img, [Math.floor((h - side) / 2), Math.floor((w - side) / 2), 0], [side, side, 3]);
    const x = tf.expandDims(tf.sub(tf.div(tf.cast(tf.image.resizeBilinear(crop, [SIZE, SIZE]), 'float32'), 127.5), 1), 0);
    const feat = tf.squeeze(tf.mean(model.predict(x), [1, 2]));
    return tf.div(feat, tf.add(tf.norm(feat), 1e-8)).dataSync().slice();
  });
}

// ---------- compact storage: 1 byte per number ----------
function quantize(v) {
  let max = 0;
  for (const x of v) max = Math.max(max, Math.abs(x));
  const scale = max > 0 ? 127 / max : 1;
  const b = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) b[i] = Math.round(v[i] * scale);
  let s = '';
  const u = new Uint8Array(b.buffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return { s: scale, q: btoa(s) };
}

function dequantize({ s, q }) {
  const bin = atob(q);
  const out = new Float32Array(bin.length);
  let norm = 0;
  for (let i = 0; i < bin.length; i++) {
    const x = ((bin.charCodeAt(i) << 24) >> 24) / s;
    out[i] = x; norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function dot(a, b) {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i] * b[i];
  return t;
}

const decoded = new WeakMap();
function vectors(rec) {
  if (!decoded.has(rec)) decoded.set(rec, (rec.prints || []).map(dequantize));
  return decoded.get(rec);
}

/** Add a scan's fingerprints to a food's record (creates the record). Returns the updated record. */
export function learn(rec, food, prints) {
  const next = {
    food: { id: food.id, name: food.name, brand: food.brand || '', source: food.source, n: food.n, serving: food.serving, servingLabel: food.servingLabel, emoji: food.emoji || '', img: food.img || '' },
    prints: [...(rec?.prints || []), ...prints.map(quantize)].slice(-MAX_PER_FOOD),
    sizes: rec?.sizes || [],
    lastGrams: rec?.lastGrams || null,
    updated: Date.now(),
  };
  return next;
}

/**
 * Rank learned foods against a scan. For each food: average over the scan's views of the
 * best match among that food's stored views (cosine similarity, 1 = identical).
 */
export function match(lib, prints) {
  const out = [];
  for (const [id, rec] of Object.entries(lib || {})) {
    const stored = vectors(rec);
    if (!stored.length) continue;
    let total = 0;
    for (const p of prints) {
      let best = -1;
      for (const v of stored) best = Math.max(best, dot(p, v));
      total += best;
    }
    out.push({ id, rec, score: total / prints.length });
  }
  return out.sort((a, b) => b.score - a.score);
}

// Thresholds calibrated on 40 real product photos (see tools/ notes in the commit):
// same food, other view: median 0.89 (5th percentile 0.81); different foods: median 0.50,
// 95th percentile 0.66, 99th 0.72. Teaching 3 views and scanning 2 new ones ranked 40/40 correctly.
const LEVELS = [
  { min: 0.84, label: 'Very likely', level: 'high' },
  { min: 0.77, label: 'Likely', level: 'medium' },
  { min: 0.70, label: 'Possible', level: 'low' },
];

/**
 * Plain-language confidence for a match. `margin` is how far ahead of the next food it is;
 * a near-tie drops it one level, because the scanner can't tell those two apart well yet.
 */
export function confidence(score, margin = 1) {
  let i = LEVELS.findIndex((l) => score >= l.min);
  if (i === -1) return null;
  if (margin < 0.04) i += 1;
  return LEVELS[i] || null;
}

// ---------- portion size from the scan ----------
// The scan circle is the ruler: you fit the plate or bowl inside it, so every scan of a
// plate is at the same scale. The outer ring of the circle shows the plate (its colour is
// measured there); inside, pixels that differ clearly from the plate count as food.
// coverage = share of the plate covered by food (0–1).

/** Fraction of the plate covered by food in one square view (canvas). */
export function plateCoverage(canvas) {
  const size = canvas.width;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size);
  const c = (size - 1) / 2; const R = size / 2;
  const rim = [];
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const r = Math.hypot(x - c, y - c) / R;
      if (r > 0.86 && r < 0.98) { const i = (y * size + x) * 4; rim.push([data[i], data[i + 1], data[i + 2]]); }
    }
  }
  if (!rim.length) return null;
  const mean = [0, 1, 2].map((k) => rim.reduce((t, p) => t + p[k], 0) / rim.length);
  const spread = Math.sqrt(rim.reduce((t, p) => t + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2, 0) / rim.length);
  const threshold = Math.max(40, 2.5 * spread);
  let inside = 0; let food = 0;
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      if (Math.hypot(x - c, y - c) / R >= 0.84) continue;
      const i = (y * size + x) * 4;
      inside++;
      if (Math.hypot(data[i] - mean[0], data[i + 1] - mean[1], data[i + 2] - mean[2]) > threshold) food++;
    }
  }
  return inside ? food / inside : null;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Remember that this much plate coverage was this many grams (keeps the last 12). */
export function addSize(rec, coverage, grams) {
  if (!(coverage > 0.03 && coverage < 0.97) || !(grams > 0)) return rec;
  return { ...rec, sizes: [...(rec.sizes || []), { c: +coverage.toFixed(3), g: Math.round(grams) }].slice(-12) };
}

/**
 * Grams for a new scan of a food you've logged before: grams grow with coverage^b. With
 * portions at clearly different sizes the app fits b for this food (flat foods like msemen
 * grow ~linearly, piled foods faster); otherwise it uses 1.2. Limited to 1/3–3× your usual.
 */
export function estimateGrams(rec, coverage) {
  const s = (rec?.sizes || []).filter((x) => x.c > 0.03 && x.g > 0);
  if (!s.length || !(coverage > 0.03)) return null;
  let b = 1.2;
  const cs = s.map((x) => x.c);
  if (s.length >= 2 && Math.max(...cs) / Math.min(...cs) > 1.3) {
    const lx = s.map((x) => Math.log(x.c)); const ly = s.map((x) => Math.log(x.g));
    const mx = lx.reduce((t, v) => t + v, 0) / lx.length; const my = ly.reduce((t, v) => t + v, 0) / ly.length;
    let num = 0; let den = 0;
    for (let i = 0; i < lx.length; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
    if (den > 0) b = Math.min(1.6, Math.max(0.8, num / den));
  }
  const k = median(s.map((x) => x.g / x.c ** b));
  const usual = median(s.map((x) => x.g));
  const est = Math.min(usual * 3, Math.max(usual / 3, k * coverage ** b));
  return { grams: Math.max(5, Math.round(est / 5) * 5), basedOn: s.length, exponent: +b.toFixed(2) };
}

export const medianOf = median;
