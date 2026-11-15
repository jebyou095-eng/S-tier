// API checks. Start the backend first (npm start), then: npm test   (ADMIN_PW=… npm test also checks admin)
const BASE = process.env.API || 'http://localhost:4200/api';
let failed = 0;
const step = async (n, fn) => { try { await fn(); console.log('PASS  ' + n); } catch (e) { failed++; console.log('FAIL  ' + n + '\n      ' + e.message); } };
const call = async (p, o = {}) => { const r = await fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const ok = (c, m) => { if (!c) throw new Error(m); };
await step('health', async () => ok((await call('/health')).d.ok, 'backend not answering on ' + BASE));
await step('brands', async () => ok((await call('/brands')).d.items?.length >= 6, 'brands missing'));
await step('models + filters', async () => {
  const r = await call('/models?body=suv&fuel=Electric&sort=price-asc');
  ok(r.d.items.length && r.d.items.every(m => m.body === 'suv' && m.fuel === 'Electric'), JSON.stringify(r.d.items.map(m => m.id)));
});
await step('price filter + sort', async () => { const r = await call('/models?max=400000&sort=price-desc'); ok(r.d.items.every((m, i, a) => m.price <= 400000 && (!i || a[i - 1].price >= m.price)), 'wrong'); });
await step('search', async () => ok((await call('/models?q=novara')).d.items.every(m => m.brand === 'novara'), 'search wrong'));
await step('model detail + similar', async () => { const r = await call('/models/solano-voltra'); ok(r.d.item?.id === 'solano-voltra' && r.d.similar.length, JSON.stringify(r.d)); });
await step('unknown model 404', async () => ok((await call('/models/nope')).s === 404, 'expected 404'));
await step('lead validation', async () => ok((await call('/leads', { method: 'POST', body: JSON.stringify({ modelId: 'solano-voltra' }) })).s === 400, 'expected 400'));
await step('test-drive request', async () => {
  const r = await call('/leads', { method: 'POST', body: JSON.stringify({ type: 'test-drive', modelId: 'solano-voltra', name: 'Test Driver', phone: '+212 600 000 000', date: new Date().toISOString().slice(0, 10) }) });
  ok(r.s === 201 && r.d.ref, JSON.stringify(r.d));
});
await step('admin protected', async () => ok((await call('/admin/leads')).s === 401, 'expected 401'));
if (process.env.ADMIN_PW) await step('admin: add, edit, delete a car', async () => {
  const t = (await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: process.env.ADMIN_PW }) })).d.token; ok(t, 'login failed');
  const h = { Authorization: 'Bearer ' + t };
  const car = { brand: 'aurex', name: 'Test Car', body: 'hatchback', fuel: 'Petrol', price: 250000, year: 2026, power: 120, torque: 200, accel: 9.5, top: 190, seats: 5, trunk: 350,
    dims: { length: 4100, width: 1780, height: 1460, wheelbase: 2600 }, colors: [{ name: 'Red', hex: '#cc0000' }], features: ['A'], trims: [] };
  const c = await call('/admin/models', { method: 'POST', headers: h, body: JSON.stringify(car) }); ok(c.s === 201, JSON.stringify(c.d));
  const u = await call('/admin/models/' + c.d.item.id, { method: 'PUT', headers: h, body: JSON.stringify({ ...car, price: 260000 }) }); ok(u.d.item?.price === 260000, JSON.stringify(u.d));
  const d = await call('/admin/models/' + c.d.item.id, { method: 'DELETE', headers: h }); ok(d.d.ok, JSON.stringify(d.d));
  const l = await call('/admin/leads', { headers: h }); ok(l.d.items.length, 'no leads');
});
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll backend checks passed.');
process.exit(failed ? 1 : 0);
