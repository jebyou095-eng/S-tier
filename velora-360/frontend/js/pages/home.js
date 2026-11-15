import { api, $, $$, esc, mad, card, carImg, remember, hydrate, go, BODY_LABEL } from '../app.js';
import { createViewer, webglOK } from '../car3d.js';

const HERO_IDS = ['novara-giro', 'solano-voltra', 'hadley-sovereign', 'kestrel-ridge'];

export default async function home(app) {
  const [{ items: brands }, { items: cars }] = await Promise.all([api('/brands'), api('/models')]);
  remember(cars);
  const heroCars = HERO_IDS.map(id => cars.find(c => c.id === id)).filter(Boolean);
  if (!heroCars.length) heroCars.push(...cars.slice(0, 3));
  const featured = [...cars].sort((a, b) => b.rating - a.rating).slice(0, 6);
  const bodyRep = Object.keys(BODY_LABEL).map(b => cars.find(c => c.body === b)).filter(Boolean);

  app.innerHTML = `
  <section class="container hero">
    <div class="hero__text">
      <span class="eyebrow up" style="--d:.05s">The 360° car showroom</span>
      <h1><span class="line"><span style="--d:.1s">Walk around</span></span><span class="line"><span style="--d:.2s">every car.</span></span><span class="line"><span class="grad" style="--d:.3s">Before the dealer.</span></span></h1>
      <p class="lead up" style="--d:.45s">Spin ${cars.length} new models in 360°, step inside the cabin, compare them side by side and book a test drive, all in one place.</p>
      <form class="finder up" style="--d:.55s" id="finder">
        <select name="brand" aria-label="Brand"><option value="">Any brand</option>${brands.map(b => `<option value="${b.slug}">${esc(b.name)}</option>`).join('')}</select>
        <select name="body" aria-label="Body type"><option value="">Any body</option>${Object.entries(BODY_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select name="max" aria-label="Budget"><option value="">Any budget</option><option value="250000">Up to 250 000 MAD</option><option value="400000">Up to 400 000 MAD</option><option value="700000">Up to 700 000 MAD</option><option value="1000000">Up to 1 000 000 MAD</option></select>
        <button class="btn btn--blue">Search</button>
      </form>
    </div>
    <div class="hero__stage up" style="--d:.2s" id="stage">
      <span class="tag tag--dark" id="heroTag"></span>
      <div class="drag-hint" id="hint">⟲ Drag to spin</div>
      <a class="hero__badge" id="heroBadge"></a>
    </div>
  </section>

  <section class="section container">
    <div class="section__head"><div class="reveal"><span class="eyebrow">Brands</span><h2>Pick a <span class="grad">maker</span></h2></div><a href="#/brands" class="btn btn--ghost reveal">All brands →</a></div>
    <div class="brands">${brands.map((b, i) => `<a class="brand reveal" style="--accent:${b.accent};--d:${i * 0.05}s" href="#/brand/${b.slug}"><span class="brand__mark">${esc(b.name[0])}</span><b>${esc(b.name)}</b><small>${b.count} models · ${esc(b.country)}</small></a>`).join('')}</div>
  </section>

  <section class="container" style="padding-bottom:40px">
    <div class="section__head"><div class="reveal"><span class="eyebrow">Body type</span><h2>What do you <span class="grad">drive?</span></h2></div></div>
    <div class="bodies">${bodyRep.map((m, i) => `<a class="body-tile reveal" style="--d:${i * 0.06}s" href="#/cars?body=${m.body}"><div class="img">${carImg(m, { angle: 'side', w: 520, h: 292 })}</div><b>${BODY_LABEL[m.body]}</b></a>`).join('')}</div>
  </section>

  <section class="section container">
    <div class="section__head"><div class="reveal"><span class="eyebrow">Top rated</span><h2>Most loved <span class="grad">this year</span></h2></div><a href="#/cars" class="btn btn--ghost reveal">Browse all ${cars.length} cars →</a></div>
    <div class="grid">${featured.map(card).join('')}</div>
  </section>

  <section class="container" style="padding-bottom:96px">
    <div class="band">
      <div class="reveal"><span class="ico">⟲</span><h3>True 360°, inside & out</h3><p>Spin every car, change its colour, switch on the lights and sit in the driver's seat.</p></div>
      <div class="reveal" style="--d:.08s"><span class="ico">⇄</span><h3>Compare side by side</h3><p>Put up to three cars next to each other. We highlight the winner on every spec.</p></div>
      <div class="reveal" style="--d:.16s"><span class="ico">✓</span><h3>Book a test drive</h3><p>Found the one? Request a test drive or a financing quote in under a minute.</p></div>
    </div>
  </section>`;

  $('#finder').onsubmit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
    go('#/cars' + (p.toString() ? '?' + p : ''));
  };

  // Live 3D hero that cycles through a few cars
  const stage = $('#stage');
  if (!webglOK) { stage.insertAdjacentHTML('beforeend', `<div class="v-fallback">Your browser can't show 3D. Try Chrome, Edge or Firefox.</div>`); return; }
  let viewer = null, idx = 0, timer;
  const show = (i) => {
    const m = heroCars[(idx = (i + heroCars.length) % heroCars.length)];
    viewer?.dispose();
    viewer = createViewer(stage, m, { color: m.colors[0].hex });
    stage.querySelector('canvas').addEventListener('pointerdown', () => { $('#hint').style.opacity = 0; clearInterval(timer); }, { once: true });
    $('#heroTag').textContent = `${m.brandName} ${m.name}`;
    const badge = $('#heroBadge'); badge.href = `#/car/${m.id}`;
    badge.innerHTML = `<span class="muted">From</span> <b>${mad(m.price)}</b> <span>→</span>`;
  };
  show(0);
  timer = setInterval(() => show(idx + 1), 9000);
  return () => { clearInterval(timer); viewer?.dispose(); };
}
