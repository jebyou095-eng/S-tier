import { get, patch, del } from '../api.js';
import { auth, remember } from '../store.js';
import { go } from '../router.js';
import { $, $$, esc, money, money2, src, card, avatar, toast, toastError, emptyState, confirmDialog, countUp, busy, reveal, dateFmt } from '../ui.js';

const TABS = [['overview', 'Overview'], ['listings', 'My listings'], ['orders', 'Purchases'], ['sales', 'Sales'], ['favorites', 'Saved'], ['settings', 'Settings']];

export default async function account(app, { params }) {
  if (!auth.loggedIn) { go('#/login?next=' + encodeURIComponent(location.hash)); return; }
  const tab = TABS.some(t => t[0] === params.tab) ? params.tab : 'overview';
  const u = auth.user;
  app.innerHTML = `
  <div class="container">
    <div class="acct-head fade-up">${avatar(u, 'avatar--lg')}
      <div><span class="eyebrow">Your dashboard</span><h1>Hi, <em>${esc(u.name.split(' ')[0])}</em></h1></div>
      <a href="#/sell" class="btn btn--ink" style="margin-left:auto">+ New listing</a></div>
    <nav class="tabs fade-up" style="--d:.06s">${TABS.map(([k, l]) => `<a href="#/account/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}<span class="tabs__ink"></span></nav>
    <div id="pane" style="padding-bottom:80px"><div class="grid">${'<div class="skel" style="height:120px"></div>'.repeat(4)}</div></div>
  </div>`;
  const on = $('.tabs a.on', app), ink = $('.tabs__ink', app);
  requestAnimationFrame(() => Object.assign(ink.style, { left: on.offsetLeft + 'px', width: on.offsetWidth + 'px' }));
  await PANES[tab]($('#pane'), u);
  reveal(app);
}

const PANES = {
  async overview(el, u) {
    const [mine, orders, sales, msgs] = await Promise.all([get(`/listings?seller=${u.id}&status=all&limit=60`), get('/orders'), get('/orders/sales'), get('/messages')]);
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi kpi--lime reveal"><small>Total earned</small><strong data-n="${sales.revenue}" data-money>€0</strong></div>
        <div class="kpi reveal" style="--d:.05s"><small>Active listings</small><strong data-n="${mine.items.filter(l => l.status === 'active').length}">0</strong></div>
        <div class="kpi reveal" style="--d:.1s"><small>Items sold</small><strong data-n="${sales.items.reduce((s, o) => s + o.items.length, 0)}">0</strong></div>
        <div class="kpi reveal" style="--d:.15s"><small>Unread messages</small><strong data-n="${msgs.unread}">0</strong></div>
      </div>
      <div class="section__head" style="margin-bottom:20px"><h2 style="font-size:28px">Recent purchases</h2><a class="link" href="#/account/orders">All purchases →</a></div>
      ${orders.items.length ? `<div class="list-rows">${orders.items.slice(0, 3).map(orderRow).join('')}</div>` : emptyState('No purchases yet', 'When you buy something it will show up here.', '<a class="btn btn--ink" href="#/shop">Start shopping</a>')}`;
    $$('[data-n]', el).forEach(s => countUp(s, +s.dataset.n, s.dataset.money !== undefined ? { fmt: money } : {}));
  },

  async listings(el, u) {
    const { items } = await get(`/listings?seller=${u.id}&status=all&limit=60`);
    if (!items.length) { el.innerHTML = emptyState("You haven't listed anything", 'It takes about a minute. Snap a photo and set a price.', '<a class="btn btn--ink" href="#/sell">List your first item</a>'); return; }
    el.innerHTML = `<div class="list-rows">${items.map((l, i) => `
      <div class="list-row" style="--d:${i * 0.04}s"><a href="#/item/${l.id}"><img src="${src(l.images[0])}" alt="" /></a>
        <div><a href="#/item/${l.id}"><h4>${esc(l.title)}</h4></a><div class="muted" style="font-size:14px">${money(l.price)} · ${l.views} views · ♥ ${l.favorites} · qty ${l.quantity}</div></div>
        <div class="list-row__actions"><span class="status status--${l.status}">${l.status}</span>
          ${l.status === 'active' ? `<button class="btn btn--sm" data-toggle="${l.id}" data-to="paused">Pause</button>` : l.status === 'paused' ? `<button class="btn btn--sm" data-toggle="${l.id}" data-to="active">Resume</button>` : ''}
          <a class="btn btn--sm" href="#/edit/${l.id}">Edit</a><button class="btn btn--sm btn--danger" data-del="${l.id}">Delete</button></div>
      </div>`).join('')}</div>`;
    $$('[data-toggle]', el).forEach(b => (b.onclick = async () => {
      try { await busy(b, () => patch(`/listings/${b.dataset.toggle}`, { status: b.dataset.to })); toast(b.dataset.to === 'paused' ? 'Listing paused' : 'Listing is live again'); PANES.listings(el, u); } catch (e) { toastError(e); }
    }));
    $$('[data-del]', el).forEach(b => (b.onclick = async () => {
      if (!(await confirmDialog('Delete this listing?', 'It will be removed from Agora for good.', 'Delete'))) return;
      try { await del(`/listings/${b.dataset.del}`); toast('Listing deleted'); b.closest('.list-row').remove(); } catch (e) { toastError(e); }
    }));
  },

  async orders(el) {
    const { items } = await get('/orders');
    el.innerHTML = items.length ? `<div class="list-rows">${items.map(orderCard(false)).join('')}</div>` : emptyState('No purchases yet', 'Your orders will appear here.', '<a class="btn btn--ink" href="#/shop">Browse the shop</a>');
    bindOrderActions(el, () => PANES.orders(el));
  },

  async sales(el) {
    const { items, revenue } = await get('/orders/sales');
    el.innerHTML = items.length
      ? `<div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi kpi--lime"><small>Revenue</small><strong>${money2(revenue)}</strong></div><div class="kpi"><small>Orders</small><strong>${items.length}</strong></div></div>
         <div class="list-rows">${items.map(orderCard(true)).join('')}</div>`
      : emptyState('No sales yet', 'When someone buys one of your items, you will manage shipping here.', '<a class="btn btn--ink" href="#/sell">List an item</a>');
    bindOrderActions(el, () => PANES.sales(el));
  },

  async favorites(el) {
    const { items } = await get('/favorites');
    remember(items);
    el.innerHTML = items.length ? `<div class="grid">${items.map(card).join('')}</div>` : emptyState('Nothing saved yet', 'Tap the ♥ on any item to save it for later.', '<a class="btn btn--ink" href="#/shop">Find something</a>');
  },

  async settings(el, u) {
    el.innerHTML = `<form class="panel reveal" id="sf" style="max-width:640px">
      <h3>Profile</h3>
      <div class="field"><label>Name</label><input class="input" name="name" value="${esc(u.name)}" /></div>
      <div class="field"><label>Location</label><input class="input" name="location" value="${esc(u.location || '')}" placeholder="City, Country" /></div>
      <div class="field"><label>Avatar image link</label><input class="input" name="avatar" value="${esc(u.avatar || '')}" /></div>
      <div class="field"><label>Bio</label><textarea class="textarea" name="bio" placeholder="Tell buyers a little about yourself">${esc(u.bio || '')}</textarea></div>
      <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap"><a class="btn" href="#/seller/${u.id}">View public profile</a><button class="btn btn--ink">Save changes</button></div>
    </form>`;
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await busy(f.querySelector('.btn--ink'), () => patch('/auth/me', { name: f.name.value, location: f.location.value, bio: f.bio.value, avatar: f.avatar.value }));
        auth.update(r.user); toast('Profile saved');
      } catch (err) { toastError(err); }
    };
  },
};

