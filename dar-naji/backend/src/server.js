import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MENU } from './menu.js';

// ---------- Config ----------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = Number(process.env.PORT || 4100);
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Opening hours used to validate bookings. ⚠ Only "closes at 23:00" was confirmed; adjust OPEN if needed.
export const HOURS = { open: '12:00', lastBooking: '22:30', close: '23:00' };
const SEATING = { salle: 'Salle principale', terrasse: 'Terrasse', salon: 'Salon privé' };

// ---------- Tiny JSON database ----------
let db = { reservations: [], messages: [] };
try { if (fs.existsSync(DB_FILE)) db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
catch (e) { console.error(`[backend] Impossible de lire ${DB_FILE}: ${e.message}`); process.exit(1); }
const save = () => { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DB_FILE); };

// ---------- Admin password ----------
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const pwFile = path.join(DATA_DIR, 'admin-password.txt');
if (!ADMIN_PASSWORD) {
  if (!fs.existsSync(pwFile)) fs.writeFileSync(pwFile, crypto.randomBytes(6).toString('base64url'));
  ADMIN_PASSWORD = fs.readFileSync(pwFile, 'utf8').trim();
}
const sessions = new Map(); // token -> expiry

// ---------- Helpers ----------
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new ApiError(400, m);
const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const localISODate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function requireAdmin(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) return next(new ApiError(401, 'Session gérant expirée. Reconnectez-vous.'));
  next();
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (o, cb) => cb(null, !o || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || o === process.env.CORS_ORIGIN) }));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => req.path !== '/api/health' && console.log(`[backend] ${res.statusCode >= 400 ? 'erreur' : 'ok    '} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t}ms)`));
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'dar-naji-backend' }));
app.get('/api/menu', (_req, res) => res.json({ categories: MENU, currency: 'MAD' }));
app.get('/api/info', (_req, res) => res.json({ hours: HOURS, seating: SEATING }));

// Public: book a table
app.post('/api/reservations', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), phone = clean(b.phone, 30), email = clean(b.email, 120), notes = clean(b.notes, 500);
  const date = clean(b.date, 10), time = clean(b.time, 5), seating = clean(b.seating, 20), occasion = clean(b.occasion, 40);
  const guests = parseInt(b.guests, 10);
  if (name.length < 2) throw bad('Merci d’indiquer votre nom.');
  if (!/^[+\d][\d\s().-]{7,}$/.test(phone)) throw bad('Merci d’indiquer un numéro de téléphone valide.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('L’adresse e-mail ne semble pas valide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Merci de choisir une date.');
  const today = localISODate();
  const max = localISODate(new Date(Date.now() + 90 * 864e5));
  if (date < today) throw bad('Cette date est déjà passée.');
  if (date > max) throw bad('Les réservations sont ouvertes jusqu’à 90 jours à l’avance.');
  if (!/^\d{2}:\d{2}$/.test(time) || toMin(time) < toMin(HOURS.open) || toMin(time) > toMin(HOURS.lastBooking))
    throw bad(`Nous prenons les réservations entre ${HOURS.open} et ${HOURS.lastBooking}.`);
  if (date === today) {
    const now = new Date(); if (toMin(time) < now.getHours() * 60 + now.getMinutes() + 30) throw bad('Pour aujourd’hui, réservez au moins 30 minutes à l’avance.');
  }
  if (!(guests >= 1 && guests <= 40)) throw bad('Nombre de personnes : entre 1 et 40. Pour plus, appelez-nous.');
  if (!SEATING[seating]) throw bad('Choisissez un espace : salle, terrasse ou salon privé.');
  const r = {
    id: id('res'), code: 'DN-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    name, phone, email, date, time, guests, seating, occasion, notes, status: 'en attente', createdAt: new Date().toISOString(),
  };
  db.reservations.push(r); save();
  console.log(`[backend] Nouvelle réservation ${r.code} : ${guests} pers. le ${date} à ${time} (${SEATING[seating]}) – ${name}`);
  res.status(201).json({ reservation: { code: r.code, date, time, guests, seating: SEATING[seating], name } });
});

// Public: contact / private events
app.post('/api/contact', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), contact = clean(b.contact, 120), message = clean(b.message, 2000);
  if (name.length < 2 || contact.length < 5 || message.length < 5) throw bad('Merci de remplir votre nom, un moyen de vous joindre et votre message.');
  db.messages.push({ id: id('msg'), name, contact, message, read: false, createdAt: new Date().toISOString() }); save();
  res.status(201).json({ ok: true });
});

// Admin
app.post('/api/admin/login', (req, res) => {
  const pw = String(req.body?.password || '');
  const ok = pw.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD));
  if (!ok) throw new ApiError(401, 'Mot de passe incorrect.');
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + 12 * 3600e3);
  res.json({ token });
});
app.get('/api/admin/reservations', requireAdmin, (_req, res) => {
  const list = [...db.reservations].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json({ items: list.map(r => ({ ...r, seatingLabel: SEATING[r.seating] })), messages: [...db.messages].reverse() });
});
app.patch('/api/admin/reservations/:id', requireAdmin, (req, res) => {
  const r = db.reservations.find(x => x.id === req.params.id);
  if (!r) throw new ApiError(404, 'Réservation introuvable.');
  const status = req.body?.status;
  if (!['en attente', 'confirmée', 'annulée', 'venue'].includes(status)) throw bad('Statut inconnu.');
  r.status = status; save();
  res.json({ reservation: r });
});
app.patch('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const m = db.messages.find(x => x.id === req.params.id);
  if (!m) throw new ApiError(404, 'Message introuvable.');
  m.read = true; save(); res.json({ ok: true });
});

app.use('/api', (req, _res, next) => next(new ApiError(404, `Aucune route ${req.method} ${req.originalUrl}`)));
app.get('/', (_req, res) => res.type('text').send('API Dar Naji en marche. Le site est sur http://localhost:5180'));
app.use((err, req, res, _next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(`[backend] ERREUR dans ${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({ error: status >= 500 ? 'Erreur du serveur.' : err.message, where: `backend ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`[backend] API Dar Naji sur http://localhost:${PORT}/api`);
  console.log(process.env.ADMIN_PASSWORD
    ? '[backend] Espace gérant : mot de passe défini dans backend/.env'
    : `[backend] Espace gérant : http://localhost:5180/admin.html  —  mot de passe : ${ADMIN_PASSWORD}  (enregistré dans backend/data/admin-password.txt)`);
}).on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `[backend] Le port ${PORT} est déjà utilisé. Changez PORT dans backend/.env` : `[backend] ${e.message}`);
  process.exit(1);
});
