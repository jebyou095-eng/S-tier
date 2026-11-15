// Client-side state: login session and shopping cart (saved in localStorage).
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const emit = (name) => window.dispatchEvent(new CustomEvent(name));

export const auth = {
  token: read('agora.token', null),
  user: read('agora.user', null),
  set(token, user) { this.token = token; this.user = user; write('agora.token', token); write('agora.user', user); emit('auth:change'); },
  update(user) { this.user = user; write('agora.user', user); emit('auth:change'); },
  logout(expired = false) {
    this.token = null; this.user = null;
    try { localStorage.removeItem('agora.token'); localStorage.removeItem('agora.user'); } catch {}
    emit('auth:change');
    if (expired) window.dispatchEvent(new CustomEvent('auth:expired'));
  },
  get loggedIn() { return !!this.token; },
};

export const cart = {
  items: read('agora.cart', []), // [{ id, title, price, image, qty, max, sellerId }]
  save() { write('agora.cart', this.items); emit('cart:change'); },
  add(l, qty = 1) {
    const found = this.items.find(i => i.id === l.id);
    if (found) found.qty = Math.min(found.qty + qty, l.quantity || found.max || 99);
    else this.items.push({ id: l.id, title: l.title, price: l.price, image: l.images[0], qty, max: l.quantity, sellerId: l.sellerId });
    this.save();
  },
  setQty(id, qty) {
    const it = this.items.find(i => i.id === id);
    if (!it) return;
    it.qty = Math.max(1, Math.min(qty, it.max || 99));
    this.save();
  },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); },
  clear() { this.items = []; this.save(); },
  get count() { return this.items.reduce((s, i) => s + i.qty, 0); },
  get subtotal() { return Math.round(this.items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100; },
  has(id) { return this.items.some(i => i.id === id); },
};

export const SHIPPING = { flat: 6.99, freeOver: 150, feeRate: 0.03 };
export function totals(subtotal) {
  const shipping = subtotal >= SHIPPING.freeOver || subtotal === 0 ? 0 : SHIPPING.flat;
  const fee = Math.round(subtotal * SHIPPING.feeRate * 100) / 100;
  return { subtotal, shipping, fee, total: Math.round((subtotal + shipping + fee) * 100) / 100 };
}

// Listings seen on screen, so "Add to bag" buttons anywhere can find the full item.
export const listingCache = new Map();
export const remember = (items) => items.forEach(l => listingCache.set(l.id, l));
