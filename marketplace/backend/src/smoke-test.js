// End-to-end API check. Start the server first (npm start), then run: npm test
// Each step prints PASS/FAIL so you can see exactly which endpoint broke.
const BASE = process.env.API || 'http://localhost:4000/api';
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
};
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(BASE + path, {
    method, body: body && JSON.stringify(body),
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const email = `test${Date.now()}@agora.test`;
let seller, buyer, listing, order, thread;

await step('health', async () => { const r = await call('/health'); expect(r.data.ok, 'health not ok — is the backend running on ' + BASE + '?'); });
await step('register seller', async () => {
  const r = await call('/auth/register', { method: 'POST', body: { name: 'Test Seller', email, password: 'secret123' } });
  expect(r.status === 201 && r.data.token, JSON.stringify(r.data)); seller = r.data.token;
});
await step('duplicate email rejected', async () => {
  const r = await call('/auth/register', { method: 'POST', body: { name: 'X', email, password: 'secret123' } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});
await step('login demo buyer', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { email: 'demo@agora.test', password: 'demo1234' } });
  expect(r.data.token, JSON.stringify(r.data)); buyer = r.data.token;
});
await step('wrong password rejected', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { email: 'demo@agora.test', password: 'nope' } });
  expect(r.status === 401, `expected 401, got ${r.status}`);
});
await step('create listing (validation error)', async () => {
  const r = await call('/listings', { method: 'POST', token: seller, body: { title: 'x' } });
  expect(r.status === 400 && r.data.where, JSON.stringify(r.data));
});
await step('create listing', async () => {
  const r = await call('/listings', { method: 'POST', token: seller, body: {
    title: 'Test Lamp', description: 'A lovely test lamp in great shape.', price: 42, category: 'home', condition: 'good', quantity: 2,
    imageUrls: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800'] } });
  expect(r.status === 201, JSON.stringify(r.data)); listing = r.data.item;
});
await step('search finds listing', async () => {
  const r = await call('/listings?q=test%20lamp');
  expect(r.data.items.some(l => l.id === listing.id), 'not found in search');
});
await step('filter + sort', async () => {
  const r = await call('/listings?category=home&sort=price-asc&max=100');
  expect(r.data.items.every((l, i, a) => l.category === 'home' && l.price <= 100 && (!i || a[i - 1].price <= l.price)), 'filter/sort wrong');
});
await step('edit listing', async () => {
  const r = await call(`/listings/${listing.id}`, { method: 'PATCH', token: seller, body: { price: 39 } });
  expect(r.data.item?.price === 39, JSON.stringify(r.data));
});
await step('non-owner cannot edit', async () => {
  const r = await call(`/listings/${listing.id}`, { method: 'PATCH', token: buyer, body: { price: 1 } });
  expect(r.status === 403, `expected 403, got ${r.status}`);
});
await step('favorite toggle', async () => {
  const r = await call(`/favorites/${listing.id}`, { method: 'POST', token: buyer });
  expect(r.data.isFavorite === true, JSON.stringify(r.data));
});
await step('message seller', async () => {
  const r = await call('/messages', { method: 'POST', token: buyer, body: { listingId: listing.id, text: 'Still available?' } });
  expect(r.status === 201, JSON.stringify(r.data)); thread = r.data.threadId;
});
await step('seller sees unread + replies', async () => {
  const r = await call('/messages', { token: seller });
  expect(r.data.unread >= 1, 'no unread');
  const s = await call('/messages', { method: 'POST', token: seller, body: { threadId: thread, text: 'Yes!' } });
  expect(s.status === 201, JSON.stringify(s.data));
});
await step('checkout with bad card rejected', async () => {
  const r = await call('/orders', { method: 'POST', token: buyer, body: { items: [{ listingId: listing.id, qty: 1 }], shipping: { name: 'A', address: 'B', city: 'C', zip: '1', country: 'D' }, payment: { card: '12', exp: '12/30', cvc: '123' } } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});
await step('checkout', async () => {
  const r = await call('/orders', { method: 'POST', token: buyer, body: { items: [{ listingId: listing.id, qty: 2 }], shipping: { name: 'Demo', address: '1 Main St', city: 'Madrid', zip: '28001', country: 'Spain' }, payment: { card: '4242 4242 4242 4242', exp: '12/30', cvc: '123' } } });
  expect(r.status === 201 && r.data.order.total > 0, JSON.stringify(r.data)); order = r.data.order;
});
await step('listing now sold', async () => {
  const r = await call(`/listings/${listing.id}`);
  expect(r.data.item.status === 'sold' && r.data.item.quantity === 0, JSON.stringify(r.data.item));
});
await step('seller sees sale + ships it', async () => {
  const s = await call('/orders/sales', { token: seller });
  expect(s.data.items.some(o => o.id === order.id) && s.data.revenue === 78, JSON.stringify(s.data));
  const r = await call(`/orders/${order.id}/status`, { method: 'PATCH', token: seller, body: { status: 'shipped' } });
  expect(r.data.order?.status === 'shipped', JSON.stringify(r.data));
});
await step('buyer sees order', async () => {
  const r = await call('/orders', { token: buyer });
  expect(r.data.items.some(o => o.id === order.id && o.status === 'shipped'), 'order missing');
});
await step('delete listing', async () => {
  const r = await call(`/listings/${listing.id}`, { method: 'DELETE', token: seller });
  expect(r.data.ok, JSON.stringify(r.data));
});
await step('unknown route gives clear 404', async () => {
  const r = await call('/nope');
  expect(r.status === 404 && /No API route/.test(r.data.error), JSON.stringify(r.data));
});

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll backend checks passed.');
process.exit(failed ? 1 : 0);
