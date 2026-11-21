// Photo editor for your recipe and food photos. Everything runs on the phone: background
// removal (U²-Net-p, see cutout.js), Enhance, sliders, brushes, crop. No photo is sent anywhere.
// Keeps the original and the edit settings, so you can re-edit later or go back to the original.
import { h, modal } from './ui.js';
import { t, fmt } from './i18n.js';
import { icon } from './icons.js';
import { analyze, adjustImage, refineMask, brush, maskBounds, blurImage, ADJUST_KEYS, ZERO_ADJUST } from './imaging.js';
import { findDish, prepareCutout } from './cutout.js';

const WORK = 1440; // working size (longest side), so a square crop still has ~1080 px
const FINAL = 1080; // saved edit (longest side)
const PREVIEW = 640; // live preview size (longest side)
const MASK_MAX = 560; // background mask resolution
const ORIG_MAX = 1600; // kept original
const THUMB = 320;
export const BACKGROUNDS = { original: null, transparent: null, card: '#151D1A', dark: '#0E1412', light: '#F4F6F5', blur: null };
const ASPECTS = { square: 1, '4:5': 4 / 5, free: null };

export function freshEdit() {
  return { enhance: false, adj: { ...ZERO_ADJUST }, rot90: 0, angle: 0, crop: 'square', cx: 0.5, cy: 0.5, bg: 'original', shadow: true, cut: false };
}

// ---------- image helpers ----------
async function decode(src) {
  if (src instanceof Blob) {
    try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
    const url = URL.createObjectURL(src);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const img = new Image(); img.src = src; await img.decode(); return img;
}

function canvasOf(w, hgt) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hgt));
  return c;
}

function fit(w, hgt, max) {
  const k = Math.min(1, max / Math.max(w, hgt));
  return [Math.round(w * k), Math.round(hgt * k)];
}

/** Draw the source rotated by 90° steps, scaled so its longest side is `max`. */
function rotated(src, rot90, max) {
  const sw = src.width || src.naturalWidth; const sh = src.height || src.naturalHeight;
  const [w, hgt] = fit(rot90 % 2 ? sh : sw, rot90 % 2 ? sw : sh, max);
  const c = canvasOf(w, hgt);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.translate(w / 2, hgt / 2);
  x.rotate((rot90 * Math.PI) / 2);
  const dw = rot90 % 2 ? hgt : w; const dh = rot90 % 2 ? w : hgt;
  x.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  return c;
}

const pixels = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

/** The mask (Uint8, mw×mh) scaled to w×h as 0..1 floats. */
function maskAt(mask, mw, mh, w, hgt) {
  const c = canvasOf(mw, mh);
  const id = c.getContext('2d').createImageData(mw, mh);
  for (let i = 0; i < mask.length; i++) { id.data[i * 4 + 3] = mask[i]; }
  c.getContext('2d').putImageData(id, 0, 0);
  const d = canvasOf(w, hgt);
  d.getContext('2d').drawImage(c, 0, 0, w, hgt);
  const a = d.getContext('2d').getImageData(0, 0, w, hgt).data;
  const out = new Float32Array(w * hgt);
  for (let i = 0; i < out.length; i++) out[i] = a[i * 4 + 3] / 255;
  return out;
}

