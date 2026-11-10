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
  const [jr, br] = await Promise.all([fetch(repoFile(`${MODEL_DIR}model.json`), opts), fetch(repoFile(`${MODEL_DIR}group1-shard1of1.bin`), opts)]);
  if (!jr.ok || !br.ok) throw new Error('Could not download the scanner model');
  const files = { json: await jr.json(), bin: await br.arrayBuffer() };
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
