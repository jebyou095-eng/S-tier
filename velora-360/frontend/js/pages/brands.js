import { api, esc, carImg, remember } from '../app.js';

export default async function brands(app) {
  const [{ items: brands }, { items: cars }] = await Promise.all([api('/brands'), api('/models')]);
  remember(cars);
  app.innerHTML = `<div class="container" style="padding-bottom:96px">
    <div class="browse-head"><span class="eyebrow up">${brands.length} brands</span><h1 class="up" style="--d:.06s">All <span class="grad">brands</span></h1></div>
    <div class="grid">${brands.map((b, i) => {
      const lead = cars.filter(c => c.brand === b.slug).sort((x, y) => y.price - x.price)[0];
      return `<a class="card reveal" style="--d:${(i % 3) * 0.08}s" href="#/brand/${b.slug}">
        <div class="card__img">${lead ? carImg(lead, { angle: 'three' }) : ''}</div>
        <div class="card__body"><div class="card__brand">${esc(b.country)} · since ${b.founded}</div><h3 style="color:${b.accent}">${esc(b.name)}</h3>
        <p class="muted" style="margin-bottom:14px">${esc(b.tagline)}</p><div class="card__foot"><span class="muted">${b.count} models</span><span class="btn btn--sm">Explore →</span></div></div></a>`;
    }).join('')}</div></div>`;
}
