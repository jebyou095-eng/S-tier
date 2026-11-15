import { route, start, go } from './router.js';
import { auth, cart, totals, listingCache } from './store.js';
import { get, post } from './api.js';
import { API_URL } from './config.js';
import { $, $$, esc, money, money2, src, toast, toastError, avatar, flyToCart, closeModal } from './ui.js';

// ---------- Routes (each page is its own file in js/pages/) ----------
route('/', () => import('./pages/home.js'));
route('/shop', () => import('./pages/shop.js'));
route('/item/:id', () => import('./pages/item.js'));
route('/sell', () => import('./pages/sell.js'));
route('/edit/:id', () => import('./pages/sell.js'));
route('/login', () => import('./pages/auth.js'));
route('/register', () => import('./pages/auth.js'));
route('/account', () => import('./pages/account.js'));
route('/account/:tab', () => import('./pages/account.js'));
route('/checkout', () => import('./pages/checkout.js'));
route('/order/:id', () => import('./pages/success.js'));
route('/messages', () => import('./pages/messages.js'));
route('/messages/:thread', () => import('./pages/messages.js'));
route('/seller/:id', () => import('./pages/seller.js'));
route('/about', () => import('./pages/about.js'));
route('/404', () => import('./pages/notfound.js'));

// ---------- Nav: scroll state + hide on scroll down ----------
const nav = $('#nav');
let lastY = 0;
addEventListener('scroll', () => {
  const y = scrollY;
  nav.classList.toggle('is-scrolled', y > 8);
  nav.classList.toggle('is-hidden', y > 400 && y > lastY && !$('.dropdown.open'));
  lastY = y;
}, { passive: true });

// ---------- Search ----------
$('#navSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  go(`#/shop${q ? '?q=' + encodeURIComponent(q) : ''}`);
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#navSearch input').focus(); }
  if (e.key === 'Escape') { closeModal(); closeCart(); }
});

// ---------- Mobile menu ----------
$('#burger').onclick = () => { $('#burger').classList.toggle('open'); $('#mobileMenu').classList.toggle('open'); };
addEventListener('hashchange', () => { $('#burger').classList.remove('open'); $('#mobileMenu').classList.remove('open'); });

// ---------- User menu ----------
function renderUser() {
  const box = $('#navUser');
  $$('[data-auth]').forEach(el => (el.hidden = !auth.loggedIn));
  if (!auth.loggedIn) { box.innerHTML = `<a href="#/login" class="nav__link">Log in</a>`; return; }
  const u = auth.user;
  box.innerHTML = `<div class="user-menu">
    <button class="user-menu__btn" aria-label="Account menu">${avatar(u)}</button>
    <div class="dropdown">
      <div class="dropdown__head"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div>
      <a href="#/account">Dashboard</a><a href="#/account/listings">My listings</a><a href="#/account/orders">Purchases</a>
      <a href="#/account/sales">Sales</a><a href="#/messages">Messages</a><a href="#/account/settings">Settings</a><hr/>
      <button data-logout>Log out</button>
    </div></div>`;
  const dd = $('.dropdown', box);
  $('.user-menu__btn', box).onclick = (e) => { e.stopPropagation(); dd.classList.toggle('open'); };
  $('[data-logout]', box).onclick = () => { auth.logout(); toast('Logged out. See you soon!'); go('#/'); };
}
document.addEventListener('click', () => $$('.dropdown.open').forEach(d => d.classList.remove('open')));
addEventListener('auth:change', () => { renderUser(); pollUnread(); });
addEventListener('auth:expired', () => toast('Your session expired. Please log in again.', { type: 'error' }));

// ---------- Unread messages dot ----------
async function pollUnread() {
  if (!auth.loggedIn) { $('#msgDot').hidden = true; return; }
  try { const { unread } = await get('/messages'); $('#msgDot').hidden = !unread; } catch {}
}
setInterval(pollUnread, 30000);

