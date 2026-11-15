import { API_URL, RESTAURANT as R, PHOTOS } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(R.mapsQuery)}`;

// ---------- API (every error says whether the frontend or backend is at fault) ----------
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(API_URL + '/api' + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  } catch (e) {
    console.error(`[frontend → backend] Impossible de joindre ${API_URL}/api${path}. Le backend est-il lancé ?`, e);
    const b = $('#apiBanner');
    b.hidden = false;
    b.innerHTML = `⚠ Le site n’arrive pas à joindre le serveur (<code>${esc(API_URL)}</code>). Lancez le backend : <code>cd backend && npm start</code>`;
    throw new Error('Le serveur est injoignable pour le moment. Réessayez ou appelez-nous.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn(`[backend erreur] ${res.status} ${data.where || path}: ${data.error}`);
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }
  return data;
}
export { api };

// ---------- Images: show a patterned tile if a photo link is broken ----------
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement) {
    console.warn('[frontend] Photo introuvable :', e.target.src);
    e.target.parentElement?.classList.add('ph-fallback');
  }
}, true);

// ---------- Loader ----------
const hideLoader = () => $('#loader').classList.add('gone');
addEventListener('load', () => setTimeout(hideLoader, 300));
setTimeout(hideLoader, 2200); // never block the page if a photo is slow

// ---------- Fill content from config ----------
$('#heroCuisine').textContent = R.cuisine;
$('#heroCity').textContent = R.city;
const stars = '★'.repeat(Math.round(R.rating)) + '☆'.repeat(5 - Math.round(R.rating));
$('#ratingStars').textContent = stars;
$('#ratingValue').textContent = R.rating.toLocaleString('fr-FR');
$('#ratingCount').textContent = `· ${R.reviews.toLocaleString('fr-FR')} avis Google`;
$('#ratingBadge').href = mapsUrl;
$('#aboutA').src = PHOTOS.about[0];
$('#aboutB').src = PHOTOS.about[1];
$('#teaImg').src = PHOTOS.tea;
$('#addr').textContent = R.address;
$('#hoursInline').textContent = R.hours.map(([d, h]) => `${d} : ${h}`).join(' · ');
$('#price').textContent = `${R.priceRange} par personne`;
$('#year').textContent = new Date().getFullYear();
$('#map').src = `https://www.google.com/maps?q=${encodeURIComponent(R.mapsQuery)}&output=embed`;
const telHref = R.phone ? `tel:${R.phone.replace(/\s/g, '')}` : mapsUrl;
for (const id of ['callBtn', 'callBtn2', 'footCall', 'mCall']) {
  const a = $('#' + id); a.href = telHref;
  if (!R.phone) { a.target = '_blank'; a.rel = 'noopener'; }
}
for (const id of ['routeBtn', 'footRoute', 'mRoute']) $('#' + id).href = mapsUrl;
if (R.phone) $('#callBtn').textContent = `Appeler le ${R.phone}`;

$('#ribbon').innerHTML = Array(2).fill(['Tajines', 'Couscous du vendredi', 'Thé à la menthe', 'Terrasse', 'Salon privé', 'Cocktails maison', 'Pastilla'].map(t => `<span>${t}</span>`).join('')).join('');

// ---------- Open / closed pill ----------
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function openState() {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const open = m >= toMin(R.open) && m < toMin(R.close);
  const pill = $('#openPill');
  pill.classList.toggle('closed', !open);
  pill.innerHTML = `<i></i>${open ? `Ouvert · ferme à ${R.close.replace(':', 'h')}` : `Fermé · ouvre à ${R.open.replace(':', 'h')}`}`;
}
openState(); setInterval(openState, 60000);
$('#hoursBox').innerHTML = R.hours.map(([d, h]) => `<div class="today"><span>${d}</span><b>${h}</b></div>`).join('');

// ---------- Hero slideshow ----------
const slides = $('#heroSlides'), dots = $('#heroDots');
slides.innerHTML = PHOTOS.hero.map((src, i) => `<img src="${esc(src)}" alt="" ${i ? 'loading="lazy"' : ''} />`).join('');
dots.innerHTML = PHOTOS.hero.map((_, i) => `<button aria-label="Photo ${i + 1}"></button>`).join('');
let cur = -1, timer;
function show(i) {
  cur = (i + PHOTOS.hero.length) % PHOTOS.hero.length;
  $$('img', slides).forEach((im, k) => im.classList.toggle('on', k === cur));
  $$('button', dots).forEach((b, k) => { b.classList.remove('on'); if (k === cur) { void b.offsetWidth; b.classList.add('on'); } });
  clearTimeout(timer); timer = setTimeout(() => show(cur + 1), 6000);
}
$$('button', dots).forEach((b, k) => (b.onclick = () => show(k)));
show(0);

