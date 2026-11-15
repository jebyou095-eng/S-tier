// Hash router: "#/item/123?x=1" -> { path: '/item/123', params: { id: '123' }, query: URLSearchParams }
import { $, reveal, parallax, magnetic, progressStart, progressDone, toastError } from './ui.js';

const routes = [];
export const route = (pattern, load) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')).replace(/\//g, '\\/') + '\\/?$');
  routes.push({ re, keys, load });
};
export const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
export const currentQuery = () => new URLSearchParams(location.hash.split('?')[1] || '');

let token = 0;
let cleanup = null;
export async function render() {
  const my = ++token;
  const [path = '/', qs = ''] = location.hash.replace(/^#/, '').split('?');
  const ctx = { path: path || '/', query: new URLSearchParams(qs), params: {} };
  const match = routes.find(r => r.re.test(ctx.path)) || routes.find(r => r.re.test('/404'));
  const m = ctx.path.match(match.re);
  match.keys.forEach((k, i) => (ctx.params[k] = decodeURIComponent(m[i + 1])));

  const app = $('#app');
  progressStart();
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} cleanup = null; }
  app.classList.remove('enter');
  app.classList.add('leave');
  try {
    const [page] = await Promise.all([match.load(), new Promise(r => setTimeout(r, 160))]);
    if (my !== token) return;
    app.classList.remove('leave');
    void app.offsetWidth;
    app.classList.add('enter');
    window.scrollTo({ top: 0, behavior: 'instant' });
    cleanup = await page.default(app, ctx);
    if (my !== token) return;
    reveal(app); parallax(app); magnetic(document);
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('is-active', ctx.path.startsWith('/' + a.dataset.nav)));
  } catch (e) {
    console.error(`[frontend] Page "${ctx.path}" failed to render:`, e);
    app.classList.remove('leave');
    app.innerHTML = `<div class="container empty"><div class="empty__art">!</div><h3>Something went wrong</h3>
      <p class="muted">${e.kind === 'network' ? 'The frontend could not reach the backend.' : e.kind === 'backend' ? 'The backend returned an error.' : 'A frontend error happened while showing this page.'}</p>
      <p><code>${String(e.message).replace(/</g, '&lt;')}</code></p><a class="btn btn--ink" href="#/">Back home</a></div>`;
    if (e.kind) toastError(e);
  } finally {
    progressDone();
  }
}

export function start() {
  addEventListener('hashchange', render);
  if (!location.hash) history.replaceState(null, '', '#/');
  render();
}
