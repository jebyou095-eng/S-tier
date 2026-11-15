import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PORT, CORS_ORIGIN, UPLOAD_DIR, DATA_FILE } from './config.js';
import { load, flush } from './db.js';
import { ApiError } from './errors.js';
import { seedIfEmpty } from './seed.js';
import auth from './routes/auth.js';
import listings from './routes/listings.js';
import orders from './routes/orders.js';
import favorites from './routes/favorites.js';
import messages from './routes/messages.js';
import users from './routes/users.js';
import meta from './routes/meta.js';

load();
await seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || CORS_ORIGIN.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
}));
app.use(express.json({ limit: '1mb' }));

// Request log: method, path, status, time. Tagged [backend] so it's obvious where a line came from.
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    const tag = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'warn ' : 'ok   ';
    console.log(`[backend] ${tag} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t}ms)`);
  });
  next();
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use('/api', meta);
app.use('/api/auth', auth);
app.use('/api/listings', listings);
app.use('/api/orders', orders);
app.use('/api/favorites', favorites);
app.use('/api/messages', messages);
app.use('/api/users', users);

app.use('/api', (req, _res, next) => next(new ApiError(404, `No API route for ${req.method} ${req.originalUrl}.`)));
app.get('/', (_req, res) => res.type('text').send('Agora backend is running. The API is under /api (try /api/health). Open the frontend at http://localhost:5173'));

// Every error leaves as JSON: { error, where, details }.
app.use((err, req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Unexpected server error';
  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be under 8 MB.' : err.code === 'LIMIT_FILE_COUNT' ? 'You can upload at most 8 images.' : message;
  }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Request body is not valid JSON.'; }
  if (status >= 500) console.error(`[backend] ERROR in ${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({ error: message, where: `backend ${req.method} ${req.originalUrl}`, details: err.details });
});

const server = app.listen(PORT, () => {
  console.log(`[backend] Agora API listening on http://localhost:${PORT}/api`);
  console.log(`[backend] Data file: ${DATA_FILE}`);
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE'
    ? `[backend] Port ${PORT} is already in use. Stop the other process or set PORT=4001 in backend/.env`
    : `[backend] Server failed to start: ${e.message}`);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
