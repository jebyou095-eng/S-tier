// Test de l'API (lancez le backend avant : npm start). Chaque étape affiche OK ou ÉCHEC.
const BASE = process.env.API || 'http://localhost:4100/api';
let failed = 0;
const step = async (n, fn) => { try { await fn(); console.log('OK     ' + n); } catch (e) { failed++; console.log('ÉCHEC  ' + n + '\n       ' + e.message); } };
const call = async (p, o = {}) => { const r = await fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const ok = (c, m) => { if (!c) throw new Error(m); };
const tomorrow = new Date(Date.now() + 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let id;
await step('serveur en marche', async () => ok((await call('/health')).d.ok, 'pas de réponse sur ' + BASE));
await step('carte', async () => { const r = await call('/menu'); ok(r.d.categories?.length >= 4, JSON.stringify(r.d)); });
await step('réservation refusée si incomplète', async () => ok((await call('/reservations', { method: 'POST', body: '{}' })).s === 400, 'devrait être 400'));
await step('réservation hors horaires refusée', async () => { const r = await call('/reservations', { method: 'POST', body: JSON.stringify({ name: 'Test', phone: '+212600000000', date: tomorrow, time: '03:00', guests: 2, seating: 'salle' }) }); ok(r.s === 400, JSON.stringify(r.d)); });
await step('réservation valide', async () => { const r = await call('/reservations', { method: 'POST', body: JSON.stringify({ name: 'Test Client', phone: '+212 600 000 000', date: tomorrow, time: '20:00', guests: 4, seating: 'terrasse' }) }); ok(r.s === 201 && r.d.reservation.code, JSON.stringify(r.d)); });
await step('message de contact', async () => ok((await call('/contact', { method: 'POST', body: JSON.stringify({ name: 'Test', contact: 'test@test.ma', message: 'Bonjour !' }) })).s === 201, 'contact'));
await step('admin : mauvais mot de passe refusé', async () => ok((await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: 'x' }) })).s === 401, 'devrait être 401'));
await step('admin : liste protégée', async () => ok((await call('/admin/reservations')).s === 401, 'devrait être 401'));
if (process.env.ADMIN_PW) {
  await step('admin : connexion + confirmation', async () => {
    const t = (await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: process.env.ADMIN_PW }) })).d.token; ok(t, 'pas de token');
    const h = { Authorization: 'Bearer ' + t };
    const l = await call('/admin/reservations', { headers: h }); id = l.d.items.at(-1).id;
    const u = await call('/admin/reservations/' + id, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'confirmée' }) });
    ok(u.d.reservation?.status === 'confirmée', JSON.stringify(u.d));
  });
}
console.log(failed ? `\n${failed} test(s) en échec.` : '\nTous les tests passent.');
process.exit(failed ? 1 : 0);
