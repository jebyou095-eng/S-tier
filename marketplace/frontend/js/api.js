// All calls to the backend go through here. Errors are tagged so you can tell
// a backend problem (it answered with an error) from a network problem (it didn't answer at all).
import { API_URL } from './config.js';
import { auth } from './store.js';

export class ApiError extends Error {
  constructor(message, { status, where, kind }) { super(message); Object.assign(this, { status, where, kind }); }
}

export const assetUrl = (u) => (u && u.startsWith('/uploads/') ? API_URL + u : u);

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (body && !form) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(API_URL + '/api' + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch (e) {
    console.error(`[frontend → backend] Network error calling ${method} ${API_URL}/api${path}. Is the backend running?`, e);
    window.dispatchEvent(new CustomEvent('api:offline'));
    throw new ApiError(`Can't reach the server at ${API_URL}. Start the backend (cd backend && npm start).`, { kind: 'network', where: 'network' });
  }
  window.dispatchEvent(new CustomEvent('api:online'));
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401 && auth.token) auth.logout(true);
    const msg = data?.error || `Server error ${res.status}`;
    console.warn(`[backend error] ${res.status} at ${data?.where || method + ' ' + path}: ${msg}`);
    throw new ApiError(msg, { status: res.status, where: data?.where, kind: 'backend' });
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });
