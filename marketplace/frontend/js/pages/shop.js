import { get } from '../api.js';
import { remember } from '../store.js';
import { go } from '../router.js';
import { $, $$, card, skeletonCards, emptyState, esc, reveal, CONDITION_LABEL } from '../ui.js';

export default async function shop(app, { query }) {
  const q = query.get('q') || '';
  const category = query.get('category') || '';
  const conditions = (query.get('condition') || '').split(',').filter(Boolean);
  const sort = query.get('sort') || 'newest';
  const page = parseInt(query.get('page'), 10) || 1;

  const { items: cats, conditions: allConditions } = await get('/categories');
  const current = cats.find(c => c.slug === category);
  const title = q ? `Results for <em>“${esc(q)}”</em>` : current ? `${esc(current.name.split(' ')[0])} <em>${esc(current.name.split(' ').slice(1).join(' ') || 'finds')}</em>` : 'Shop <em>everything</em>';

  app.innerHTML = `
  <div class="container">
    <div class="shop-head">
      <span class="eyebrow fade-up">Marketplace</span>
      <h1 class="fade-up" style="--d:.08s">${title}</h1>
    </div>
    <div class="chips fade-up" style="--d:.16s">
      <button class="chip ${!category ? 'on' : ''}" data-cat="">All</button>
      ${cats.map(c => `<button class="chip ${c.slug === category ? 'on' : ''}" data-cat="${c.slug}">${esc(c.name)}<small>${c.count}</small></button>`).join('')}
    </div>
    <div class="shop" style="margin-top:28px">
      <aside class="filters" id="filters">
        <div><h4>Condition</h4>
          ${allConditions.map(c => `<label class="check"><input type="checkbox" value="${c}" ${conditions.includes(c) ? 'checked' : ''} data-cond /> ${CONDITION_LABEL[c]}</label>`).join('')}
        </div>
        <div><h4>Price (€)</h4>
          <div class="range"><input class="input" type="number" min="0" placeholder="Min" id="min" value="${esc(query.get('min') || '')}" />
          <input class="input" type="number" min="0" placeholder="Max" id="max" value="${esc(query.get('max') || '')}" /></div>
        </div>
        <button class="btn btn--ink btn--block" id="apply">Apply filters</button>
        <button class="link" id="clear" style="justify-self:start">Clear all</button>
      </aside>
      <div>
        <div class="toolbar">
          <span class="muted" id="count">Loading…</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn--sm filter-toggle" id="ft">Filters</button>
            <select class="select" id="sort" aria-label="Sort">
              ${[['newest', 'Newest'], ['popular', 'Most popular'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low']]
                .map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid" id="results">${skeletonCards(9)}</div>
        <div class="pager" id="pager"></div>
      </div>
    </div>
  </div>`;

  const update = (patch) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    if (!('page' in patch)) p.delete('page');
    go('#/shop' + (p.toString() ? '?' + p : ''));
  };

  $$('[data-cat]', app).forEach(b => (b.onclick = () => update({ category: b.dataset.cat })));
  $('#sort').onchange = (e) => update({ sort: e.target.value });
  $('#ft').onclick = () => $('#filters').classList.toggle('open');
  $('#apply').onclick = () => update({
    condition: $$('[data-cond]:checked', app).map(i => i.value).join(','),
    min: $('#min').value, max: $('#max').value,
  });
  $('#clear').onclick = () => go('#/shop' + (q ? '?q=' + encodeURIComponent(q) : ''));

  const params = new URLSearchParams({ limit: 12, page, sort });
  for (const k of ['q', 'category', 'condition', 'min', 'max']) if (query.get(k)) params.set(k, query.get(k));
  const res = await get('/listings?' + params);
  remember(res.items);

  $('#count').textContent = `${res.total} ${res.total === 1 ? 'item' : 'items'}`;
  $('#results').innerHTML = res.items.length
    ? res.items.map(card).join('')
    : `<div style="grid-column:1/-1">${emptyState('Nothing matches yet', 'Try a different search or clear some filters.', '<a class="btn btn--ink" href="#/shop">Clear filters</a>')}</div>`;
  $('#pager').innerHTML = res.pages > 1
    ? Array.from({ length: res.pages }, (_, i) => `<button class="${i + 1 === page ? 'on' : ''}" data-page="${i + 1}">${i + 1}</button>`).join('')
    : '';
  $$('[data-page]', app).forEach(b => (b.onclick = () => update({ page: b.dataset.page })));
  reveal(app);
}