// ---------- Nav ----------
const nav = $('#nav');
const onScroll = () => {
  nav.classList.toggle('solid', scrollY > 60);
  $('.mobile-bar').classList.toggle('show', scrollY > innerHeight * 0.6);
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();
$('#burger').onclick = () => { $('#burger').classList.toggle('open'); $('#navLinks').classList.toggle('open'); };
$$('#navLinks a').forEach(a => a.addEventListener('click', () => { $('#burger').classList.remove('open'); $('#navLinks').classList.remove('open'); }));
const sections = $$('main section[id]');
const spy = new IntersectionObserver((es) => es.forEach(e => {
  if (e.isIntersecting) $$('#navLinks a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
sections.forEach(s => spy.observe(s));

// ---------- Scroll reveal + counters + parallax ----------
const io = new IntersectionObserver((es) => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in'); io.unobserve(e.target);
  const n = e.target.querySelector('[data-count]'); if (n) count(n);
}), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
// Fully clipped elements never count as "visible", so image reveals are triggered by their parent instead.
const ioImg = new IntersectionObserver((es) => es.forEach(e => {
  if (!e.isIntersecting) return;
  $$(':scope > .reveal-img', e.target).forEach(el => el.classList.add('in'));
  ioImg.unobserve(e.target);
}), { threshold: 0.12 });
const observe = (root = document) => {
  $$('.reveal:not(.in)', root).forEach(el => (reduce ? (el.classList.add('in'), el.querySelector('[data-count]') && count(el.querySelector('[data-count]'))) : io.observe(el)));
  $$('.reveal-img:not(.in)', root).forEach(el => (reduce ? el.classList.add('in') : ioImg.observe(el.parentElement)));
};
function count(el) {
  const to = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0, t0 = performance.now();
  const fmt = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (el.dataset.plus !== undefined ? '+' : '');
  if (reduce) { el.textContent = fmt(to); return; }
  const step = (t) => { const p = Math.min(1, (t - t0) / 1800); el.textContent = fmt(to * (1 - Math.pow(1 - p, 4))); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const parallax = $$('[data-parallax]');
addEventListener('scroll', () => requestAnimationFrame(() => {
  if (reduce) return;
  parallax.forEach(el => {
    const r = el.parentElement.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    el.style.transform = `translate3d(0, ${((r.top + r.height / 2 - innerHeight / 2) * -+el.dataset.parallax).toFixed(1)}px, 0)`;
  });
}), { passive: true });

// ---------- Signatures + gallery ----------
$('#signatures').innerHTML = PHOTOS.signature.map((s, i) => `
  <article class="sig reveal" style="--d:${i * 0.12}s">
    <div class="sig__img"><img src="${esc(s.img)}" alt="${esc(s.title)}" loading="lazy" /><span class="sig__num">0${i + 1}</span></div>
    <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
  </article>`).join('');
$('#gallery').innerHTML = PHOTOS.gallery.map((g, i) => `
  <figure class="reveal" style="--d:${(i % 3) * 0.1}s"><img src="${esc(g.img)}" alt="${esc(g.alt)}" loading="lazy" /><figcaption>${esc(g.alt)}</figcaption></figure>`).join('');
const lb = $('#lightbox');
$('#gallery').addEventListener('click', (e) => {
  const img = e.target.closest('figure')?.querySelector('img');
  if (!img || img.parentElement.classList.contains('ph-fallback')) return;
  $('img', lb).src = img.src; $('img', lb).alt = img.alt; lb.hidden = false;
});
lb.onclick = () => (lb.hidden = true);
addEventListener('keydown', (e) => e.key === 'Escape' && (lb.hidden = true));

// ---------- Menu (from the backend) ----------
async function loadMenu() {
  try {
    const { categories } = await api('/menu');
    const tabs = $('#menuTabs');
    tabs.innerHTML = categories.map((c, i) => `<button role="tab" class="${i ? '' : 'on'}" data-cat="${c.id}">${esc(c.title)}</button>`).join('');
    const render = (cat) => {
      $('#menuList').innerHTML = `<p class="menu__sub">${esc(cat.subtitle)}</p><div class="menu__grid">${cat.items.map((d, i) => `
        <div class="dish" style="--d:${i * 0.06}s">
          <div class="dish__row"><span class="dish__name">${esc(d.name)}</span><span class="dish__dots"></span><span class="dish__price">${d.price}<small>MAD</small></span></div>
          <p>${esc(d.desc)}</p>${d.tags.map(t => `<span class="tag ${t === 'signature' ? 'tag--signature' : ''}">${esc(t)}</span>`).join('')}
        </div>`).join('')}</div>`;
    };
    render(categories[0]);
    $$('button', tabs).forEach(b => (b.onclick = () => {
      $$('button', tabs).forEach(x => x.classList.toggle('on', x === b));
      render(categories.find(c => c.id === b.dataset.cat));
    }));
  } catch (e) {
    $('#menuList').innerHTML = `<div class="menu__loading">La carte n’a pas pu être chargée. ${esc(e.message)}</div>`;
  }
}
loadMenu();

// ---------- Booking ----------
const form = $('#bookForm');
let guests = 2;
$('#guests').innerHTML = [1, 2, 3, 4, 5, 6, 7, '8+'].map(n => `<button type="button" data-g="${n}" class="${n === 2 ? 'on' : ''}">${n}</button>`).join('');
$$('#guests button').forEach(b => (b.onclick = () => {
  let n = b.dataset.g;
  if (n === '8+') {
    const v = parseInt(prompt('Combien de personnes ? (8 à 40)', '10'), 10);
    if (!(v >= 8 && v <= 40)) return;
    n = v; b.textContent = v;
    if (v > 12) { form.seating.value = 'salon'; toast('Pour un groupe de plus de 12 personnes, nous vous proposons le salon privé.'); }
  }
  guests = +n;
  $$('#guests button').forEach(x => x.classList.toggle('on', x === b));
}));
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
form.date.min = iso(new Date());
form.date.max = iso(new Date(Date.now() + 90 * 864e5));
form.date.value = iso(new Date());
function fillTimes() {
  const slots = [];
  for (let m = toMin(R.open); m <= toMin(R.close) - 30; m += 30) slots.push(`${String(m / 60 | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  const now = new Date(), isToday = form.date.value === iso(now), nowM = now.getHours() * 60 + now.getMinutes() + 30;
  const ok = slots.filter(s => !isToday || toMin(s) >= nowM);
  form.time.innerHTML = ok.length ? ok.map(s => `<option ${s === '20:00' ? 'selected' : ''}>${s}</option>`).join('') : '<option value="">Complet aujourd’hui, choisissez une autre date</option>';
}
form.date.onchange = fillTimes; fillTimes();

const step = (n) => {
  $$('.fstep', form).forEach(s => (s.hidden = +s.dataset.step !== n));
  $$('.steps span', form).forEach((s, i) => s.classList.toggle('on', i < n));
};
const seatingLabel = () => $(`label[for="s-${form.seating.value}"] b`).textContent;
$('#next').onclick = () => {
  form.date.classList.toggle('invalid', !form.date.value);
  form.time.classList.toggle('invalid', !form.time.value);
  if (!form.date.value || !form.time.value) return;
  const d = new Date(form.date.value + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#recap').innerHTML = `<span><b>${guests}</b> pers.</span><span><b>${d}</b></span><span>à <b>${form.time.value.replace(':', 'h')}</b></span><span>${seatingLabel()}</span>`;
  step(2); form.name.focus();
};
$('#back').onclick = () => step(1);
form.onsubmit = async (e) => {
  e.preventDefault();
  const err = $('#bookErr'); err.hidden = true;
  const need = ['name', 'phone'].filter(k => !form[k].value.trim());
  $$('input', form).forEach(i => i.classList.toggle('invalid', need.includes(i.name)));
  if (need.length) { err.textContent = 'Merci d’indiquer votre nom et votre téléphone.'; err.hidden = false; return; }
  const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Envoi…';
  try {
    const { reservation: r } = await api('/reservations', { method: 'POST', body: JSON.stringify({
      name: form.name.value, phone: form.phone.value, email: form.email.value, occasion: form.occasion.value, notes: form.notes.value,
      date: form.date.value, time: form.time.value, guests, seating: form.seating.value }) });
    const d = new Date(r.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('[data-step="3"]', form).innerHTML = `<div class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></div>
      <h3>Merci, ${esc(r.name.split(' ')[0])} !</h3><p>Votre demande pour <b>${r.guests} pers.</b> le <b>${d}</b> à <b>${r.time.replace(':', 'h')}</b> (${esc(r.seating)}) est bien reçue.<br/>Nous vous appelons pour confirmer.</p>
      <div class="code">${esc(r.code)}</div><br/><button type="button" class="btn btn--dark" id="again">Nouvelle réservation</button>`;
    step(3); $$('.steps span', form).forEach(s => s.classList.add('on'));
    $('#again').onclick = () => { form.reset(); form.date.value = iso(new Date()); fillTimes(); step(1); };
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Confirmer la réservation'; }
};

// ---------- Contact ----------
$('#contactForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await api('/contact', { method: 'POST', body: JSON.stringify({ name: f.name.value, contact: f.contact.value, message: f.message.value }) });
    f.reset(); toast('Merci ! Votre message a bien été envoyé.');
  } catch (ex) { toast(ex.message); } finally { btn.disabled = false; }
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4500);
}

observe();
addEventListener('error', (e) => e.message && console.error('[frontend] Erreur :', e.message, `${e.filename}:${e.lineno}`));
