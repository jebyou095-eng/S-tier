// Tiny JSON-file database. Data lives in backend/data/db.json.
// Writes are atomic (write temp file, then rename) so a crash can't corrupt it.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_FILE } from './config.js';

const EMPTY = { users: [], listings: [], orders: [], favorites: [], messages: [], reviews: [] };
let state = null;
let timer = null;

export function load() {
  if (state) return state;
  if (fs.existsSync(DATA_FILE)) {
    try {
      state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    } catch (e) {
      throw new Error(`[backend/db] Could not read ${DATA_FILE}: ${e.message}. Fix or delete the file and run "npm run seed".`);
    }
  } else {
    state = structuredClone(EMPTY);
  }
  return state;
}

export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 50);
}

export function flush() {
  if (!state) return;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export function reset() {
  state = structuredClone(EMPTY);
  return state;
}

export const db = new Proxy({}, { get: (_, key) => load()[key] });
export const id = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
