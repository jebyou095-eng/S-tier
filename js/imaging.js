// Pixel maths for the photo editor. Pure functions on {data, width, height} (RGBA bytes),
// so they run the same on the phone and in the tests. Nothing here touches the network.

export const ADJUST_KEYS = ['brightness', 'contrast', 'warmth', 'saturation', 'sharpness', 'shadows', 'highlights', 'vignette'];
export const ZERO_ADJUST = Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0]));

const clamp = (x, lo = 0, hi = 255) => (x < lo ? lo : x > hi ? hi : x);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * One-tap "Enhance": measures the photo and returns gentle corrections.
 * - exposure: brings the median brightness towards a pleasant level
 * - contrast: stretches the 1st–99th percentile range (no clipping of the dish)
 * - white balance: from near-neutral pixels (plates, glasses, walls), applied at half
 *   strength and clamped, so warm food is not turned blue
 * - a little extra saturation and warmth, light sharpening, and noise reduction if dark
 */
export function analyze(img) {
  const { data, width, height } = img;
  const step = Math.max(1, Math.floor((width * height) / 60000));
  const hist = new Uint32Array(256);
  let nr = 0; let ng = 0; let nb = 0; let nn = 0; let count = 0;
  for (let i = 0; i < width * height; i += step) {
    const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2];
    const l = lum(r, g, b);
    hist[l | 0]++; count++;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    if (mx > 60 && mx < 250 && (mx - mn) / mx < 0.18 && l > 90) { nr += r; ng += g; nb += b; nn++; }
  }
  const pct = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= p * count) return v; } return 255; };
  const lo = pct(0.01); const hi = pct(0.99); const med = pct(0.5);
  let wb = [1, 1, 1];
  if (nn > count * 0.01) {
    const avg = (nr + ng + nb) / 3 / nn;
    wb = [avg / (nr / nn), avg / (ng / nn), avg / (nb / nn)].map((gain) => clamp(1 + (gain - 1) * 0.5, 0.88, 1.14));
  }
  const exposure = clamp(Math.log2(118 / Math.max(20, med)) * 0.6, -0.5, 0.8);
  return {
    exposure,
    black: Math.min(lo, 40), white: Math.max(hi, 215),
    wb,
    saturation: 0.1, warmth: 0.04, sharpen: 0.35,
    denoise: med < 85 ? 0.5 : med < 110 ? 0.25 : 0,
  };
}

/** Box blur (separable, 3 passes ≈ gaussian) of a single channel Float32Array. */
export function blurChannel(src, w, h, r) {
  if (r < 1) return Float32Array.from(src);
  let a = Float32Array.from(src); let b = new Float32Array(src.length);
  const pass = (from, to, horizontal) => {
    const n = horizontal ? w : h; const lines = horizontal ? h : w;
    for (let line = 0; line < lines; line++) {
      const at = (k) => (horizontal ? line * w + k : k * w + line);
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += from[at(Math.min(n - 1, Math.max(0, k)))];
      for (let k = 0; k < n; k++) {
        to[at(k)] = acc / (2 * r + 1);
        acc += from[at(Math.min(n - 1, k + r + 1))] - from[at(Math.max(0, k - r))];
      }
    }
  };
  for (let i = 0; i < 3; i++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

/** Blur an RGBA image (for the "soft blur" background and denoise). Returns new RGBA bytes. */
export function blurImage(img, r) {
  const { data, width: w, height: h } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let c = 0; c < 4; c++) {
    const ch = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) ch[i] = data[i * 4 + c];
    const bl = blurChannel(ch, w, h, r);
    for (let i = 0; i < w * h; i++) out[i * 4 + c] = bl[i];
  }
  return { data: out, width: w, height: h };
}

/**
 * Apply the auto corrections (if any) and the manual sliders (each −100…100) to a copy.
 * Order: denoise → white balance/exposure/levels → tone (shadows, highlights, contrast,
 * brightness) → colour (warmth, saturation) → sharpen → vignette.
 */
