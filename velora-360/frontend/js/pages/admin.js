import { api, $, $$, esc, mad, carImg, remember, hydrate, toast, modal, closeModal, BODY_LABEL } from '../app.js';

let token = sessionStorage.getItem('velora.admin') || '';
const authed = (path, opts = {}) => api(path, { ...opts, headers: { Authorization: 'Bearer ' + token } }).catch(e => {
  if (e.status === 401) { token = ''; sessionStorage.removeItem('velora.admin'); }
  throw e;
});

export default async function admin(app, { query }) {
  if (!token) return login(app);
  const tab = query.get('tab') || 'leads';
  app.innerHTML = `<div class="container adm"><h1>Dealer <span class="grad">admin</span></h1>
    <div class="adm-tabs"><a class="btn btn--sm ${tab === 'leads' ? 'on' : ''}" href="#/admin?tab=leads">Requests</a><a class="btn btn--sm ${tab === 'cars' ? 'on' : ''}" href="#/admin?tab=cars">Cars</a>
    <button class="btn btn--sm btn--ghost" id="logout" style="margin-left:auto">Log out</button></div><div id="pane">Loading…</div></div>`;
  $('#logout').onclick = () => { token = ''; sessionStorage.removeItem('velora.admin'); login(app); };
  try { await (tab === 'cars' ? cars : leads)($('#pane')); }
  catch (e) { if (e.status === 401) return login(app, e.message); throw e; }
}

