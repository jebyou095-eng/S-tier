import { api, $, $$, esc, mad, card, remember, hydrate, go, BODY_LABEL, skeletons } from '../app.js';

export default async function cars(app, { params, query, path }) {
  const brandSlug = path.startsWith('/brand/') ? params[0] : null;
  const { items: brands } = await api('/brands');
  const brand = brandSlug ? brands.find(b => b.slug === brandSlug) : null;
  if (brandSlug && !brand) throw Object.assign(new Error('Brand not found'), { status: 404 });
  const q = Object.fromEntries(query);
  if (brand) q.brand = brand.slug;
  const sel = (k) => (q[k] || '').split(',').filter(Boolean);
  const maxPrice = 2000000;

  const title = brand ? `${esc(brand.name)}` : q.q ? `Results for “${esc(q.q)}”` : q.fuel === 'Electric' ? 'Electric <span class="grad">cars</span>' : q.body ? `${BODY_LABEL[q.body] || 'Cars'}<span class="grad">s</span>` : 'All <span class="grad">cars</span>';

  app.innerHTML = `
  <div class="container">
    <div class="browse-head">
      <span class="eyebrow up">${brand ? `${esc(brand.country)} · since ${brand.founded}` : 'New cars · 2026'}</span>
      <h1 class="up" style="--d:.06s">${title}</h1>
      ${brand ? `<p class="muted up" style="--d:.1s;margin-top:10px;font-size:18px">${esc(brand.tagline)}</p>` : ''}
    </div>
    <div class="browse">
      <aside class="filters" id="filters">
        ${brand ? '' : `<div><h4>Brand</h4>${brands.map(b => `<label class="chk"><input type="checkbox" name="brand" value="${b.slug}" ${sel('brand').includes(b.slug) ? 'checked' : ''}/>${esc(b.name)}<small>${b.count}</small></label>`).join('')}</div>`}
        <div><h4>Body type</h4>${Object.entries(BODY_LABEL).map(([k, v]) => `<label class="chk"><input type="checkbox" name="body" value="${k}" ${sel('body').includes(k) ? 'checked' : ''}/>${v}</label>`).join('')}</div>
        <div><h4>Energy</h4>${['Petrol', 'Diesel', 'Hybrid', 'Electric'].map(f => `<label class="chk"><input type="checkbox" name="fuel" value="${f}" ${sel('fuel').includes(f) ? 'checked' : ''}/>${f}</label>`).join('')}</div>
        <div><h4>Max price</h4><input type="range" id="max" min="150000" max="${maxPrice}" step="50000" value="${q.max || maxPrice}" /><div class="range-out"><span>150k</span><b id="maxOut"></b></div></div>
        <div><h4>Seats</h4><select class="select" id="seats" style="width:100%"><option value="">Any</option>${[2, 4, 5, 7].map(s => `<option value="${s}" ${q.seats == s ? 'selected' : ''}>${s}+ seats</option>`).join('')}</select></div>
        <button class="btn btn--ghost" id="reset">Reset filters</button>
      </aside>
      <div>
        <div class="toolbar"><span class="muted" id="count">Loading…</span>
          <div style="display:flex;gap:8px"><button class="btn btn--sm ftoggle" id="ft">Filters</button>
          <select class="select" id="sort">${[['name', 'Brand A–Z'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['power', 'Most powerful']].map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="grid" id="results">${skeletons(6)}</div>
      </div>
    </div>
  </div>`;

  const out = () => { const v = +$('#max').value; $('#maxOut').textContent = v >= maxPrice ? 'Any' : mad(v); };
  out();
  const apply = () => {
    const p = new URLSearchParams();
    for (const k of ['brand', 'body', 'fuel']) { const v = $$(`input[name=${k}]:checked`, app).map(i => i.value).join(','); if (v && !(brand && k === 'brand')) p.set(k, v); }
    if (+$('#max').value < maxPrice) p.set('max', $('#max').value);
    if ($('#seats').value) p.set('seats', $('#seats').value);
    if ($('#sort').value !== 'name') p.set('sort', $('#sort').value);
    if (q.q) p.set('q', q.q);
    history.replaceState(null, '', `#${path}${p.toString() ? '?' + p : ''}`);
    load(p);
  };
  $$('input[type=checkbox]', app).forEach(i => (i.onchange = apply));
  $('#max').oninput = out; $('#max').onchange = apply;
  $('#seats').onchange = apply; $('#sort').onchange = apply;
  $('#ft').onclick = () => $('#filters').classList.toggle('open');
  $('#reset').onclick = () => go(brand ? `#/brand/${brand.slug}` : '#/cars');

  async function load(p) {
    if (brand) p.set('brand', brand.slug);
    const res = await api('/models?' + p);
    remember(res.items);
    $('#count').textContent = `${res.total} ${res.total === 1 ? 'car' : 'cars'}`;
    $('#results').innerHTML = res.items.length ? res.items.map(card).join('') : `<div class="empty"><b>No cars match</b>Try removing a filter.</div>`;
    hydrate(app);
  }
  await load(new URLSearchParams(Object.entries(q)));
}