function maskToPng(mask, mw, mh) {
  const c = canvasOf(mw, mh);
  const id = c.getContext('2d').createImageData(mw, mh);
  for (let i = 0; i < mask.length; i++) { const o = i * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = mask[i]; id.data[o + 3] = 255; }
  c.getContext('2d').putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

async function maskFromPng(url) {
  const img = await decode(url);
  const c = canvasOf(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const m = new Uint8Array(c.width * c.height);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4];
  return { mask: m, mw: c.width, mh: c.height };
}

/**
 * Render the edit at a given size: adjustments → background → shadow. Returns a canvas
 * (uncropped). `auto` is the Enhance analysis (or null).
 */
export function renderBase(srcCanvas, edit, auto, maskInfo) {
  const w = srcCanvas.width; const hgt = srcCanvas.height;
  const img = pixels(srcCanvas);
  const adj = adjustImage(img, edit.enhance ? auto : null, edit.adj);
  const out = new ImageData(adj.data, w, hgt);
  if (edit.cut && maskInfo && edit.bg !== 'original') {
    const a = maskAt(maskInfo.mask, maskInfo.mw, maskInfo.mh, w, hgt);
    let bg = null;
    if (edit.bg === 'blur') bg = blurImage(adj, Math.max(6, Math.round(Math.max(w, hgt) / 60))).data;
    const col = BACKGROUNDS[edit.bg];
    const rgb = col ? [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)] : null;
    // A soft contact shadow under the dish so it looks placed, not pasted
    let shadow = null;
    if (edit.shadow && edit.bg !== 'transparent') {
      const box = maskBounds(a, w, hgt, 0.5);
      if (box) {
        shadow = { cx: box.x + box.w / 2, cy: box.y + box.h * 0.97, rx: box.w * 0.48, ry: Math.max(4, box.h * 0.07) };
      }
    }
    const d = out.data;
    for (let y = 0; y < hgt; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x; const o = i * 4;
        const al = a[i];
        if (edit.bg === 'transparent') { d[o + 3] = Math.round(al * 255); continue; }
        let br; let bgc; let bb;
        if (bg) { br = bg[o]; bgc = bg[o + 1]; bb = bg[o + 2]; } else { [br, bgc, bb] = rgb; }
        if (shadow) {
          const dx = (x - shadow.cx) / shadow.rx; const dy = (y - shadow.cy) / shadow.ry;
          const s = Math.exp(-(dx * dx + dy * dy) * 1.6) * 0.38;
          br *= 1 - s; bgc *= 1 - s; bb *= 1 - s;
        }
        d[o] = d[o] * al + br * (1 - al);
        d[o + 1] = d[o + 1] * al + bgc * (1 - al);
        d[o + 2] = d[o + 2] * al + bb * (1 - al);
        d[o + 3] = 255;
      }
    }
  }
  const c = canvasOf(w, hgt);
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

/** Crop and straighten: rotate by `angle`, cover the output, centred on (cx, cy). */
export function cropped(base, edit, maxSide) {
  const w = base.width; const hgt = base.height;
  const ratio = ASPECTS[edit.crop] ?? w / hgt;
  let ow; let oh;
  if (ratio >= w / hgt) { ow = w; oh = w / ratio; } else { oh = hgt; ow = hgt * ratio; }
  const rad = (edit.angle * Math.PI) / 180;
  // Zoom in just enough that the rotated photo still covers the crop (no empty corners)
  const cover = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) * Math.max(ow / oh, oh / ow);
  const k = Math.min(1, maxSide / Math.max(ow, oh));
  const out = canvasOf(ow * k, oh * k);
  const x = out.getContext('2d');
  x.imageSmoothingQuality = 'high';
  if (edit.bg === 'transparent' && edit.cut) x.clearRect(0, 0, out.width, out.height);
  x.translate(out.width / 2, out.height / 2);
  x.rotate(rad);
  x.scale(k * cover, k * cover);
  // keep the chosen centre, but never show outside the photo
  const halfW = ow / 2 / cover; const halfH = oh / 2 / cover;
  const cx = Math.min(w - halfW, Math.max(halfW, edit.cx * w));
  const cy = Math.min(hgt - halfH, Math.max(halfH, edit.cy * hgt));
  x.drawImage(base, -cx, -cy);
  return out;
}

const toUrl = (c, type, q) => c.toDataURL(type, q);

// ---------- the editor ----------
/**
 * Open the editor. source = {file} (new photo) or {existing, reset} (re-edit a saved photo).
 * Resolves {orig, edited, thumb, edit, mask} or null.
 */
