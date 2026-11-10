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
  if (key) {
    const { iv, ct } = await encryptObj(key, state);
    await idbSet(VAULT, { v: 1, locked: true, salt, iter: iterations, iv, ct });
  } else {
    await idbSet(VAULT, { v: 1, locked: false, data: state });
  }
}

export async function setPasscode(pass, state) {
  salt = rand(16);
  iterations = ITERATIONS;
  key = await deriveKey(pass, salt, iterations);
  await save(state);
}

export async function removePasscode(state) {
  key = null; salt = null;
  await save(state);
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