const STEPS = ['paid', 'shipped', 'delivered'];
const orderRow = (o, i) => `
  <a class="list-row" style="--d:${i * 0.05}s" href="#/order/${o.id}"><img src="${src(o.items[0].image)}" alt="" />
    <div><h4>${esc(o.items.map(x => x.title).join(', '))}</h4><div class="muted" style="font-size:14px">${o.number} · ${dateFmt(o.createdAt)}</div></div>
    <div class="list-row__actions"><span class="status status--${o.status}">${o.status}</span><b>${money2(o.total)}</b></div></a>`;

const orderCard = (asSeller) => (o, i) => {
  const step = STEPS.indexOf(o.status);
  const next = asSeller && o.status === 'paid' ? ['shipped', 'Mark as shipped'] : asSeller && o.status === 'shipped' ? ['delivered', 'Mark delivered'] : null;
  return `<div class="order-card" style="--d:${i * 0.05}s">
    <div class="order-card__head"><div><b>${o.number}</b> <span class="muted">· ${dateFmt(o.createdAt)}${asSeller ? ` · buyer ${esc(o.buyer?.name || '')}` : ''}</span></div>
      <span class="status status--${o.status}">${o.status}</span></div>
    <div class="order-items">${o.items.map(it => `<div><img src="${src(it.image)}" alt="" /><div style="flex:1"><a href="#/item/${it.listingId}"><b>${esc(it.title)}</b></a><div class="muted" style="font-size:13px">Qty ${it.qty}</div></div><b>${money2(it.price * it.qty)}</b></div>`).join('')}</div>
    ${o.status !== 'cancelled' ? `<div class="timeline">${STEPS.map((_, k) => `<span class="${k <= step ? 'done' : ''}"></span>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px" class="muted">${STEPS.map(s => `<span style="text-transform:capitalize">${s}</span>`).join('')}</div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
      ${asSeller ? `<span class="muted" style="margin-right:auto;font-size:14px">Ship to: ${esc(o.shipping.name)}, ${esc(o.shipping.city)}, ${esc(o.shipping.country)}</span>` : `<b style="margin-right:auto">Total ${money2(o.total)}</b>`}
      ${o.status === 'paid' ? `<button class="btn btn--sm btn--danger" data-status="${o.id}" data-to="cancelled">Cancel order</button>` : ''}
      ${next ? `<button class="btn btn--sm btn--ink" data-status="${o.id}" data-to="${next[0]}">${next[1]}</button>` : ''}
      ${!asSeller ? `<a class="btn btn--sm" href="#/order/${o.id}">Details</a>` : ''}
    </div></div>`;
};

function bindOrderActions(el, refresh) {
  $$('[data-status]', el).forEach(b => (b.onclick = async () => {
    if (b.dataset.to === 'cancelled' && !(await confirmDialog('Cancel this order?', 'The item will be put back on sale and the buyer refunded.', 'Cancel order'))) return;
    try { await busy(b, () => patch(`/orders/${b.dataset.status}/status`, { status: b.dataset.to })); toast(`Order ${b.dataset.to}`); refresh(); } catch (e) { toastError(e); }
  }));
}
