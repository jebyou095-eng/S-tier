import { api, $, $$, esc, mad, carImg, remember, compare, hydrate, BODY_LABEL } from '../app.js';

// Rows: label, value getter, which direction wins (1 = higher is better, -1 = lower is better, 0 = no winner)
const ROWS = [
  ['Starting price', m => m.price, -1, mad], ['Body', m => BODY_LABEL[m.body], 0], ['Energy', m => m.fuel, 0],
  ['Power', m => m.power, 1, v => `${v} hp`], ['Torque', m => m.torque, 1, v => `${v} Nm`], ['0–100 km/h', m => m.accel, -1, v => `${v} s`],
  ['Top speed', m => m.top, 1, v => `${v} km/h`], ['Consumption / range', m => m.consumption, 0], ['Gearbox', m => m.gearbox, 0], ['Drive', m => m.drive, 0],
  ['Seats', m => m.seats, 1], ['Boot', m => m.trunk, 1, v => `${v} L`], ['Length', m => m.dims.length, 0, v => `${v} mm`], ['Rating', m => m.rating, 1, v => `${v} ★`],
];

export default async function comparePage(app) {
  const { items: all } = await api('/models');
  remember(all);
  const draw = () => {
    compare.ids = compare.ids.filter(id => all.some(m => m.id === id));
    const cars = compare.ids.map(id => all.find(m => m.id === id));
    const slots = Math.min(3, cars.length + 1);
    const options = all.filter(m => !compare.has(m.id)).map(m => `<option value="${m.id}">${esc(m.brandName)} ${esc(m.name)}</option>`).join('');
    const head = Array.from({ length: slots }, (_, i) => {
      const m = cars[i];
      return m ? `<td class="cmp-car"><a href="#/car/${m.id}">${carImg(m, { w: 560, h: 350 })}</a><small>${esc(m.brandName)}</small><h3>${esc(m.name)}</h3>
        <button class="btn btn--sm btn--ghost" style="margin-top:8px" data-rm="${m.id}">Remove</button></td>`
        : `<td><div class="cmp-add"><select id="addCar"><option value="">+ Add a car</option>${options}</select></div></td>`;
    }).join('');
    const body = cars.length < 2 ? '' : ROWS.map(([label, get, dir, fmt = v => v]) => {
      const vals = cars.map(get);
      const best = dir && vals.every(v => typeof v === 'number') ? (dir > 0 ? Math.max(...vals) : Math.min(...vals)) : null;
      return `<tr><th>${label}</th>${vals.map(v => `<td class="${best !== null && v === best && new Set(vals).size > 1 ? 'best' : ''}">${esc(fmt(v))}</td>`).join('')}${slots > cars.length ? '<td></td>' : ''}</tr>`;
    }).join('') + `<tr><th>Highlights</th>${cars.map(m => `<td><small class="muted">${m.features.slice(0, 4).map(esc).join('<br/>')}</small></td>`).join('')}${slots > cars.length ? '<td></td>' : ''}</tr>
      <tr><th></th>${cars.map(m => `<td><a class="btn btn--blue btn--sm" href="#/car/${m.id}">View in 360°</a></td>`).join('')}${slots > cars.length ? '<td></td>' : ''}</tr>`;
    app.innerHTML = `<div class="container cmp">
      <span class="eyebrow up">Side by side</span><h1 class="up" style="--d:.05s">Compare <span class="grad">cars</span></h1>
      <p class="muted up" style="--d:.1s">${cars.length < 2 ? 'Add at least two cars to see them side by side. The best value on each line is highlighted in green.' : 'The best value on each line is highlighted in green.'}</p>
      <div class="cmp-scroll up" style="--d:.15s"><table class="cmp-table"><tr><th></th>${head}</tr>${body}</table></div></div>`;
    $('#addCar')?.addEventListener('change', (e) => { if (e.target.value) { compare.toggle(e.target.value); draw(); } });
    $$('[data-rm]', app).forEach(b => (b.onclick = () => { compare.toggle(b.dataset.rm); draw(); }));
    hydrate(app);
  };
  draw();
}
