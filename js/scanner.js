// Barcode scanning that runs entirely on the phone. Camera frames are decoded in
// memory and thrown away; no image is ever saved or sent anywhere.
import { h } from './ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let zxingLoad = null;

async function nativeDetector() {
  if (!('BarcodeDetector' in globalThis)) return null;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const det = new BarcodeDetector({ formats });
    return async (source) => (await det.detect(source))[0]?.rawValue || null;
  } catch {
    return null;
  }
}

function loadZxing() {
  zxingLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/zxing.min.js';
    s.onload = () => resolve(globalThis.ZXing);
    s.onerror = () => reject(new Error('Scanner failed to load'));
    document.head.append(s);
  });
  return zxingLoad;
}

/** Bundled ZXing decoder (used on iPhone and anywhere without a built-in detector). */
async function zxingDetector() {
  const Z = await loadZxing();
  const reader = new Z.MultiFormatReader();
  const hints = new Map();
  const F = Z.BarcodeFormat;
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return async (canvas) => {
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decodeWithState(bmp).getText();
    } catch {
      return null; // nothing found in this frame
    } finally {
      reader.reset();
    }
  };
}

async function getDetector() {
  const native = await nativeDetector();
  if (native) return { detect: native, wantsCanvas: false };
  return { detect: await zxingDetector(), wantsCanvas: true };
}

function checksumOk(code) {
  const d = code.split('').map(Number);
  const check = d.pop();
  const total = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}

/** Expand an 8-digit UPC-E code to its 12-digit UPC-A form. */
export function expandUpcE(code) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [s, d1, d2, d3, d4, d5, d6, c] = code;
  let body;
  if ('012'.includes(d6)) body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${s}${body}${c}`;
}

/** Valid EAN/UPC check digit, so a misread never gets looked up. */
export function validBarcode(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  if (checksumOk(code)) return true;
  const upcA = code.length === 8 ? expandUpcE(code) : null;
  return !!upcA && checksumOk(upcA);
}

/** The form databases index by: UPC-E becomes UPC-A. */
export function canonicalBarcode(code) {
  if (code.length === 8) {
    const upcA = expandUpcE(code);
    if (upcA && checksumOk(upcA) && !checksumOk(code)) return upcA;
  }
  return code;
}

function frameToCanvas(source, canvas, crop = true) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const hgt = source.videoHeight || source.naturalHeight || source.height;
  // Focus on the middle band where the guide box is; it's faster and more reliable.
  const sx = crop ? w * 0.1 : 0; const sw = crop ? w * 0.8 : w;
  const sy = crop ? hgt * 0.25 : 0; const sh = crop ? hgt * 0.5 : hgt;
  const scale = Math.min(1, 1280 / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decodeImageFile(file) {
  const det = await getDetector();
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    for (const crop of [false, true]) {
      const code = await det.detect(det.wantsCanvas ? frameToCanvas(img, canvas, crop) : img);
      if (code && validBarcode(code)) return code;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full-screen scanner. Resolves to a barcode string, or null if cancelled.
 * Falls back to "take a photo" and manual entry when live camera isn't available.
 */
export function scanBarcode() {
  return new Promise((resolve) => {
    let stream = null; let running = true; let timer = null;
    const video = h('video', { playsinline: true, muted: true, autoplay: true, class: 'scan-video' });
    const status = h('p', { class: 'scan-status' }, 'Starting camera…');
    const manual = h('input', { inputmode: 'numeric', pattern: '[0-9]*', placeholder: 'Type the barcode number', 'aria-label': 'Barcode number', maxlength: 14 });
    const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    const canvas = document.createElement('canvas');

    const dlg = h('dialog', { class: 'scanner' });
    const finish = (code) => {
      running = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      dlg.close(); dlg.remove();
      resolve(code);
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });

    photo.addEventListener('change', async () => {
      const f = photo.files[0];
      if (!f) return;
      status.textContent = 'Reading photo…';
      const code = await decodeImageFile(f).catch(() => null);
      if (code) { navigator.vibrate?.(60); finish(code); } else status.textContent = 'No barcode found in that photo. Try again closer, or type the number.';
    });

    dlg.append(
      h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-guide', 'aria-hidden': 'true' }, h('div', { class: 'scan-line' }))),
      h('div', { class: 'scan-panel' },
        status,
        h('form', {
          class: 'row', onsubmit: (e) => {
            e.preventDefault();
            const code = manual.value.replace(/\D/g, '');
            if (validBarcode(code)) finish(code); else status.textContent = "That number doesn't look like a valid barcode. Check the digits.";
          },
        }, manual, h('button', { class: 'btn primary', type: 'submit' }, 'Look up')),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => photo.click() }, '📷 Take photo instead'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, 'Cancel')),
        photo),
    );
    document.body.append(dlg);
    dlg.showModal();

    (async () => {
      let det;
      try {
        det = await getDetector();
      } catch {
        status.textContent = 'Scanner unavailable. Take a photo or type the number.';
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'Live camera not available here. Take a photo of the barcode or type the number.';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        status.textContent = 'Camera permission was denied. You can still take a photo or type the number.';
        return;
      }
      if (!running) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      status.textContent = 'Point at the barcode. Hold steady.';
      // Require the same code twice in a row to rule out misreads.
      let last = null;
      const tick = async () => {
        if (!running) return;
        if (video.readyState >= 2) {
          const code = await det.detect(det.wantsCanvas ? frameToCanvas(video, canvas) : video).catch(() => null);
          if (code && validBarcode(code)) {
            if (code === last) { navigator.vibrate?.(60); finish(code); return; }
            last = code;
          }
        }
        timer = setTimeout(tick, det.wantsCanvas ? 120 : 80);
      };
      tick();
    })();
  });
}
