import { post } from '../api.js';
import { auth, cart, totals } from '../store.js';
import { go } from '../router.js';
import { $, esc, money, money2, src, busy, emptyState, toast } from '../ui.js';

export default async function checkout(app) {
  if (!auth.loggedIn) { go('#/login?next=' + encodeURIComponent('#/checkout')); return; }
  const own = cart.items.filter(i => i.sellerId === auth.user.id);
  if (own.length) {
    own.forEach(i => cart.remove(i.id));
    toast(`Removed ${own.length === 1 ? 'an item' : own.length + ' items'} you are selling yourself from your bag.`, { type: 'error' });
  }
  if (!cart.items.length) {
    app.innerHTML = `<div class="container">${emptyState('Your bag is empty', 'Add something lovely before checking out.', '<a class="btn btn--ink" href="#/shop">Browse the shop</a>')}</div>`;
    return;
  }
  const t = totals(cart.subtotal);
  const u = auth.user;
  app.innerHTML = `
  <div class="container"><div class="checkout">
    <form id="co" novalidate>
      <span class="eyebrow fade-up">Secure checkout</span>
      <h1 class="fade-up" style="--d:.05s;font-size:clamp(38px,5vw,60px);letter-spacing:-.045em;margin:8px 0 28px">Almost <em>yours.</em></h1>
      <div id="err"></div>
      <div class="panel fade-up" style="--d:.1s"><h3>1 · Shipping address</h3>
        <div class="field"><label for="name">Full name</label><input class="input" id="name" name="name" value="${esc(u.name)}" autocomplete="name" /></div>
        <div class="field"><label for="address">Street address</label><input class="input" id="address" name="address" autocomplete="street-address" placeholder="12 Rue de Rivoli" /></div>
        <div class="row-3">
          <div class="field"><label for="city">City</label><input class="input" id="city" name="city" autocomplete="address-level2" /></div>
          <div class="field"><label for="zip">Postcode</label><input class="input" id="zip" name="zip" autocomplete="postal-code" /></div>
          <div class="field"><label for="country">Country</label><input class="input" id="country" name="country" autocomplete="country-name" /></div>
        </div>
      </div>
      <div class="panel fade-up" style="--d:.16s"><h3>2 · Payment</h3>
        <div class="card-visual"><div class="chip-gold"></div><div class="num" id="cvNum">•••• •••• •••• ••••</div>
          <div class="meta"><span id="cvName">${esc(u.name)}</span><span id="cvExp">MM/YY</span></div></div>
        <div class="field"><label for="card">Card number</label><input class="input" id="card" name="card" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="23" />
          <small>Demo mode: no real payment is made. Use 4242 4242 4242 4242.</small></div>
        <div class="row">
          <div class="field"><label for="exp">Expiry</label><input class="input" id="exp" name="exp" placeholder="MM/YY" maxlength="5" autocomplete="cc-exp" /></div>
          <div class="field"><label for="cvc">CVC</label><input class="input" id="cvc" name="cvc" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="cc-csc" /></div>
        </div>
      </div>
      <button class="btn btn--ink btn--lg btn--block fade-up" style="--d:.2s;margin-top:20px" type="submit">Pay ${money2(t.total)} <span class="arrow">→</span></button>
      <p class="muted" style="text-align:center;font-size:13px;margin-top:12px">🔒 Payments are protected. Card details are never stored.</p>
    </form>
    <aside class="summary fade-up" style="--d:.15s"><div class="panel">
      <h3>Order summary</h3>
      ${cart.items.map(i => `<div class="line-item" style="grid-template-columns:64px 1fr auto"><img src="${src(i.image)}" alt="" style="width:64px;height:72px" /><div><h4>${esc(i.title)}</h4><small class="muted">Qty ${i.qty}</small></div><b class="price">${money(i.price * i.qty)}</b></div>`).join('')}
      <div style="display:grid;gap:10px;margin-top:18px">
        <div class="sum"><span>Subtotal</span><span>${money2(t.subtotal)}</span></div>
        <div class="sum"><span>Shipping</span><span>${t.shipping ? money2(t.shipping) : 'Free'}</span></div>
        <div class="sum"><span>Buyer protection (3%)</span><span>${money2(t.fee)}</span></div>
        <div class="sum total"><span>Total</span><span>${money2(t.total)}</span></div>
      </div>
    </div></aside>
  </div></div>`;

  const f = $('#co');
  f.card.oninput = () => {
    const d = f.card.value.replace(/\D/g, '').slice(0, 19);
    f.card.value = d.replace(/(.{4})/g, '$1 ').trim();
    $('#cvNum').textContent = (d + '•'.repeat(Math.max(0, 16 - d.length))).replace(/(.{4})/g, '$1 ').trim();
  };
  f.exp.oninput = () => {
    const d = f.exp.value.replace(/\D/g, '').slice(0, 4);
    f.exp.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
    $('#cvExp').textContent = f.exp.value || 'MM/YY';
  };
  f.name.oninput = () => ($('#cvName').textContent = f.name.value || ' ');
  f.cvc.oninput = () => (f.cvc.value = f.cvc.value.replace(/\D/g, ''));

  f.onsubmit = async (e) => {
    e.preventDefault();
    const missing = ['name', 'address', 'city', 'zip', 'country', 'card', 'exp', 'cvc'].filter(k => !f[k].value.trim());
    f.querySelectorAll('.input').forEach(i => i.classList.toggle('invalid', missing.includes(i.name)));
    if (missing.length) { $('#err').innerHTML = `<div class="form-error">Please fill in all the highlighted fields.</div>`; return; }
    try {
      const r = await busy(f.querySelector('[type=submit]'), () => post('/orders', {
        items: cart.items.map(i => ({ listingId: i.id, qty: i.qty })),
        shipping: { name: f.name.value, address: f.address.value, city: f.city.value, zip: f.zip.value, country: f.country.value },
        payment: { card: f.card.value, exp: f.exp.value, cvc: f.cvc.value },
      }));
      cart.clear();
      go(`#/order/${r.order.id}?new=1`);
    } catch (err) {
      $('#err').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      $('#err').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
}
