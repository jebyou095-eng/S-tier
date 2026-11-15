import { api, $, $$, esc, mad, card, remember, compare, modal, closeModal, toast, BODY_LABEL } from '../app.js';
import { createViewer, webglOK } from '../car3d.js';

const RATE = 0.065; // indicative yearly financing rate

export default async function carPage(app, { params }) {
  const { item: m, brand, similar } = await api(`/models/${params[0]}`);
  remember([m, ...similar]);
  let color = m.colors[0];
  let trim = m.trims[0];
  const ev = m.fuel === 'Electric';
  const stars = '★'.repeat(Math.round(m.rating)) + '☆'.repeat(5 - Math.round(m.rating));

  app.innerHTML = `
  <div class="container">
    <div class="car-top">
      <div><nav class="crumbs up"><a href="#/cars">Cars</a>/<a href="#/brand/${m.brand}">${esc(m.brandName)}</a>/<span>${esc(m.name)}</span></nav>
        <h1 class="up" style="--d:.05s">${esc(m.brandName)} <span>${esc(m.name)}</span></h1>
        <p class="muted up" style="--d:.1s;margin-top:8px">${m.year} · ${BODY_LABEL[m.body]} · ${esc(m.fuel)} · <span class="stars">${stars}</span> ${m.rating}</p></div>
      <div class="up" style="--d:.12s;text-align:right"><div class="muted" style="font-size:14px">From</div><div style="font:600 34px var(--head)">${mad(m.price)}</div></div>
    </div>

    <div class="viewer up" style="--d:.15s" id="viewer">
      ${webglOK ? '<div class="v-loading">Loading 360°…</div>' : `<div class="v-fallback">Your browser can't show 3D. Try a recent Chrome, Edge or Firefox.</div>`}
      <div class="v-top">
        <div class="seg" id="mode"><button class="on" data-mode="exterior">Exterior</button><button data-mode="interior">Interior</button></div>
        <div class="v-tools">
          <button id="tSpin" class="on" title="Auto-rotate" aria-label="Auto-rotate">⟲</button>
          <button id="tNight" title="Lights on / night mode" aria-label="Night mode">☾</button>
          <button id="tFs" title="Full screen" aria-label="Full screen">⤢</button>
        </div>
      </div>
      <div class="drag-hint" id="hint">⟲ Drag to look around · scroll to zoom</div>
      <div class="v-bottom">
        <div class="swatches" id="swatches">${m.colors.map((c, i) => `<button style="background:${c.hex}" data-i="${i}" class="${i ? '' : 'on'}" title="${esc(c.name)}" aria-label="${esc(c.name)}"></button>`).join('')}<span id="cName">${esc(color.name)}</span></div>
        <div class="views" id="views">${[['three', '¾'], ['front', 'Front'], ['side', 'Side'], ['rear', 'Rear'], ['top', 'Top']].map(([k, l]) => `<button data-v="${k}">${l}</button>`).join('')}</div>
      </div>
    </div>

    <div class="car-grid">
      <div>
        <div class="keys reveal">
          <div><b>${m.power}</b><small>hp</small></div><div><b>${m.accel}s</b><small>0–100 km/h</small></div>
          <div><b>${ev ? m.consumption.split(' ')[0] : m.top}</b><small>${ev ? 'km range' : 'km/h top speed'}</small></div><div><b>${m.seats}</b><small>seats</small></div>
        </div>
        <div class="panel reveal"><h3>Overview</h3><p style="font-size:17px;color:#c9cfdb">${esc(m.summary)}</p></div>
        <div class="panel reveal"><h3>Specifications</h3><table class="specs">
          ${[['Engine', m.engine], ['Power', `${m.power} hp`], ['Torque', `${m.torque} Nm`], ['Gearbox', m.gearbox], ['Drive', m.drive], ['0–100 km/h', `${m.accel} s`], ['Top speed', `${m.top} km/h`],
             [ev ? 'Range' : 'Consumption', m.consumption], ['Length × width × height', `${m.dims.length} × ${m.dims.width} × ${m.dims.height} mm`], ['Wheelbase', `${m.dims.wheelbase} mm`], ['Boot', `${m.trunk} L`], ['Seats', m.seats]]
             .map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
        <div class="panel reveal"><h3>Highlights</h3><ul class="feat">${m.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      </div>
      <aside class="side">
        <div class="panel reveal">
          <h3>Choose your version</h3>
          <div class="trims">${m.trims.map((t, i) => `<label class="trim"><input type="radio" name="trim" value="${i}" ${i ? '' : 'checked'}/><span>${esc(t.name)}</span><b>${mad(t.price)}</b></label>`).join('')}</div>
          <h3 style="font-size:18px;margin:6px 0 0">Monthly payment</h3>
          <div class="calc">
            <label>Down payment <b id="dpOut"></b></label><input type="range" id="dp" min="10" max="60" step="5" value="30" />
            <label>Duration <b id="moOut"></b></label><input type="range" id="mo" min="12" max="84" step="12" value="60" />
          </div>
          <div class="monthly"><span class="muted" style="font-size:13px">Estimated, ${(RATE * 100).toFixed(1)}% a year</span><b id="monthly"></b><span class="muted" style="font-size:13px">per month</span></div>
          <div style="display:grid;gap:8px;margin-top:18px">
            <button class="btn btn--blue btn--block" id="bTest">Book a test drive</button>
            <button class="btn btn--block" id="bQuote">Get a price quote</button>
            <button class="btn btn--ghost btn--block cmp-btn ${compare.has(m.id) ? 'on' : ''}" data-cmp="${m.id}" style="height:48px">${compare.has(m.id) ? '✓ Compare' : '+ Compare'}</button>
          </div>
        </div>
        <div class="panel reveal" style="--accent:${brand?.accent}"><span class="muted" style="font-size:13px">About the brand</span><h3 style="margin:4px 0 8px;color:${brand?.accent}">${esc(brand?.name)}</h3><p class="muted">${esc(brand?.tagline)} ${esc(brand?.country)}, since ${brand?.founded}.</p><a class="btn btn--sm" style="margin-top:14px" href="#/brand/${m.brand}">All ${esc(brand?.name)} models →</a></div>
      </aside>
    </div>
    ${similar.length ? `<section style="padding-bottom:96px"><div class="section__head"><h2 class="reveal">You may <span class="grad">also like</span></h2></div><div class="grid">${similar.map(card).join('')}</div></section>` : ''}
  </div>`;

  // ---------- Finance calculator ----------
  const calc = () => {
    const dp = +$('#dp').value, months = +$('#mo').value;
    const loan = trim.price * (1 - dp / 100), r = RATE / 12;
    const pay = loan * r / (1 - Math.pow(1 + r, -months));
    $('#dpOut').textContent = `${dp}% · ${mad(trim.price * dp / 100)}`;
    $('#moOut').textContent = `${months} months`;
    $('#monthly').textContent = mad(Math.round(pay));
    return { downPaymentPct: dp, months, monthly: Math.round(pay) };
  };
  $('#dp').oninput = calc; $('#mo').oninput = calc; calc();
  $$('input[name=trim]', app).forEach(i => (i.onchange = () => { trim = m.trims[+i.value]; calc(); }));

  // ---------- Lead forms ----------
  const leadForm = (type) => {
    const today = new Date().toISOString().slice(0, 10);
    const box = modal(`<h3>${type === 'test-drive' ? 'Book a test drive' : 'Get a price quote'}</h3>
      <p class="muted" style="margin-bottom:18px">${esc(m.brandName)} ${esc(m.name)} · ${esc(trim.name)} · ${esc(color.name)}</p>
      <form id="lf" novalidate><div id="lfErr"></div>
        <div class="row"><div class="field"><label>Full name</label><input class="input" name="name" autocomplete="name" /></div>
        <div class="field"><label>Phone</label><input class="input" name="phone" type="tel" placeholder="+212 6…" autocomplete="tel" /></div></div>
        <div class="row"><div class="field"><label>Email (optional)</label><input class="input" name="email" type="email" autocomplete="email" /></div>
        <div class="field"><label>City</label><input class="input" name="city" placeholder="Casablanca, Rabat…" /></div></div>
        ${type === 'test-drive' ? `<div class="field"><label>Preferred date</label><input class="input" name="date" type="date" min="${today}" value="${today}" /></div>` : ''}
        <div class="field"><label>Message (optional)</label><textarea name="message" rows="2"></textarea></div>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn--blue">Send request</button></div>
      </form>`);
    $('#lf', box).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector('.btn--blue');
      const missing = ['name', 'phone'].filter(k => !f[k].value.trim());
      $$('.input', f).forEach(i => i.classList.toggle('invalid', missing.includes(i.name)));
      if (missing.length) { $('#lfErr').innerHTML = '<div class="form-error">Please enter your name and phone number.</div>'; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await api('/leads', { method: 'POST', body: JSON.stringify({ type, modelId: m.id, trim: trim.name, color: color.name,
          name: f.name.value, phone: f.phone.value, email: f.email.value, city: f.city.value, date: f.date?.value, message: f.message.value, finance: calc() }) });
        box.innerHTML = `<div style="text-align:center"><div class="done-check">✓</div><h3>Request sent!</h3>
          <p class="muted">A dealer will call you shortly to ${type === 'test-drive' ? 'confirm your test drive' : 'send your personalised quote'}.</p>
          <p style="margin:16px 0;font:600 22px var(--head);letter-spacing:.08em">${esc(r.ref)}</p><button class="btn btn--blue" data-close>Done</button></div>`;
      } catch (err) { $('#lfErr').innerHTML = `<div class="form-error">${esc(err.message)}</div>`; btn.disabled = false; btn.textContent = 'Send request'; }
    };
  };
  $('#bTest').onclick = () => leadForm('test-drive');
  $('#bQuote').onclick = () => leadForm('quote');

  // ---------- 360° viewer ----------
  if (!webglOK) return;
  const el = $('#viewer');
  const v = createViewer(el, m, { color: color.hex });
  $('.v-loading', el)?.remove();
  el.querySelector('canvas').addEventListener('pointerdown', () => ($('#hint').style.opacity = 0), { once: true });
  $$('#swatches button').forEach(b => (b.onclick = () => {
    color = m.colors[+b.dataset.i]; v.setColor(color.hex); $('#cName').textContent = color.name;
    $$('#swatches button').forEach(x => x.classList.toggle('on', x === b));
  }));
  $$('#mode button').forEach(b => (b.onclick = () => {
    v.setMode(b.dataset.mode);
    $$('#mode button').forEach(x => x.classList.toggle('on', x === b));
    $('#views').style.visibility = b.dataset.mode === 'interior' ? 'hidden' : 'visible';
    $('#tSpin').classList.toggle('on', false);
    if (b.dataset.mode === 'interior') toast('You are in the driver\'s seat. Drag to look around.');
  }));
  $$('#views button').forEach(b => (b.onclick = () => { v.view(b.dataset.v); $('#tSpin').classList.remove('on'); }));
  $('#tSpin').onclick = () => { if (v.mode !== 'exterior') return; v.setAutoRotate(!v.autoRotate); $('#tSpin').classList.toggle('on', v.autoRotate); };
  $('#tNight').onclick = () => { const on = !$('#tNight').classList.contains('on'); v.setNight(on); $('#tNight').classList.toggle('on', on); };
  const fs = () => { el.classList.toggle('fs'); $('#tFs').textContent = el.classList.contains('fs') ? '✕' : '⤢'; };
  $('#tFs').onclick = fs;
  const esc_ = (e) => e.key === 'Escape' && el.classList.contains('fs') && fs();
  addEventListener('keydown', esc_);
  return () => { v.dispose(); removeEventListener('keydown', esc_); closeModal(); };
}
