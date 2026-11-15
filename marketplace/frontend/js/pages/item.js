import { get, post, del, assetUrl as assetSrc } from '../api.js';
import { auth, cart, remember } from '../store.js';
import { go } from '../router.js';
import { $, $$, esc, money, src, card, avatar, toast, toastError, openModal, closeModal, confirmDialog, flyToCart, busy, timeAgo, CONDITION_LABEL } from '../ui.js';

export default async function item(app, { params }) {
  const [{ item: l, related }, { items: cats }] = await Promise.all([get(`/listings/${params.id}`), get('/categories')]);
  const catName = cats.find(c => c.slug === l.category)?.name || l.category;
  remember([l, ...related]);
  const off = l.originalPrice > l.price ? Math.round((1 - l.price / l.originalPrice) * 100) : 0;
  const sold = l.status !== 'active';
  const cat = l.category;

  app.innerHTML = `
  <div class="container">
    <nav class="crumbs fade-up"><a href="#/">Home</a><span>/</span><a href="#/shop?category=${cat}">${esc(catName)}</a><span>/</span><span>${esc(l.title)}</span></nav>
    <div class="detail">
      <div class="gallery fade-up" style="--d:.05s">
        <div class="gallery__thumbs">${l.images.map((im, i) => `<button class="${i ? '' : 'on'}" data-i="${i}" aria-label="Photo ${i + 1}"><img src="${src(im)}" alt="" /></button>`).join('')}</div>
        <div class="gallery__main" id="main">
          <img src="${src(l.images[0])}" alt="${esc(l.title)}" id="mainImg" />
          ${l.images.length > 1 ? `<div class="gallery__nav"><button data-step="-1" aria-label="Previous photo">←</button><button data-step="1" aria-label="Next photo">→</button></div>` : ''}
        </div>
      </div>
      <div class="info">
        <div class="fade-up" style="--d:.1s;display:flex;gap:8px;flex-wrap:wrap">
          <span class="tag tag--lime">${CONDITION_LABEL[l.condition]}</span>
          ${sold ? '<span class="tag tag--ink">Sold</span>' : ''}
          <span class="tag">${l.views} views</span><span class="tag">♥ ${l.favorites}</span>
        </div>
        <h1 class="fade-up" style="--d:.15s">${esc(l.title)}</h1>
        <div class="fade-up" style="--d:.2s">
          <span class="price">${money(l.price)}${l.originalPrice ? `<s>${money(l.originalPrice)}</s>` : ''}</span>
          ${off >= 5 ? `<span class="info__save">Save ${off}%</span>` : ''}
        </div>
        <div class="info__actions fade-up" style="--d:.25s">${actions(l, sold)}</div>
        <div class="fade-up" style="--d:.3s">
          <p class="desc">${esc(l.description)}</p>
          <div class="specs">
            <div><small>Condition</small><b>${CONDITION_LABEL[l.condition]}</b></div>
            <div><small>Category</small><b>${esc(catName)}</b></div>
            <div><small>Location</small><b>${esc(l.location || '—')}</b></div>
            <div><small>Listed</small><b>${timeAgo(l.createdAt)}</b></div>
          </div>
          <a class="seller-card" href="#/seller/${l.seller.id}">
            ${avatar(l.seller, 'avatar--md')}
            <div><b>${esc(l.seller.name)}</b> ${l.seller.verified ? '<span class="verified">✔ Verified</span>' : ''}
              <div class="muted" style="font-size:14px">${l.seller.rating ? `★ ${l.seller.rating} · ${l.seller.ratingCount} reviews` : 'New seller'} · ${esc(l.seller.location || '')}</div></div>
            <span>→</span>
          </a>
          <div class="perks">
            <div><span>🛡</span>Buyer protection: full refund if the item isn't as described.</div>
            <div><span>📦</span>Ships in 1–3 days · free shipping on orders over €150.</div>
            <div><span>↺</span>14-day returns on eligible items.</div>
          </div>
        </div>
      </div>
    </div>
    ${related.length ? `<section class="section--tight"><div class="section__head"><h2 class="reveal">You might <em>also like</em></h2></div>
      <div class="grid">${related.map(card).join('')}</div></section>` : ''}
  </div>`;

  // Gallery: thumbnails, arrows, swipe, zoom, lightbox
  let idx = 0;
  const main = $('#mainImg');
  const show = (i) => {
    idx = (i + l.images.length) % l.images.length;
    main.classList.add('out');
    setTimeout(() => {
      main.onload = () => main.classList.remove('out');
      main.onerror = main.onload;
      main.src = assetSrc(l.images[idx]);
      if (main.complete) main.classList.remove('out');
    }, 220);
    $$('.gallery__thumbs button', app).forEach((b, k) => b.classList.toggle('on', k === idx));
  };
  $$('[data-i]', app).forEach(b => (b.onclick = () => show(+b.dataset.i)));
  $$('[data-step]', app).forEach(b => (b.onclick = (e) => { e.stopPropagation(); show(idx + +b.dataset.step); }));
  const box = $('#main');
  box.onclick = () => openModal(`<img src="${src(l.images[idx])}" alt="${esc(l.title)}" />`, { cls: 'lightbox' }).onclick = closeModal;
  box.onmousemove = (e) => {
    const r = box.getBoundingClientRect();
    main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };
  box.onmouseenter = () => matchMedia('(hover: hover)').matches && box.classList.add('zoom');
  box.onmouseleave = () => box.classList.remove('zoom');
  let x0 = null;
  box.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  box.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); x0 = null; });

  // Actions
  const btn = (k) => app.querySelector(`[data-act="${k}"]`);
  btn('buy')?.addEventListener('click', (e) => { cart.has(l.id) || cart.add(l); flyToCart(e.target); go('#/checkout'); });
  btn('bag')?.addEventListener('click', (e) => {
    if (cart.has(l.id) && l.quantity <= 1) { window.dispatchEvent(new CustomEvent('cart:open')); return; }
    flyToCart(e.target); cart.add(l); toast('Added to your bag', { image: l.images[0], sub: l.title });
  });
  btn('msg')?.addEventListener('click', () => {
    if (!auth.loggedIn) { go('#/login?next=' + encodeURIComponent(location.hash)); return; }
    const box = openModal(`<h3>Message ${esc(l.seller.name.split(' ')[0])}</h3><p class="muted" style="margin-bottom:16px">About “${esc(l.title)}”</p>
      <form id="msgForm"><textarea class="textarea" name="text" required>Hi! Is this still available?</textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn btn--sm" data-cancel>Cancel</button><button class="btn btn--ink btn--sm">Send message</button></div></form>`);
    box.querySelector('[data-cancel]').onclick = closeModal;
    box.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await busy(e.submitter, () => post('/messages', { listingId: l.id, text: e.target.text.value }));
        closeModal(); toast('Message sent!'); go('#/messages/' + r.threadId);
      } catch (err) { toastError(err); }
    };
  });
  btn('offer')?.addEventListener('click', () => {
    if (!auth.loggedIn) { go('#/login?next=' + encodeURIComponent(location.hash)); return; }
    const box = openModal(`<h3>Make an offer</h3><p class="muted" style="margin-bottom:16px">Listed at ${money(l.price)}. The seller will get your offer as a message.</p>
      <form><div class="field"><label>Your offer (€)</label><input class="input" name="amount" type="number" min="1" step="1" value="${Math.round(l.price * 0.9)}" required /></div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn btn--sm" data-cancel>Cancel</button><button class="btn btn--ink btn--sm">Send offer</button></div></form>`);
    box.querySelector('[data-cancel]').onclick = closeModal;
    box.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await busy(e.submitter, () => post('/messages', { listingId: l.id, text: `💶 Offer: ${money(+e.target.amount.value)} for “${l.title}”. Would you accept?` }));
        closeModal(); toast('Offer sent to the seller'); go('#/messages/' + r.threadId);
      } catch (err) { toastError(err); }
    };
  });
  btn('edit')?.addEventListener('click', () => go(`#/edit/${l.id}`));
  btn('delete')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this listing?', 'This cannot be undone.', 'Delete'))) return;
    try { await del(`/listings/${l.id}`); toast('Listing deleted'); go('#/account/listings'); } catch (err) { toastError(err); }
  });
}

function actions(l, sold) {
  if (l.isMine) return `<button class="btn btn--ink btn--lg" data-act="edit">Edit listing</button><button class="btn btn--lg btn--danger" data-act="delete" style="grid-column:span 2">Delete</button>`;
  if (sold) return `<button class="btn btn--ink btn--lg" disabled>Sold out</button><button class="btn" data-act="msg" style="grid-column:span 2">Message seller</button>`;
  return `<button class="btn btn--ink btn--lg magnetic" data-act="buy">Buy now · ${money(l.price)}</button>
    <button class="btn btn--lg" data-act="bag">Add to bag</button><button class="btn btn--lg" data-act="offer">Make offer</button>
    <button class="btn btn--ghost" data-act="msg" style="grid-column:span 2;border:0">💬 Message seller</button>
    <button class="fav ${l.isFavorite ? 'on' : ''}" data-fav="${l.id}" style="position:static;grid-column:span 2;justify-self:center;width:auto;padding:0 16px;border-radius:999px;gap:8px;display:flex;align-items:center;background:transparent" aria-label="Save item"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg> Save for later</button>`;
}