export async function editPhoto(source) {
  const started = performance.now();
  let origUrl; let srcImg;
  if (source.file) {
    const bmp = await decode(source.file);
    const [ow, oh] = fit(bmp.width, bmp.height, ORIG_MAX);
    const oc = canvasOf(ow, oh);
    oc.getContext('2d').drawImage(bmp, 0, 0, ow, oh);
    origUrl = toUrl(oc, 'image/jpeg', 0.88);
    srcImg = oc;
  } else {
    origUrl = source.existing.orig || source.existing.edited;
    srcImg = await decode(origUrl);
  }
  const edit = source.existing?.edit && !source.reset ? { ...freshEdit(), ...source.existing.edit, adj: { ...ZERO_ADJUST, ...(source.existing.edit.adj || {}) } } : freshEdit();
  let maskInfo = null;
  if (source.existing?.mask && !source.reset) { try { maskInfo = await maskFromPng(source.existing.mask); } catch { maskInfo = null; } }
  if (!maskInfo) edit.cut = false;

  let work = rotated(srcImg, edit.rot90, WORK);
  let prev = rotated(srcImg, edit.rot90, PREVIEW);
  let auto = analyze(pixels(rotated(srcImg, edit.rot90, 400)));
  const undoStack = []; const redoStack = [];

  return modal((done) => {
    const canvas = h('canvas', { 'aria-label': t('ed.preview'), role: 'img' });
    const stage = h('div', { class: 'ed-stage' }, canvas);
    const busyBox = h('div', { class: 'ed-busy', hidden: true }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'small' }));
    stage.append(busyBox);
    const panel = h('div', { class: 'ed-panel' });
    let tab = 'enhance';
    let compare = false;
    let tool = { mode: 'keep', size: 28, soft: 0.5, zoom: 1 };
    let frame = 0;

    const setBusy = (text) => { busyBox.hidden = !text; busyBox.querySelector('p').textContent = text || ''; };
    const editingMask = () => tab === 'cut' && edit.cut && maskInfo;

    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let out;
        if (compare) out = cropped(prev, { ...freshEdit(), crop: edit.crop, angle: 0, rot90: edit.rot90 }, PREVIEW);
        else if (editingMask()) {
          // While brushing: the whole photo (no crop) over a checkerboard, so strokes land where you touch
          out = renderBase(prev, { ...edit, bg: edit.bg === 'original' ? 'transparent' : edit.bg }, auto, maskInfo);
        } else out = cropped(renderBase(prev, edit, auto, maskInfo), edit, PREVIEW);
        canvas.width = out.width; canvas.height = out.height;
        canvas.getContext('2d').clearRect(0, 0, out.width, out.height);
        canvas.getContext('2d').drawImage(out, 0, 0);
        stage.classList.toggle('checker', !!(edit.cut && (edit.bg === 'transparent' || editingMask())));
        canvas.style.transform = editingMask() && tool.zoom > 1 ? `scale(${tool.zoom})` : '';
        canvas.style.transformOrigin = 'top left';
        stage.classList.toggle('zoomed', editingMask() && tool.zoom > 1);
        stage.classList.toggle('painting', editingMask());
      });
    };

    const pushUndo = () => { if (maskInfo) { undoStack.push(maskInfo.mask.slice()); if (undoStack.length > 20) undoStack.shift(); redoStack.length = 0; } };

    // ---- brushes (Keep / Erase) on the mask ----
    let painting = false;
    const paintAt = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * maskInfo.mw;
      const y = ((e.clientY - r.top) / r.height) * maskInfo.mh;
      const radius = (tool.size / 100) * Math.max(maskInfo.mw, maskInfo.mh) * 0.25 / Math.max(1, tool.zoom * 0.6);
      brush(maskInfo.mask, maskInfo.mw, maskInfo.mh, x, y, radius, tool.soft, tool.mode);
      draw();
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!editingMask()) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pushUndo();
      painting = true;
      paintAt(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (painting) paintAt(e); });
    const stop = () => { if (painting) { painting = false; panelDraw(); } }; // enables Undo
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    const slider = (label, value, min, max, step, onInput, onReset, unit = '') => {
      const v = h('span', { class: 'v' }, `${fmt(value)}${unit}`);
      const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
      input.addEventListener('input', () => { v.textContent = `${fmt(+input.value)}${unit}`; onInput(+input.value); });
      return h('div', { class: 'slider' }, h('span', {}, label), input, v,
        h('button', { type: 'button', class: 'icon-btn small', 'aria-label': t('ed.resetN', { name: label }), onclick: () => { input.value = String(onReset()); v.textContent = `${fmt(+input.value)}${unit}`; } }, icon('undo', 'icon-sm')));
    };

    const runCutout = async () => {
      setBusy(t('ed.finding'));
      try {
        const [mw, mh] = fit(work.width, work.height, MASK_MAX);
        const small = rotated(srcImg, edit.rot90, MASK_MAX);
        const res = await findDish(small, mw, mh);
        const refined = refineMask(pixels(small), res.mask);
        const mask = new Uint8Array(mw * mh);
        for (let i = 0; i < mask.length; i++) mask[i] = Math.round(Math.min(1, Math.max(0, (refined[i] - 0.15) / 0.7)) * 255);
        if (maskInfo) pushUndo();
        maskInfo = { mask, mw, mh };
        edit.cut = true;
        if (edit.bg === 'original') edit.bg = 'card';
        autoCentre();
      } catch {
        setBusy(''); panelDraw(); alertText(t('ed.cutFail'));
        return;
      }
      setBusy('');
      panelDraw(); draw();
    };

    const autoCentre = () => {
      if (!maskInfo) return;
      const box = maskBounds(maskInfo.mask, maskInfo.mw, maskInfo.mh, 0.5);
      if (box) { edit.cx = (box.x + box.w / 2) / maskInfo.mw; edit.cy = (box.y + box.h / 2) / maskInfo.mh; }
    };

    const note = h('p', { class: 'muted small', 'aria-live': 'polite' });
    const alertText = (s) => { note.textContent = s; };

    const tabs = () => h('div', { class: 'ed-tools', role: 'tablist' }, ...[['enhance', 'magic'], ['adjust', 'sliders'], ['cut', 'layers'], ['crop', 'crop']].map(([k, ic]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(tab === k), class: `chip${tab === k ? ' on' : ''}`, onclick: () => { tab = k; compare = false; panelDraw(); draw(); },
    }, icon(ic, 'icon-sm'), t(`ed.tab.${k}`))));

    const compareBtn = () => h('button', {
      type: 'button', class: `chip${compare ? ' on' : ''}`, 'aria-pressed': String(compare), onclick: () => { compare = !compare; panelDraw(); draw(); },
    }, icon('compare', 'icon-sm'), t('ed.compare'));

    const panelDraw = () => {
      const body = [];
      if (tab === 'enhance') {
        body.push(h('div', { class: 'row wrap' },
          h('button', { type: 'button', class: `btn ${edit.enhance ? 'primary' : 'outline'}`, 'aria-pressed': String(edit.enhance), onclick: () => { edit.enhance = !edit.enhance; panelDraw(); draw(); } },
            icon('magic', 'icon-sm'), edit.enhance ? t('ed.enhanced') : t('ed.enhance')),
          compareBtn()),
        h('p', { class: 'muted small' }, t('ed.enhanceHint')));
      } else if (tab === 'adjust') {
        for (const k of ADJUST_KEYS) {
          body.push(slider(t(`ed.adj.${k}`), edit.adj[k], -100, 100, 1, (v) => { edit.adj[k] = v; draw(); }, () => { edit.adj[k] = 0; draw(); return 0; }));
        }
        body.push(h('div', { class: 'row' }, compareBtn(),
          h('button', { type: 'button', class: 'link small', onclick: () => { edit.adj = { ...ZERO_ADJUST }; panelDraw(); draw(); } }, t('ed.resetAll'))));
      } else if (tab === 'cut') {
        if (!edit.cut || !maskInfo) {
          body.push(h('button', { type: 'button', class: 'btn primary', onclick: runCutout }, icon('layers', 'icon-sm'), t('ed.removeBg')),
            h('p', { class: 'muted small' }, t('ed.removeBgHint')));
        } else {
          body.push(
            h('div', { class: 'chips scroll', role: 'radiogroup', 'aria-label': t('ed.background') }, ...Object.keys(BACKGROUNDS).map((k) => h('button', {
              type: 'button', role: 'radio', 'aria-checked': String(edit.bg === k), class: `chip small${edit.bg === k ? ' on' : ''}`, onclick: () => { edit.bg = k; panelDraw(); draw(); },
            }, t(`ed.bg.${k}`)))),
            h('label', { class: 'switch-row' }, h('span', { class: 'grow' }, t('ed.shadow')),
              h('input', { type: 'checkbox', role: 'switch', checked: edit.shadow, onchange: (e) => { edit.shadow = e.target.checked; draw(); } })),
            h('div', { class: 'row wrap' },
              ...[['keep', 'brush'], ['erase', 'eraser']].map(([k, ic]) => h('button', {
                type: 'button', class: `chip${tool.mode === k ? ' on' : ''}`, 'aria-pressed': String(tool.mode === k), onclick: () => { tool.mode = k; panelDraw(); },
              }, icon(ic, 'icon-sm'), t(`ed.brush.${k}`))),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('undo'), disabled: !undoStack.length, onclick: () => { redoStack.push(maskInfo.mask.slice()); maskInfo.mask = undoStack.pop(); panelDraw(); draw(); } }, icon('undo')),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('redo'), disabled: !redoStack.length, onclick: () => { undoStack.push(maskInfo.mask.slice()); maskInfo.mask = redoStack.pop(); panelDraw(); draw(); } }, icon('redo'))),
            slider(t('ed.size'), tool.size, 2, 100, 1, (v) => { tool.size = v; }, () => { tool.size = 28; return 28; }),
            slider(t('ed.softness'), Math.round(tool.soft * 100), 0, 100, 1, (v) => { tool.soft = v / 100; }, () => { tool.soft = 0.5; return 50; }, '%'),
            slider(t('ed.zoom'), tool.zoom, 1, 4, 0.5, (v) => { tool.zoom = v; draw(); }, () => { tool.zoom = 1; draw(); return 1; }, '×'),
            h('p', { class: 'muted small' }, t('ed.brushHint')),
            h('div', { class: 'row wrap' }, compareBtn(),
              h('button', { type: 'button', class: 'link small', onclick: runCutout }, t('ed.redoCut')),
              h('button', { type: 'button', class: 'link small', onclick: () => { edit.cut = false; edit.bg = 'original'; panelDraw(); draw(); } }, t('ed.keepBg'))));
        }
      } else if (tab === 'crop') {
        body.push(
          h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('ed.crop') }, ...Object.keys(ASPECTS).map((k) => h('button', {
            type: 'button', role: 'radio', 'aria-checked': String(edit.crop === k), class: `chip${edit.crop === k ? ' on' : ''}`, onclick: () => { edit.crop = k; panelDraw(); draw(); },
          }, t(`ed.crop.${k}`)))),
          slider(t('ed.straighten'), edit.angle, -15, 15, 0.5, (v) => { edit.angle = v; draw(); }, () => { edit.angle = 0; draw(); return 0; }, '°'),
          h('div', { class: 'row wrap' },
            h('button', { type: 'button', class: 'btn ghost', onclick: () => {
              edit.rot90 = (edit.rot90 + 1) % 4;
              work = rotated(srcImg, edit.rot90, WORK); prev = rotated(srcImg, edit.rot90, PREVIEW);
              auto = analyze(pixels(rotated(srcImg, edit.rot90, 400)));
              if (maskInfo) { maskInfo = null; edit.cut = false; edit.bg = 'original'; alertText(t('ed.rotatedMask')); }
              draw();
            } }, icon('rotate', 'icon-sm'), t('ed.rotate')),
            h('button', { type: 'button', class: 'btn ghost', disabled: !maskInfo, onclick: () => { autoCentre(); draw(); } }, icon('plate', 'icon-sm'), t('ed.autoCentre'))),
          h('div', { class: 'row' },
            slider(t('ed.moveX'), Math.round(edit.cx * 100), 0, 100, 1, (v) => { edit.cx = v / 100; draw(); }, () => { edit.cx = 0.5; draw(); return 50; }, '%')),
          slider(t('ed.moveY'), Math.round(edit.cy * 100), 0, 100, 1, (v) => { edit.cy = v / 100; draw(); }, () => { edit.cy = 0.5; draw(); return 50; }, '%'));
      }
      panel.replaceChildren(tabs(), ...body, note);
    };

    const save = async () => {
      setBusy(t('ed.saving'));
      await new Promise((r) => setTimeout(r, 20));
      const final = cropped(renderBase(work, edit, auto, maskInfo), edit, FINAL);
      const [tw, th] = fit(final.width, final.height, THUMB);
      const thumb = canvasOf(tw, th);
      thumb.getContext('2d').drawImage(final, 0, 0, tw, th);
      done({
        orig: origUrl,
        edited: toUrl(final, 'image/webp', 0.85),
        thumb: toUrl(thumb, 'image/webp', 0.8),
        edit: { ...edit, adj: { ...edit.adj } },
        mask: maskInfo ? maskToPng(maskInfo.mask, maskInfo.mw, maskInfo.mh) : '',
      });
    };

    panelDraw();
    draw();
    requestAnimationFrame(() => {
      canvas.dataset.openMs = String(Math.round(performance.now() - started));
      // Get the background remover ready while you look at the photo, so "Remove background" is quick
      setTimeout(() => { prepareCutout().catch(() => {}); }, 600);
    });
    return h('div', { class: 'ed' },
      h('div', { class: 'ed-top' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')),
        h('h2', {}, t('ed.title')),
        h('button', { type: 'button', class: 'btn primary', onclick: save }, t('save'))),
      stage, panel);
  }, 'editor');
}

/** Apply Enhance (and optional settings) to an image without the screen: used for the starter photos and tests. */
export async function quickEdit(src, edit = { ...freshEdit(), enhance: true, crop: 'free' }) {
  const img = await decode(src);
  const work = rotated(img, edit.rot90 || 0, WORK);
  const auto = analyze(pixels(rotated(img, edit.rot90 || 0, 400)));
  const final = cropped(renderBase(work, edit, auto, null), edit, FINAL);
  const [ow, oh] = fit(img.width, img.height, ORIG_MAX);
  const oc = canvasOf(ow, oh);
  oc.getContext('2d').drawImage(img, 0, 0, ow, oh);
  const [tw, th] = fit(final.width, final.height, THUMB);
  const thumb = canvasOf(tw, th);
  thumb.getContext('2d').drawImage(final, 0, 0, tw, th);
  return { orig: toUrl(oc, 'image/jpeg', 0.88), edited: toUrl(final, 'image/webp', 0.85), thumb: toUrl(thumb, 'image/webp', 0.8), edit, mask: '' };
}