// ---------- Cart drawer ----------
const drawer = $('#cartDrawer');
function openCart() { renderCart(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
function closeCart() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
$('#cartBtn').onclick = openCart;
addEventListener('cart:open', openCart);
$$('[data-close]', drawer).forEach(el => (el.onclick = closeCart));
$$('#modal [data-close]').forEach(el => (el.onclick = closeModal));

function renderCart() {
  const body = $('#cartBody'), foot = $('#cartFoot');
  if (!cart.items.length) {
    body.innerHTML = `<div class="empty"><div class="empty__art">bag</div><h3>Your bag is empty</h3><p class="muted">Find something you'll love.</p></div>`;
    foot.innerHTML = `<a href="#/shop" class="btn btn--ink btn--block" data-close-cart>Start shopping</a>`;
  } else {
    body.innerHTML = cart.items.map((i, k) => `
      <div class="line-item" style="--d:${k * 0.05}s">
        <a href="#/item/${i.id}" data-close-cart><img src="${src(i.image)}" alt="${esc(i.title)}" /></a>
        <div><h4>${esc(i.title)}</h4>
          ${i.max > 1 ? `<div class="qty"><button data-dec="${i.id}">−</button><span>${i.qty}</span><button data-inc="${i.id}">+</button></div>` : ''}
          <div><button data-remove="${i.id}">Remove</button></div></div>
        <b class="price">${money(i.price * i.qty)}</b>
      </div>`).join('');
    const t = totals(cart.subtotal);
    foot.innerHTML = `
      <div class="sum"><span>Subtotal</span><span>${money2(t.subtotal)}</span></div>
      <div class="sum muted"><span>Shipping</span><span>${t.shipping ? money2(t.shipping) : 'Free'}</span></div>
      ${t.shipping ? `<small class="muted">Add ${money2(150 - t.subtotal)} more for free shipping</small>` : ''}
      <a href="#/checkout" class="btn btn--ink btn--lg btn--block" data-close-cart>Checkout · ${money2(t.total)} <span class="arrow">→</span></a>`;
  }
  $$('[data-close-cart]', drawer).forEach(a => a.addEventListener('click', closeCart));
  $$('[data-remove]', body).forEach(b => (b.onclick = () => { cart.remove(b.dataset.remove); renderCart(); }));
  $$('[data-inc]', body).forEach(b => (b.onclick = () => { const i = cart.items.find(x => x.id === b.dataset.inc); cart.setQty(i.id, i.qty + 1); renderCart(); }));
  $$('[data-dec]', body).forEach(b => (b.onclick = () => { const i = cart.items.find(x => x.id === b.dataset.dec); cart.setQty(i.id, i.qty - 1); renderCart(); }));
}
function renderCount() {
  const el = $('#cartCount');
  el.hidden = !cart.count;
  el.textContent = cart.count;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
addEventListener('cart:change', renderCount);

// ---------- Global actions: favorite & add-to-bag buttons anywhere ----------
document.addEventListener('click', async (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    if (!auth.loggedIn) { toast('Log in to save items.'); go('#/login?next=' + encodeURIComponent(location.hash)); return; }
    fav.classList.toggle('on'); fav.classList.remove('pop'); void fav.offsetWidth; fav.classList.add('pop');
    try {
      const r = await post(`/favorites/${fav.dataset.fav}`);
      fav.classList.toggle('on', r.isFavorite);
      toast(r.isFavorite ? 'Saved to your favourites' : 'Removed from favourites');
    } catch (err) { fav.classList.toggle('on'); toastError(err); }
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    e.preventDefault();
    const l = listingCache.get(add.dataset.add);
    if (!l) return;
    if (l.isMine) { toast("That's your own listing.", { type: 'error' }); return; }
    flyToCart(add);
    cart.add(l);
    toast('Added to your bag', { image: l.images[0], sub: l.title });
  }
});

// ---------- Backend offline banner ----------
const banner = $('#apiBanner');
addEventListener('api:offline', () => {
  banner.hidden = false;
  banner.innerHTML = `⚠ Frontend can't reach the backend at <code>${esc(API_URL)}</code>. Start it with <code>cd backend && npm start</code>.`;
});
addEventListener('api:online', () => (banner.hidden = true));

// ---------- Footer ----------
$('#year').textContent = new Date().getFullYear();
$('#newsletter').onsubmit = (e) => { e.preventDefault(); e.target.reset(); toast("You're on the list! ✨"); };

// Catch-all so frontend bugs are clearly labelled in the console.
addEventListener('error', (e) => e.message && console.error('[frontend] Uncaught error:', e.message, `${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => console.error('[frontend] Unhandled promise rejection:', e.reason));

renderUser();
renderCount();
pollUnread();
if (auth.loggedIn) get('/auth/me').then(r => auth.update(r.user)).catch(() => {});
start();
