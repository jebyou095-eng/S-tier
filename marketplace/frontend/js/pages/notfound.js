export default async function notFound(app) {
  app.innerHTML = `<div class="container empty" style="padding:120px 20px"><div class="empty__art" style="font-size:160px">404</div>
    <h3>This page wandered off</h3><p class="muted">It may have been sold, moved or never existed.</p><a class="btn btn--ink" href="#/">Back home</a></div>`;
}
