export default async function about(app) {
  app.innerHTML = `
  <div class="container">
    <div class="about-hero"><span class="eyebrow fade-up">How Agora works</span>
      <h1 class="fade-up" style="--d:.08s">A marketplace built on <em>trust</em> and good taste.</h1></div>
    <div class="how" style="padding-bottom:40px">
      <div class="how__card reveal"><div class="how__num">🛡</div><h3>Buyer protection</h3><p>Every purchase is covered. If an item doesn't arrive or isn't as described, you get a full refund.</p></div>
      <div class="how__card reveal" style="--d:.1s"><div class="how__num">✔</div><h3>Verified sellers</h3><p>Sellers with a verified badge have confirmed their identity and have a track record of happy buyers.</p></div>
      <div class="how__card reveal" style="--d:.2s"><div class="how__num">💬</div><h3>Talk before you buy</h3><p>Message sellers, ask for extra photos and make offers, all inside Agora, without sharing your number.</p></div>
    </div>
    <div class="banner reveal" style="margin-bottom:96px"><div class="banner__body"><h2>Ready to <em>start?</em></h2><p>List your first item in about a minute. It's free.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><a href="#/sell" class="btn btn--lime btn--lg">Sell an item</a><a href="#/shop" class="btn btn--lg" style="background:transparent;color:#fff;border-color:#444">Browse</a></div></div>
      <div class="banner__img"><img data-parallax="0.1" src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1400&q=80&auto=format&fit=crop" alt="" /></div></div>
  </div>`;
}
