import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no extra dependency).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const PORT = Number(process.env.PORT || 4000);
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
export const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
export const DATA_FILE = path.join(ROOT, 'data', 'db.json');
export const UPLOAD_DIR = path.join(ROOT, 'uploads');

if (JWT_SECRET === 'dev-only-secret-change-me' && process.env.NODE_ENV === 'production') {
  console.warn('[backend] WARNING: JWT_SECRET is not set. Set it before going live.');
}
