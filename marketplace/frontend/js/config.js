// Where the backend API lives. Change this when you deploy.
// You can also override it without editing code: localStorage.setItem('agora.api', 'https://api.example.com')
export const API_URL = (() => {
  try { const o = localStorage.getItem('agora.api'); if (o) return o.replace(/\/$/, ''); } catch {}
  return `${location.protocol}//${location.hostname || 'localhost'}:4000`;
})();
