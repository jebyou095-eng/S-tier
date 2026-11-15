// Shared UI helpers: templating, formatting, toasts, modals, animations.
import { assetUrl } from './api.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0);
export const money2 = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(n || 0);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  const units = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [sec, u] of units) if (s >= sec) return `${Math.floor(s / sec)}${u} ago`;
}
export const dateFmt = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const CONDITION_LABEL = { new: 'New', 'like-new': 'Like new', good: 'Good', fair: 'Fair' };

// ---------- Images (with graceful fallback) ----------
// Empty/missing images get a tiny transparent pixel so the browser doesn't request the page itself.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const src = (u) => (u ? esc(assetUrl(u)) : BLANK);
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
  img.dataset.failed = '1';
  if (img.classList.contains('avatar')) { img.replaceWith(avatarFallbackEl(img.alt)); return; }
  console.warn('[frontend] Image failed to load:', img.src);
  const box = img.parentElement;
  if (box) { box.classList.add('img-fallback'); box.dataset.label = img.alt || 'Photo unavailable'; }
  img.style.opacity = '0';
}, true);

const initials = (name = '?') => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
function avatarFallbackEl(name) {
  const d = document.createElement('div');
  d.className = 'avatar avatar-fallback';
  d.textContent = initials(name);
  return d;
}
export const avatar = (u, cls = '') => u?.avatar
  ? `<img class="avatar ${cls}" src="${esc(u.avatar)}" alt="${esc(u.name)}" loading="lazy" />`
  : `<div class="avatar avatar-fallback ${cls}">${esc(initials(u?.name))}</div>`;

// ---------- Product card ----------
const heart = `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>`;
export function card(l, i = 0) {
  const off = l.originalPrice > l.price ? Math.round((1 - l.price / l.originalPrice) * 100) : 0;
  const sold = l.status !== 'active';
  return `
  <article class="card reveal ${sold ? 'is-sold' : ''}" style="--d:${(i % 4) * 0.07}s">
    <div class="card__frame">
    <a href="#/item/${l.id}" class="card__media" aria-label="${esc(l.title)}">
      <img src="${src(l.images[0])}" alt="${esc(l.title)}" loading="lazy" />
      ${l.images[1] ? `<img class="alt" src="${src(l.images[1])}" alt="" loading="lazy" />` : ''}
      <div class="card__tags">
        ${sold ? '<span class="tag tag--ink">Sold</span>' : ''}
        ${off >= 10 && !sold ? `<span class="tag tag--lime">−${off}%</span>` : ''}
        <span class="tag">${CONDITION_LABEL[l.condition] || l.condition}</span>
      </div>
    </a>
    ${l.isMine ? '' : `<button class="fav ${l.isFavorite ? 'on' : ''}" data-fav="${l.id}" aria-label="Save item">${heart}</button>`}
    ${!sold && !l.isMine ? `<div class="card__quick"><button class="btn btn--sm" data-add="${l.id}">Add to bag <span class="arrow">→</span></button></div>` : ''}
    </div>
    <div class="card__info">
      <div class="card__row">
        <a href="#/item/${l.id}" class="card__title">${esc(l.title)}</a>
        <span class="price">${money(l.price)}</span>
      </div>
      <div class="card__meta">
        ${l.seller?.avatar ? `<img src="${esc(l.seller.avatar)}" alt="" class="avatar" loading="lazy" />` : ''}
        <span>${esc(l.seller?.name?.split(' ')[0] || '')}</span><span>·</span><span>${esc(l.location || '')}</span>
      </div>
    </div>
  </article>`;
}
export const skeletonCards = (n = 8) => Array.from({ length: n }, () => `
  <div class="skel-card"><div class="card__media skel"></div><div class="skel skel-line" style="width:70%"></div><div class="skel skel-line" style="width:40%"></div></div>`).join('');

export const emptyState = (title, text, cta = '') => `
  <div class="empty reveal"><div class="empty__art">~ ∅ ~</div><h3>${title}</h3><p class="muted">${text}</p>${cta}</div>`;

