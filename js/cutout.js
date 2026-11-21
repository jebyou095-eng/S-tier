// On-device background removal for your dish photos.
//
// Uses U²-Net-p, a small salient-object model (finds "the main thing in the photo": a plate,
// a bowl, a glass…, not only people). It runs on the phone with the TensorFlow.js engine the
// app already ships for Scan & teach. The photo never leaves the phone.
// Model: U²-Net (Qin et al., 2020, Apache-2.0), converted by tools/convert_u2netp.py.
import { runBundledLib } from './ui.js';
import { repoFile } from './fooddb.js';

const DIR = 'ml/u2netp/';
export const CUTOUT_SIZE = 192; // network input; the mask is scaled back up and refined on the full photo
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let net = null;
let loading = null;
let engine = 'wasm'; // fast CPU engine (WebAssembly SIMD); falls back to the GPU engine

/** The WebAssembly engine: its code ships as inert text in bundled builds, like the other libraries. */
async function loadWasmBackend(tf) {
  if (!tf.wasm) {
    if (!runBundledLib('lib-tfwasm')) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/tf-backend-wasm.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.append(s);
      });
    }
  }
  const bundled = document.getElementById('lib-tfwasm-bin');
  let url = 'js/vendor/tfjs-backend-wasm-simd.wasm';
  if (bundled) {
    const bytes = Uint8Array.from(atob(bundled.textContent.trim()), (c) => c.charCodeAt(0));
    url = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
    bundled.remove();
  }
  tf.wasm.setWasmPaths({ 'tfjs-backend-wasm.wasm': url, 'tfjs-backend-wasm-simd.wasm': url, 'tfjs-backend-wasm-threaded-simd.wasm': url }, true);
}

async function useEngine(tf) {
  const prev = tf.getBackend();
  if (prev === engine) return prev;
  if (!(await tf.setBackend(engine).catch(() => false))) {
    engine = 'webgl';
    if (!(await tf.setBackend('webgl').catch(() => false))) { engine = 'cpu'; await tf.setBackend('cpu'); }
  }
  await tf.ready();
  return prev;
}

function loadTf() {
  if (globalThis.tf || runBundledLib('lib-tf')) return Promise.resolve(globalThis.tf);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/tf.min.js';
    s.onload = () => resolve(globalThis.tf);
    s.onerror = () => reject(new Error('engine'));
    document.head.append(s);
  });
}

function halfToFloat(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const hv = u16[i];
    const s = hv & 0x8000 ? -1 : 1;
    const e = (hv >> 10) & 0x1f;
    const f = hv & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

async function fetchModel() {
  const opts = { credentials: 'omit', referrerPolicy: 'no-referrer' };
  const hosted = !!globalThis.POCKET_STATS_HOSTED;
  const [jr, br] = await Promise.all([
    fetch(repoFile(`${DIR}model.json`), opts),
    fetch(repoFile(hosted ? `${DIR}weights.b64.txt` : `${DIR}weights.bin`), opts),
  ]);
  if (!jr.ok || !br.ok) throw new Error('model');
  const bin = hosted ? Uint8Array.from(atob((await br.text()).trim()), (c) => c.charCodeAt(0)).buffer : await br.arrayBuffer();
  return { spec: await jr.json(), weights: halfToFloat(new Uint16Array(bin)) };
}

/** Load the engine and model once (≈2.3 MB, built into the app). */
export function prepareCutout() {
  if (net) return Promise.resolve();
  loading ??= (async () => {
    const tf = await loadTf();
    try { await loadWasmBackend(tf); } catch { engine = 'webgl'; }
    const [{ spec, weights }, prev] = await Promise.all([fetchModel(), useEngine(tf)]);
    const slice = ([start, n]) => weights.subarray(start, start + n);
    net = {
      spec,
      convs: new Map(spec.ops.filter((o) => o.op === 'conv').map((o) => [o, {
        w: tf.tensor4d(slice(o.w), o.shape), b: tf.tensor1d(slice(o.b)),
      }])),
    };
    if (prev && prev !== engine) await tf.setBackend(prev);
  })().catch((err) => { loading = null; throw err; });
  return loading;
}

/** Run the network on an NHWC float tensor; returns the saliency map [1, h, w, 1] in 0..1. */
function runNet(tf, x) {
  const vals = new Map([[net.spec.input, x]]);
  const lastUse = new Map();
  net.spec.ops.forEach((o, i) => { for (const id of [o.x, o.like, ...(o.xs || [])]) if (id !== undefined) lastUse.set(id, i); });
  net.spec.ops.forEach((o, i) => {
    let y;
    const a = vals.get(o.x);
    if (o.op === 'conv') {
      const { w, b } = net.convs.get(o);
      const padded = o.p ? tf.pad(a, [[0, 0], [o.p, o.p], [o.p, o.p], [0, 0]]) : a;
      y = tf.add(tf.conv2d(padded, w, 1, 'valid', 'NHWC', o.d), b);
      if (padded !== a) padded.dispose();
    } else if (o.op === 'relu') y = tf.relu(a);
    else if (o.op === 'sigmoid') y = tf.sigmoid(a);
    else if (o.op === 'pool') y = tf.maxPool(a, 2, 2, 'same'); // = ceil_mode pooling
    else if (o.op === 'resize') {
      const like = vals.get(o.like);
      y = tf.image.resizeBilinear(a, [like.shape[1], like.shape[2]], false, true);
    } else if (o.op === 'concat') y = tf.concat(o.xs.map((id) => vals.get(id)), 3);
    else if (o.op === 'add') y = tf.add(vals.get(o.xs[0]), vals.get(o.xs[1]));
    vals.set(o.y, y);
    for (const id of [o.x, o.like, ...(o.xs || [])]) {
      if (id !== undefined && id !== net.spec.input && lastUse.get(id) === i && id !== net.spec.output) {
        vals.get(id)?.dispose();
        vals.delete(id);
      }
    }
  });
  return vals.get(net.spec.output);
}

/**
 * Saliency mask for an image/canvas. Returns {mask: Float32Array (w*h, 0..1), w, h} at the
 * given size (default: the source size, capped by the caller).
 */
export async function findDish(source, outW, outH) {
  await prepareCutout();
  const { tf } = globalThis;
  const w = outW || source.width; const hgt = outH || source.height;
  const prev = await useEngine(tf);
  const small = document.createElement('canvas');
  small.width = CUTOUT_SIZE; small.height = CUTOUT_SIZE;
  small.getContext('2d').drawImage(source, 0, 0, CUTOUT_SIZE, CUTOUT_SIZE);
  const sal = tf.tidy(() => {
    let x = tf.cast(tf.browser.fromPixels(small), 'float32');
    x = tf.div(x, tf.add(tf.max(x), 1e-6));
    x = tf.div(tf.sub(x, tf.tensor1d(MEAN)), tf.tensor1d(STD));
    const y = runNet(tf, tf.expandDims(x, 0));
    const lo = tf.min(y); const hi = tf.max(y);
    const norm = tf.div(tf.sub(y, lo), tf.add(tf.sub(hi, lo), 1e-6));
    return tf.squeeze(tf.image.resizeBilinear(norm, [hgt, w], false, true));
  });
  const mask = await sal.data();
  sal.dispose();
  if (prev && prev !== engine) await tf.setBackend(prev); // Scan & teach keeps its own engine
  return { mask: Float32Array.from(mask), w, h: hgt };
}

/** Bounding box of the dish (mask > 0.5) as {x, y, w, h} in mask pixels, or null. */
export function maskBox(mask, w, h, thr = 0.5) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > thr) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
