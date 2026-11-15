import { Router } from 'express';
import { db, id, save } from '../db.js';
import { bad, forbidden, notFound } from '../errors.js';
import { requireAuth, publicUser } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

const SHIPPING_FLAT = 6.99;
const FREE_SHIPPING_OVER = 150;
const STATUSES = ['paid', 'shipped', 'delivered', 'cancelled'];

const withPeople = (o) => ({
  ...o,
  buyer: publicUser(db.users.find(u => u.id === o.buyerId)),
  sellers: [...new Set(o.items.map(i => i.sellerId))].map(sid => publicUser(db.users.find(u => u.id === sid))),
});

// Create an order (checkout). Payment is simulated: card details are checked for shape only and never stored.
r.post('/', (req, res) => {
  const { items, shipping, payment } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw bad('Your cart is empty.');
  for (const f of ['name', 'address', 'city', 'zip', 'country']) {
    if (!String(shipping?.[f] || '').trim()) throw bad(`Shipping ${f} is required.`);
  }
  const card = String(payment?.card || '').replace(/\s+/g, '');
  if (!/^\d{12,19}$/.test(card)) throw bad('Card number looks invalid (demo: use 4242 4242 4242 4242).');
  if (!/^\d{2}\/\d{2}$/.test(payment?.exp || '')) throw bad('Card expiry must look like MM/YY.');
  if (!/^\d{3,4}$/.test(payment?.cvc || '')) throw bad('CVC must be 3 or 4 digits.');

  const lines = items.map(({ listingId, qty }) => {
    const l = db.listings.find(x => x.id === listingId);
    if (!l) throw bad('An item in your cart no longer exists. Please remove it.');
    if (l.sellerId === req.user.id) throw bad(`You can't buy your own listing "${l.title}".`);
    if (l.status !== 'active') throw bad(`"${l.title}" is no longer available.`);
    const q = Math.max(1, parseInt(qty, 10) || 1);
    if (q > l.quantity) throw bad(`Only ${l.quantity} left of "${l.title}".`);
    return { l, q };
  });

  const subtotal = lines.reduce((s, { l, q }) => s + l.price * q, 0);
  const shippingCost = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
  const fee = Math.round(subtotal * 0.03 * 100) / 100; // buyer protection fee
  for (const { l, q } of lines) {
    l.quantity -= q;
    if (l.quantity <= 0) { l.quantity = 0; l.status = 'sold'; }
  }
  const order = {
    id: id('ord'), number: 'AG-' + Math.floor(100000 + Math.random() * 900000), buyerId: req.user.id,
    items: lines.map(({ l, q }) => ({ listingId: l.id, title: l.title, price: l.price, qty: q, image: l.images[0], sellerId: l.sellerId })),
    subtotal: round(subtotal), shippingCost, fee, total: round(subtotal + shippingCost + fee),
    shipping: pick(shipping, ['name', 'address', 'city', 'zip', 'country']),
    payment: { brand: card.startsWith('4') ? 'Visa' : card.startsWith('5') ? 'Mastercard' : 'Card', last4: card.slice(-4) },
    status: 'paid', createdAt: new Date().toISOString(),
  };
  db.orders.push(order);
  save();
  res.status(201).json({ order: withPeople(order) });
});

r.get('/', (req, res) => {
  const mine = db.orders.filter(o => o.buyerId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items: mine.map(withPeople) });
});

r.get('/sales', (req, res) => {
  const sales = db.orders
    .filter(o => o.items.some(i => i.sellerId === req.user.id))
    .map(o => ({ ...withPeople(o), items: o.items.filter(i => i.sellerId === req.user.id) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const revenue = sales.filter(s => s.status !== 'cancelled')
    .reduce((s, o) => s + o.items.reduce((a, i) => a + i.price * i.qty, 0), 0);
  res.json({ items: sales, revenue: round(revenue) });
});

r.get('/:id', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) throw notFound('Order');
  if (o.buyerId !== req.user.id && !o.items.some(i => i.sellerId === req.user.id)) throw forbidden();
  res.json({ order: withPeople(o) });
});

// Seller moves the order along (paid -> shipped -> delivered), buyer may cancel while "paid".
r.patch('/:id/status', (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) throw notFound('Order');
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) throw bad(`Status must be one of: ${STATUSES.join(', ')}.`);
  const isSeller = o.items.some(i => i.sellerId === req.user.id);
  const isBuyer = o.buyerId === req.user.id;
  if (status === 'cancelled') {
    if (!isBuyer && !isSeller) throw forbidden();
    if (o.status !== 'paid') throw bad('Only orders that have not shipped can be cancelled.');
    for (const i of o.items) {
      const l = db.listings.find(x => x.id === i.listingId);
      if (l) { l.quantity += i.qty; l.status = 'active'; }
    }
  } else if (!isSeller) throw forbidden('Only the seller can update shipping status.');
  o.status = status;
  o[`${status}At`] = new Date().toISOString();
  save();
  res.json({ order: withPeople(o) });
});

const round = (n) => Math.round(n * 100) / 100;
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, String(o[k]).trim().slice(0, 120)]));

export default r;