// ---------- Toasts ----------
export function toast(msg, { type = 'ok', image, sub, timeout = 3600 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${image ? `<img src="${src(image)}" alt="" />` : `<span class="toast__icon">${type === 'error' ? '!' : '✓'}</span>`}
    <div>${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); el.addEventListener('animationend', () => el.remove()); }, timeout);
}
export const toastError = (e) => toast(e.message || String(e), { type: 'error', sub: e.where ? `Problem in: ${e.where}` : undefined, timeout: 6000 });

// ---------- Modal ----------
export function openModal(html, { cls = '' } = {}) {
  const m = $('#modal');
  m.className = `modal ${cls}`;
  $('#modalBox').innerHTML = html;
  requestAnimationFrame(() => { m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); });
  return $('#modalBox');
}
export function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }
export function confirmDialog(title, text, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    const box = openModal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px">
        <button class="btn btn--sm" data-no>Cancel</button><button class="btn btn--ink btn--sm" data-yes>${esc(okLabel)}</button></div>`);
    box.querySelector('[data-yes]').onclick = () => { closeModal(); resolve(true); };
    box.querySelector('[data-no]').onclick = () => { closeModal(); resolve(false); };
  });
}

// ---------- Scroll reveal ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
export function reveal(root = document) {
  $$('.reveal:not(.in), .reveal-img:not(.in)', root).forEach((el) => (reduceMotion ? el.classList.add('in') : io.observe(el)));
}

// ---------- Count-up numbers ----------
export function countUp(el, to, { dur = 1600, fmt = (n) => Math.round(n).toLocaleString() } = {}) {
  if (reduceMotion) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 4)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Parallax ----------
let parallaxEls = [];
export function parallax(root = document) { parallaxEls = $$('[data-parallax]', root); onScroll(); }
function onScroll() {
  if (reduceMotion) return;
  for (const el of parallaxEls) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const speed = parseFloat(el.dataset.parallax) || 0.1;
    const mid = r.top + r.height / 2 - innerHeight / 2;
    el.style.transform = `translate3d(0, ${(-mid * speed).toFixed(1)}px, 0)`;
  }
}
addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });

// ---------- Magnetic buttons ----------
export function magnetic(root = document) {
  if (reduceMotion || matchMedia('(hover: none)').matches) return;
  $$('.magnetic', root).forEach((b) => {
    if (b.dataset.mag) return; b.dataset.mag = 1;
    b.addEventListener('mousemove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    b.addEventListener('mouseleave', () => { b.style.transform = ''; });
  });
}

// ---------- Fly-to-cart ----------
export function flyToCart(fromEl) {
  const target = $('#cartBtn');
  const img = fromEl?.closest('.card, .detail')?.querySelector('img');
  if (!img || !target || reduceMotion) return;
  const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
  const clone = img.cloneNode();
  clone.className = 'fly';
  Object.assign(clone.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.append(clone);
  requestAnimationFrame(() => Object.assign(clone.style, { left: b.left + 8 + 'px', top: b.top + 8 + 'px', width: '24px', height: '24px', opacity: '.3', borderRadius: '50%' }));
  setTimeout(() => clone.remove(), 820);
}

// ---------- Confetti ----------
export function confetti() {
  if (reduceMotion) return;
  const c = document.createElement('canvas');
  c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight;
  document.body.append(c);
  const ctx = c.getContext('2d');
  const colors = ['#e8ff6b', '#1a1a17', '#e2553a', '#ffffff', '#d4f03c'];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2, y: innerHeight / 2.4, vx: (Math.random() - 0.5) * 18, vy: Math.random() * -16 - 4,
    s: Math.random() * 8 + 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0],
  }));
  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (++frame < 180) requestAnimationFrame(tick); else c.remove();
  })();
}

// ---------- Button loading state ----------
export async function busy(btn, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

// ---------- Top progress bar ----------
const bar = () => $('#progress');
export function progressStart() { const b = bar(); b.style.opacity = 1; b.style.width = '30%'; setTimeout(() => (b.style.width = '70%'), 200); }
export function progressDone() { const b = bar(); b.style.width = '100%'; setTimeout(() => { b.style.opacity = 0; b.style.width = 0; }, 350); }
