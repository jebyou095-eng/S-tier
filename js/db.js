// Local-only storage (IndexedDB) with optional AES-256-GCM encryption.
// The encryption key is derived from your passcode with PBKDF2-SHA256 and is
// never stored; it lives only in memory while the app is unlocked.

const DB_NAME = 'pocket-stats';
const STORE = 'kv';
const VAULT = 'vault';
export const ITERATIONS = 600000;

const enc = new TextEncoder();
const dec = new TextDecoder();

let key = null;
let salt = null;
let iterations = ITERATIONS;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

const idbGet = (k) => tx('readonly', (s) => s.get(k));
const idbSet = (k, v) => tx('readwrite', (s) => s.put(v, k));
const idbClear = () => tx('readwrite', (s) => s.clear());

/** Non-personal cache (public food database, product photos). Not encrypted: it holds no personal data. */
export const cacheGet = (k) => idbGet(`cache:${k}`);
export const cacheSet = (k, v) => idbSet(`cache:${k}`, v);

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(pass, saltBytes, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptObj(k, obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
  return { iv, ct: new Uint8Array(ct) };
}

async function decryptObj(k, iv, ct) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct);
  return JSON.parse(dec.decode(pt));
}

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function cryptoAvailable() {
  return !!(globalThis.crypto && crypto.subtle);
}

/** Returns { state } for unprotected data, { locked: true } when a passcode is needed, or { state: null } on first run. */
export async function load() {
  const v = await idbGet(VAULT);
  if (!v) return { state: null };
  if (v.locked) return { locked: true };
  return { state: v.data };
}

export async function unlock(pass) {
  const v = await idbGet(VAULT);
  const k = await deriveKey(pass, v.salt, v.iter);
  const data = await decryptObj(k, v.iv, v.ct); // throws if the passcode is wrong
  key = k; salt = v.salt; iterations = v.iter;
  return data;
}

export async function verify(pass) {
  if (!key) return true;
  const v = await idbGet(VAULT);
  try {
    await decryptObj(await deriveKey(pass, v.salt, v.iter), v.iv, v.ct);
    return true;
  } catch {
    return false;
  }
}

export async function save(state) {
  // Your food photos and learned scans are stored as separate records, so a save doesn't re-encrypt them all.
  if (state?.food && (Object.keys(state.food.myPhotos || {}).length || Object.keys(state.food.scans || {}).length)) {
    state = { ...state, food: { ...state.food, myPhotos: {}, scans: {} } };
  }
  if (key) {
    const { iv, ct } = await encryptObj(key, state);
    await idbSet(VAULT, { v: 1, locked: true, salt, iter: iterations, iv, ct });
  } else {
    await idbSet(VAULT, { v: 1, locked: false, data: state });
  }
}

export async function setPasscode(pass, state) {
  const side = await readSide(); // read photos & learned scans with the current key first
  salt = rand(16);
  iterations = ITERATIONS;
  key = await deriveKey(pass, salt, iterations);
  await save(state);
  for (const [k, v] of side) await putSide(k, v); // re-encrypt them with the new key
}

export async function removePasscode(state) {
  const side = await readSide();
  key = null; salt = null;
  await save(state);
  for (const [k, v] of side) await putSide(k, v);
}

// ---------- side records: your food photos and learned food scans ----------
// One record each (so a normal save stays small), encrypted exactly like the main record.
const SIDE = ['photo:', 'scan:'];

async function putSide(k, value) {
  if (key) {
    const { iv, ct } = await encryptObj(key, value);
    await idbSet(k, { locked: true, iv, ct });
  } else {
    await idbSet(k, { locked: false, data: value });
  }
}

async function readSide(prefixes = SIDE) {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  const out = [];
  for (const k of keys) {
    if (typeof k !== 'string' || !prefixes.some((p) => k.startsWith(p))) continue;
    const r = await idbGet(k);
    try {
      const v = r?.locked ? (key ? await decryptObj(key, r.iv, r.ct) : undefined) : r?.data;
      if (v !== undefined) out.push([k, v]);
    } catch { /* skip a damaged record */ }
  }
  return out;
}

export const savePhoto = (id, dataUrl) => putSide(`photo:${id}`, dataUrl);

export async function savePhotos(map) {
  for (const [id, url] of Object.entries(map || {})) await savePhoto(id, url);
}

/** All your food photos ({food id: data URL}); needs the passcode key when locked. */
export async function loadPhotos() {
  const out = {};
  for (const [k, v] of await readSide(['photo:'])) {
    if (typeof v === 'string' && v.startsWith('data:image/jpeg;base64,')) out[k.slice(6)] = v;
  }
  return out;
}

export const saveScan = (id, rec) => putSide(`scan:${id}`, rec);
export const deleteScan = (id) => tx('readwrite', (s) => s.delete(`scan:${id}`));

/** Learned food scans ({food id: record}). */
export async function loadScans() {
  const out = {};
  for (const [k, v] of await readSide(['scan:'])) if (v && typeof v === 'object') out[k.slice(5)] = v;
  return out;
}

export const hasPasscode = () => !!key;

/** Drop the key from memory. Data stays encrypted on disk. */
export function lock() { key = null; salt = null; }

export async function wipe() {
  lock();
  await idbClear();
}

/** Backup file contents. Encrypted with the current passcode if one is set. */
export async function exportBackup(state) {
  const base = { app: 'pocket-stats', v: 1, exported: new Date().toISOString() };
  if (!key) return { ...base, encrypted: false, data: state };
  const { iv, ct } = await encryptObj(key, state);
  return { ...base, encrypted: true, iter: iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function readBackup(obj, pass) {
  if (!obj || obj.app !== 'pocket-stats') throw new Error('This is not a Pocket Stats backup.');
  if (!obj.encrypted) return obj.data;
  const k = await deriveKey(pass, fromB64(obj.salt), obj.iter);
  return decryptObj(k, fromB64(obj.iv), fromB64(obj.ct));
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}
