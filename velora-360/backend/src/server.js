import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BRANDS, MODELS } from './catalog.js';

// ---------- Config ----------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const PORT = Number(process.env.PORT || 4200);
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- JSON database (seeded from catalog.js on first run) ----------
const fresh = () => ({ brands: structuredClone(BRANDS), models: structuredClone(MODELS), leads: [] });
let db;
if (process.argv.includes('--reset-only') || !fs.existsSync(DB_FILE)) {
  db = fresh(); save();
  console.log('[backend] Catalogue created from src/catalog.js');
  if (process.argv.includes('--reset-only')) process.exit(0);
} else {
  try { db = { ...fresh(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
  catch (e) { console.error(`[backend] Cannot read ${DB_FILE}: ${e.message}. Fix it or run "npm run seed".`); process.exit(1); }
}
function save() { const t = DB_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db, null, 2)); fs.renameSync(t, DB_FILE); }

// ---------- Admin password ----------
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const pwFile = path.join(DATA_DIR, 'admin-password.txt');
if (!ADMIN_PASSWORD) {
  if (!fs.existsSync(pwFile)) fs.writeFileSync(pwFile, crypto.randomBytes(6).toString('base64url'));
  ADMIN_PASSWORD = fs.readFileSync(pwFile, 'utf8').trim();
}
const sessions = new Map();

// ---------- Helpers ----------
class ApiError extends Error { constructor(s, m) { super(m); this.status = s; } }
const bad = (m) => new ApiError(400, m);
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const BODIES = ['hatchback', 'sedan', 'suv', 'coupe', 'pickup'];
const withBrand = (m) => ({ ...m, brandName: db.brands.find(b => b.slug === m.brand)?.name || m.brand });
const requireAdmin = (req, _res, next) => {
  const exp = sessions.get((req.headers.authorization || '').replace(/^Bearer /, ''));
  next(exp && exp > Date.now() ? undefined : new ApiError(401, 'Admin session expired. Please log in again.'));
};

function validateModel(b, existingId) {
  const out = {};
  out.name = clean(b.name, 60); if (out.name.length < 1) throw bad('Model name is required.');
  out.brand = clean(b.brand, 40); if (!db.brands.some(x => x.slug === out.brand)) throw bad(`Unknown brand "${out.brand}".`);
  out.body = clean(b.body, 20); if (!BODIES.includes(out.body)) throw bad(`Body must be one of: ${BODIES.join(', ')}.`);
  for (const k of ['price', 'year', 'seats', 'trunk', 'power', 'torque', 'accel', 'top']) {
    const n = Number(b[k]); if (!Number.isFinite(n) || n < 0) throw bad(`"${k}" must be a positive number.`); out[k] = n;
  }
  out.dims = {};
  for (const k of ['length', 'width', 'height', 'wheelbase']) {
    const n = Number(b.dims?.[k]); if (!(n >= 1000 && n <= 7000)) throw bad(`Dimension "${k}" must be between 1000 and 7000 mm.`); out.dims[k] = n;
  }
  for (const k of ['fuel', 'drive', 'gearbox', 'engine', 'consumption', 'summary']) out[k] = clean(b[k], k === 'summary' ? 500 : 80);
  out.rating = Math.min(5, Math.max(0, Number(b.rating) || 0));
  out.colors = (Array.isArray(b.colors) ? b.colors : []).filter(c => /^#[0-9a-f]{6}$/i.test(c?.hex)).map(c => ({ name: clean(c.name, 40) || c.hex, hex: c.hex })).slice(0, 10);
  if (!out.colors.length) throw bad('Add at least one paint colour (name + #hex).');
  out.features = (Array.isArray(b.features) ? b.features : []).map(f => clean(f, 80)).filter(Boolean).slice(0, 20);
  out.trims = (Array.isArray(b.trims) ? b.trims : []).filter(t => t?.name && Number(t.price) > 0).map(t => ({ name: clean(t.name, 40), price: Number(t.price) })).slice(0, 8);
  if (!out.trims.length) out.trims = [{ name: 'Standard', price: out.price }];
  out.id = existingId || `${out.brand}-${out.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (!existingId && db.models.some(x => x.id === out.id)) throw bad('A model with this name already exists for that brand.');
  return out;
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (o, cb) => cb(null, !o || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || o === process.env.CORS_ORIGIN) }));
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => req.path !== '/api/health' && console.log(`[backend] ${res.statusCode >= 400 ? 'error' : 'ok   '} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t}ms)`));
  next();
});

app.get('/api/health', (_q, res) => res.json({ ok: true, service: 'velora-backend' }));
app.get('/api/brands', (_q, res) => res.json({ items: db.brands.map(b => ({ ...b, count: db.models.filter(m => m.brand === b.slug).length })) }));

// GET /api/models?brand=&body=&fuel=&min=&max=&seats=&q=&sort=price-asc|price-desc|power|name
app.get('/api/models', (req, res) => {
  const { brand, body, fuel, min, max, seats, q, sort = 'name' } = req.query;
  let list = db.models.slice();
  if (brand) list = list.filter(m => String(brand).split(',').includes(m.brand));
  if (body) list = list.filter(m => String(body).split(',').includes(m.body));
  if (fuel) list = list.filter(m => String(fuel).split(',').includes(m.fuel));
  if (min) list = list.filter(m => m.price >= +min);
  if (max) list = list.filter(m => m.price <= +max);
  if (seats) list = list.filter(m => m.seats >= +seats);
  if (q) { const w = String(q).toLowerCase(); list = list.filter(m => `${withBrand(m).brandName} ${m.name} ${m.body} ${m.fuel}`.toLowerCase().includes(w)); }
  const S = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, power: (a, b) => b.power - a.power, name: (a, b) => (a.brand + a.name).localeCompare(b.brand + b.name) };
  list.sort(S[sort] || S.name);
  res.json({ items: list.map(withBrand), total: list.length, facets: { bodies: BODIES, fuels: [...new Set(db.models.map(m => m.fuel))].sort() } });
});

app.get('/api/models/:id', (req, res) => {
  const m = db.models.find(x => x.id === req.params.id);
  if (!m) throw new ApiError(404, 'Car not found.');
  const similar = db.models.filter(x => x.id !== m.id && (x.body === m.body || x.brand === m.brand))
    .sort((a, b) => Math.abs(a.price - m.price) - Math.abs(b.price - m.price)).slice(0, 3).map(withBrand);
  res.json({ item: withBrand(m), brand: db.brands.find(b => b.slug === m.brand), similar });
});

// Test drive / quote / financing requests
app.post('/api/leads', (req, res) => {
  const b = req.body || {};
  const type = ['test-drive', 'quote', 'finance'].includes(b.type) ? b.type : 'quote';
  const name = clean(b.name, 80), phone = clean(b.phone, 30), email = clean(b.email, 120), city = clean(b.city, 60), message = clean(b.message, 1000);
  const model = db.models.find(x => x.id === b.modelId);
  if (!model) throw bad('Please choose a car.');
  if (name.length < 2) throw bad('Please enter your name.');
  if (!/^[+\d][\d\s().-]{7,}$/.test(phone)) throw bad('Please enter a valid phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('That email address does not look right.');
  const date = clean(b.date, 10);
  if (type === 'test-drive' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0, 10))) throw bad('Please choose a test-drive date from today onwards.');
  const lead = { id: 'lead_' + crypto.randomUUID().slice(0, 8), ref: 'VL-' + crypto.randomBytes(3).toString('hex').toUpperCase(), type,
    modelId: model.id, modelName: `${withBrand(model).brandName} ${model.name}`, trim: clean(b.trim, 40), color: clean(b.color, 40),
    name, phone, email, city, date, message, finance: b.finance && typeof b.finance === 'object' ? b.finance : null,
    status: 'new', createdAt: new Date().toISOString() };
  db.leads.push(lead); save();
  console.log(`[backend] New ${type} request ${lead.ref}: ${lead.modelName} – ${name}`);
  res.status(201).json({ ref: lead.ref, type });
});

// Admin
app.post('/api/admin/login', (req, res) => {
  const pw = String(req.body?.password || '');
  if (!(pw.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD)))) throw new ApiError(401, 'Wrong password.');
  const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, Date.now() + 12 * 3600e3);
  res.json({ token });
});
app.get('/api/admin/leads', requireAdmin, (_q, res) => res.json({ items: [...db.leads].reverse() }));
app.patch('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const l = db.leads.find(x => x.id === req.params.id); if (!l) throw new ApiError(404, 'Request not found.');
  if (!['new', 'contacted', 'done', 'lost'].includes(req.body?.status)) throw bad('Unknown status.');
  l.status = req.body.status; save(); res.json({ item: l });
});
app.post('/api/admin/models', requireAdmin, (req, res) => { const m = validateModel(req.body || {}); db.models.push(m); save(); res.status(201).json({ item: withBrand(m) }); });
app.put('/api/admin/models/:id', requireAdmin, (req, res) => {
  const i = db.models.findIndex(x => x.id === req.params.id); if (i < 0) throw new ApiError(404, 'Car not found.');
  db.models[i] = validateModel(req.body || {}, req.params.id); save(); res.json({ item: withBrand(db.models[i]) });
});
app.delete('/api/admin/models/:id', requireAdmin, (req, res) => {
  const i = db.models.findIndex(x => x.id === req.params.id); if (i < 0) throw new ApiError(404, 'Car not found.');
  db.models.splice(i, 1); save(); res.json({ ok: true });
});

app.use('/api', (req, _r, next) => next(new ApiError(404, `No API route for ${req.method} ${req.originalUrl}`)));
app.get('/', (_q, res) => res.type('text').send('Velora 360 API is running. Open the site at http://localhost:5190'));
app.use((err, req, res, _n) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(`[backend] ERROR in ${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({ error: status >= 500 ? 'Server error.' : err.message, where: `backend ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`[backend] Velora 360 API on http://localhost:${PORT}/api`);
  console.log(process.env.ADMIN_PASSWORD ? '[backend] Admin password: set in backend/.env'
    : `[backend] Admin: http://localhost:5190/#/admin  —  password: ${ADMIN_PASSWORD}  (saved in backend/data/admin-password.txt)`);
}).on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `[backend] Port ${PORT} is busy. Set PORT in backend/.env` : `[backend] ${e.message}`); process.exit(1); });