function login(app, msg = '') {
  app.innerHTML = `<div class="container" style="max-width:420px;padding:12vh 0">
    <form class="panel" id="lf"><h3>Dealer login</h3><p class="muted" style="margin-bottom:16px">The password is printed in the server window at start-up (also in <code>backend/data/admin-password.txt</code>).</p>
    ${msg ? `<div class="form-error">${esc(msg)}</div>` : ''}<input class="input" type="password" name="pw" placeholder="Password" style="margin-bottom:12px" autofocus />
    <button class="btn btn--blue btn--block">Log in</button></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { token = (await api('/admin/login', { method: 'POST', body: JSON.stringify({ password: e.target.pw.value }) })).token; sessionStorage.setItem('velora.admin', token); admin(app, { query: new URLSearchParams() }); }
    catch (err) { login(app, err.message); }
  };
}

async function leads(el) {
  const { items } = await authed('/admin/leads');
  el.innerHTML = items.length ? items.map(l => `<div class="lead"><div>
      <span class="st st--${l.status}">${l.status}</span><b>${l.type === 'test-drive' ? '🚗 Test drive' : '💬 Quote'}</b> · ${esc(l.modelName)} <span class="muted">${esc(l.trim)} · ${esc(l.color)}</span>
      <small>${esc(l.name)} · <a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>${l.email ? ' · ' + esc(l.email) : ''}${l.city ? ' · ' + esc(l.city) : ''}${l.date ? ' · wants ' + esc(l.date) : ''}</small>
      ${l.finance ? `<small>Finance: ${l.finance.downPaymentPct}% down, ${l.finance.months} months ≈ ${mad(l.finance.monthly)}/month</small>` : ''}
      ${l.message ? `<small>“${esc(l.message)}”</small>` : ''}<small>${l.ref} · ${new Date(l.createdAt).toLocaleString()}</small></div>
      <select class="select" data-lead="${l.id}">${['new', 'contacted', 'done', 'lost'].map(s => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('')
    : '<div class="empty"><b>No requests yet</b>Test-drive and quote requests from the site appear here.</div>';
  $$('[data-lead]', el).forEach(s => (s.onchange = async () => {
    try { await authed('/admin/leads/' + s.dataset.lead, { method: 'PATCH', body: JSON.stringify({ status: s.value }) }); toast('Status updated'); leads(el); } catch (e) { toast(e.message, true); }
  }));
}

async function cars(el) {
  const [{ items }, { items: brands }] = await Promise.all([api('/models'), api('/brands')]);
  remember(items);
  el.innerHTML = `<button class="btn btn--blue" id="add" style="margin-bottom:16px">+ Add a car</button>` + items.map(m => `<div class="adm-car">${carImg(m, { w: 240, h: 150 })}
    <div><b>${esc(m.brandName)} ${esc(m.name)}</b><small>${BODY_LABEL[m.body]} · ${esc(m.fuel)} · ${m.power} hp · from ${mad(m.price)}</small></div>
    <div style="display:flex;gap:6px"><button class="btn btn--sm" data-edit="${m.id}">Edit</button><button class="btn btn--sm btn--ghost" data-del="${m.id}">Delete</button></div></div>`).join('');
  hydrate(el);
  $('#add').onclick = () => editor(null, brands, () => cars(el));
  $$('[data-edit]', el).forEach(b => (b.onclick = () => editor(items.find(m => m.id === b.dataset.edit), brands, () => cars(el))));
  $$('[data-del]', el).forEach(b => (b.onclick = async () => {
    if (!confirm('Delete this car from the showroom?')) return;
    try { await authed('/admin/models/' + b.dataset.del, { method: 'DELETE' }); toast('Car deleted'); cars(el); } catch (e) { toast(e.message, true); }
  }));
}

function editor(m, brands, done) {
  const v = m || { brand: brands[0].slug, body: 'sedan', year: 2026, fuel: 'Petrol', price: 300000, seats: 5, trunk: 450, power: 150, torque: 250, accel: 8.5, top: 210, rating: 4.5,
    dims: { length: 4600, width: 1830, height: 1450, wheelbase: 2750 }, colors: [{ name: 'Glacier White', hex: '#eef0f2' }], features: [], trims: [], drive: 'FWD', gearbox: 'Automatic', engine: '', consumption: '', summary: '' };
  const f = (k, label, type = 'number', val = v[k]) => `<div class="field"><label>${label}</label><input class="input" name="${k}" type="${type}" step="any" value="${esc(val ?? '')}" /></div>`;
  const box = modal(`<h3>${m ? 'Edit' : 'Add'} a car</h3><form id="ef" novalidate><div id="efErr"></div>
    <div class="row"><div class="field"><label>Brand</label><select name="brand">${brands.map(b => `<option value="${b.slug}" ${b.slug === v.brand ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>${f('name', 'Model name', 'text')}</div>
    <div class="row"><div class="field"><label>Body (sets the 3D shape)</label><select name="body">${Object.entries(BODY_LABEL).map(([k, l]) => `<option value="${k}" ${k === v.body ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Energy</label><select name="fuel">${['Petrol', 'Diesel', 'Hybrid', 'Electric'].map(x => `<option ${x === v.fuel ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div class="row">${f('price', 'Starting price (MAD)')}${f('year', 'Year')}</div>
    <div class="row">${f('power', 'Power (hp)')}${f('torque', 'Torque (Nm)')}</div>
    <div class="row">${f('accel', '0–100 km/h (s)')}${f('top', 'Top speed (km/h)')}</div>
    <div class="row">${f('seats', 'Seats')}${f('trunk', 'Boot (L)')}</div>
    <div class="row">${f('length', 'Length (mm)', 'number', v.dims.length)}${f('width', 'Width (mm)', 'number', v.dims.width)}</div>
    <div class="row">${f('height', 'Height (mm)', 'number', v.dims.height)}${f('wheelbase', 'Wheelbase (mm)', 'number', v.dims.wheelbase)}</div>
    <div class="row">${f('engine', 'Engine', 'text')}${f('consumption', 'Consumption or range', 'text')}</div>
    <div class="row">${f('gearbox', 'Gearbox', 'text')}${f('drive', 'Drive', 'text')}</div>
    <div class="field"><label>Colours, one per line: Name #hex</label><textarea name="colors" rows="3">${esc(v.colors.map(c => `${c.name} ${c.hex}`).join('\n'))}</textarea></div>
    <div class="field"><label>Versions, one per line: Name price</label><textarea name="trims" rows="2">${esc(v.trims.map(t => `${t.name} ${t.price}`).join('\n'))}</textarea></div>
    <div class="field"><label>Highlights, one per line</label><textarea name="features" rows="3">${esc(v.features.join('\n'))}</textarea></div>
    <div class="field"><label>Summary</label><textarea name="summary" rows="2">${esc(v.summary)}</textarea></div>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn--blue">Save</button></div></form>`);
  $('#ef', box).onsubmit = async (e) => {
    e.preventDefault();
    const F = e.target, val = (k) => F[k].value;
    const body = {
      brand: val('brand'), name: val('name'), body: val('body'), fuel: val('fuel'), rating: v.rating,
      ...Object.fromEntries(['price', 'year', 'power', 'torque', 'accel', 'top', 'seats', 'trunk'].map(k => [k, +val(k)])),
      dims: Object.fromEntries(['length', 'width', 'height', 'wheelbase'].map(k => [k, +val(k)])),
      engine: val('engine'), consumption: val('consumption'), gearbox: val('gearbox'), drive: val('drive'), summary: val('summary'),
      colors: val('colors').split('\n').map(l => l.trim().match(/^(.*?)\s*(#[0-9a-f]{6})$/i)).filter(Boolean).map(x => ({ name: x[1], hex: x[2] })),
      trims: val('trims').split('\n').map(l => l.trim().match(/^(.*?)\s+(\d+)$/)).filter(Boolean).map(x => ({ name: x[1], price: +x[2] })),
      features: val('features').split('\n').map(s => s.trim()).filter(Boolean),
    };
    try {
      await authed(m ? '/admin/models/' + m.id : '/admin/models', { method: m ? 'PUT' : 'POST', body: JSON.stringify(body) });
      closeModal(); toast(m ? 'Car updated' : 'Car added to the showroom'); done();
    } catch (err) { $('#efErr').innerHTML = `<div class="form-error">${esc(err.message)}</div>`; $('#efErr').scrollIntoView({ block: 'center' }); }
  };
}
