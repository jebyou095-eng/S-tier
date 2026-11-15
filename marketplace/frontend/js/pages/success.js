import { get } from '../api.js';
import { auth } from '../store.js';
import { go } from '../router.js';
import { esc, money2, src, confetti, dateFmt } from '../ui.js';

export default async function success(app, { params, query }) {
  if (!auth.loggedIn) { go('#/login'); return; }
  const { order: o } = await get(`/orders/${params.id}`);
  const isNew = query.get('new');
  app.innerHTML = `
  <div class="container" style="max-width:720px">
    <div class="success">
      <div class="success__check"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></div>
      <span class="eyebrow fade-up" style="--d:.3s">Order ${esc(o.number)}</span>
      <h1 class="fade-up" style="--d:.4s">${isNew ? 'Thank <em>you!</em>' : 'Order <em>details</em>'}</h1>
      <p class="muted fade-up" style="--d:.5s">${isNew ? "Your payment went through and the seller has been notified. We'll let you know when it ships." : `Placed on ${dateFmt(o.createdAt)}`}</p>
    </div>
    <div class="order-card fade-up" style="--d:.6s">
      <div class="order-card__head"><b>Status</b><span class="status status--${o.status}">${o.status}</span></div>
      <div class="order-items">${o.items.map(i => `<div><img src="${src(i.image)}" alt="" /><div style="flex:1"><a href="#/item/${i.listingId}"><b>${esc(i.title)}</b></a><div class="muted" style="font-size:14px">Qty ${i.qty}</div></div><b>${money2(i.price * i.qty)}</b></div>`).join('')}</div>
      <div style="display:grid;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">
        <div class="sum"><span>Subtotal</span><span>${money2(o.subtotal)}</span></div>
        <div class="sum"><span>Shipping</span><span>${o.shippingCost ? money2(o.shippingCost) : 'Free'}</span></div>
        <div class="sum"><span>Buyer protection</span><span>${money2(o.fee)}</span></div>
        <div class="sum total"><span>Total paid</span><span>${money2(o.total)}</span></div>
      </div>
      <p class="muted" style="margin-top:16px;font-size:14px">Ships to ${esc(o.shipping.name)}, ${esc(o.shipping.address)}, ${esc(o.shipping.city)} ${esc(o.shipping.zip)}, ${esc(o.shipping.country)} · Paid with ${esc(o.payment.brand)} •••• ${esc(o.payment.last4)}</p>
    </div>
    <div style="display:flex;gap:12px;justify-content:center;margin:32px 0 96px">
      <a href="#/account/orders" class="btn btn--lg">View my orders</a><a href="#/shop" class="btn btn--ink btn--lg">Keep shopping <span class="arrow">→</span></a>
    </div>
  </div>`;
  if (isNew) setTimeout(confetti, 350);
}