export function adjustImage(img, auto, adj = ZERO_ADJUST) {
  const { width: w, height: h } = img;
  let src = img.data;
  const a = auto || { exposure: 0, black: 0, white: 255, wb: [1, 1, 1], saturation: 0, warmth: 0, sharpen: 0, denoise: 0 };
  if (a.denoise > 0) {
    const soft = blurImage(img, 1).data;
    const mixed = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i++) mixed[i] = src[i] + (soft[i] - src[i]) * a.denoise;
    src = mixed;
  }
  // Tone curve as a lookup table (fast on a phone)
  const k = (x) => (adj[x] || 0) / 100;
  const expo = 2 ** (a.exposure + k('brightness') * 0.6);
  const con = 1 + k('contrast') * 0.5;
  const sh = k('shadows'); const hl = k('highlights');
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let x = clamp((v - a.black) / Math.max(1, a.white - a.black), 0, 1);
    x **= 1 / expo; // gamma-style exposure: brightens mid-tones without clipping highlights
    x += sh * 0.3 * 4 * x * (1 - x) ** 2; // lift/lower shadows (strongest around 1/3)
    x += hl * 0.3 * 4 * x * x * (1 - x); // lift/lower highlights (strongest around 2/3)
    x = 0.5 + (x - 0.5) * con;
    lut[v] = clamp(x, 0, 1) * 255;
  }
  const warm = a.warmth + k('warmth') * 0.12;
  const sat = 1 + a.saturation + k('saturation') * 0.6;
  const [gr, gg, gb] = a.wb;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    let r = lut[clamp(src[o] * gr) | 0]; let g = lut[clamp(src[o + 1] * gg) | 0]; let b = lut[clamp(src[o + 2] * gb) | 0];
    r *= 1 + warm; b *= 1 - warm; g *= 1 + warm * 0.15;
    const l = lum(r, g, b);
    out[o] = l + (r - l) * sat; out[o + 1] = l + (g - l) * sat; out[o + 2] = l + (b - l) * sat; out[o + 3] = src[o + 3];
  }
  const sharp = a.sharpen + k('sharpness') * 0.9;
  let result = { data: out, width: w, height: h };
  if (Math.abs(sharp) > 0.01) {
    const soft = blurImage(result, 1).data;
    for (let i = 0; i < out.length; i++) if ((i & 3) !== 3) out[i] = out[i] + (out[i] - soft[i]) * sharp;
  }
  const vig = k('vignette');
  if (vig) {
    const cx = w / 2; const cy = h / 2; const rmax = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy) / rmax;
        const f = 1 - vig * 0.55 * Math.max(0, d - 0.35) ** 2 / 0.42;
        const o = (y * w + x) * 4;
        out[o] *= f; out[o + 1] *= f; out[o + 2] *= f;
      }
    }
  }
  result = { data: out, width: w, height: h };
  return result;
}

/**
 * Edge-aware mask refinement (guided filter, He et al. 2010): the coarse mask from the
 * network is snapped to the real edges of the plate or glass using the photo itself.
 */
export function refineMask(img, mask, r = 6, eps = 0.004) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const I = new Float32Array(n);
  for (let i = 0; i < n; i++) I[i] = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
  const box = (x) => blurChannel(x, w, h, r);
  const meanI = box(I); const meanP = box(mask);
  const IP = new Float32Array(n); const II = new Float32Array(n);
  for (let i = 0; i < n; i++) { IP[i] = I[i] * mask[i]; II[i] = I[i] * I[i]; }
  const corrIP = box(IP); const corrI = box(II);
  const A = new Float32Array(n); const B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    A[i] = (corrIP[i] - meanI[i] * meanP[i]) / (varI + eps);
    B[i] = meanP[i] - A[i] * meanI[i];
  }
  const mA = box(A); const mB = box(B);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = clamp(mA[i] * I[i] + mB[i], 0, 1);
  return out;
}

/** Paint a soft round brush into a Uint8 mask. mode 'keep' adds, 'erase' removes. */
export function brush(mask, w, h, cx, cy, radius, softness, mode) {
  const r = Math.max(1, radius);
  const inner = r * (1 - clamp(softness, 0, 1));
  const x0 = Math.max(0, Math.floor(cx - r)); const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)); const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const s = d <= inner ? 1 : 1 - (d - inner) / Math.max(1e-6, r - inner);
      const i = y * w + x;
      mask[i] = mode === 'keep' ? Math.max(mask[i], s * 255) : Math.min(mask[i], (1 - s) * 255);
    }
  }
}

/** Bounding box of a Uint8/Float mask above a threshold (fraction of full), or null. */
export function maskBounds(mask, w, h, thr = 0.5) {
  const t = mask instanceof Uint8Array ? thr * 255 : thr;
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > t) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Mean absolute difference between two RGBA images (0–255), for tests. */
export function imageDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.data.length; i++) if ((i & 3) !== 3) d += Math.abs(a.data[i] - b.data[i]);
  return d / ((a.data.length / 4) * 3);
}
