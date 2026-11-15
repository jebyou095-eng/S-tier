import { get } from '../api.js';
import { card, skeletonCards, countUp, esc, reveal, $ } from '../ui.js';
import { remember } from '../store.js';

const U = (id, w = 1400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

const split = (text, start = 0) => text.split(' ').map((w, i) => `<span class="word" style="--i:${start + i}">${w}</span>`).join(' ');

export default async function home(app) {
  app.innerHTML = `
  <section class="hero">
    <div class="hero__blob"></div>
    <div class="container hero__grid">
      <div>
        <span class="hero__tag fade-up" style="--d:.05s"><b>New</b> Zero seller fees this month</span>
        <h1>
          <span class="line">${split('Buy & sell')}</span>
          <span class="line">${split('things', 3)} <em>${split('worth', 4)}</em></span>
          <span class="line"><em>${split('keeping.', 5)}</em></span>
        </h1>
        <p class="hero__sub fade-up" style="--d:.7s">A calmer, curated marketplace for pre-loved furniture, fashion, tech and the things you'll keep for years. Verified sellers, protected payments.</p>
        <div class="hero__cta fade-up" style="--d:.85s">
          <a href="#/shop" class="btn btn--ink btn--lg magnetic">Start shopping <span class="arrow">→</span></a>
          <a href="#/sell" class="btn btn--lg magnetic">Sell in 60 seconds</a>
        </div>
        <div class="hero__stats fade-up" style="--d:1s">
          <div><strong data-count="listings">0</strong><span>Live listings</span></div>
          <div><strong data-count="sellers">0</strong><span>Trusted sellers</span></div>
          <div><strong>4.9★</strong><span>Avg. seller rating</span></div>
        </div>
      </div>
      <div class="hero__art">
        <div class="hero__img hero__img--a" data-parallax="0.04"><img src="${U('1586023492125-27b2c045efd7')}" alt="Styled living room with an armchair" /></div>
        <div class="hero__img hero__img--b" data-parallax="-0.08"><img src="${U('1523275335684-37898b6baf30', 800)}" alt="Minimal wristwatch" /></div>
        <div class="hero__img hero__img--c" data-parallax="0.1"><img src="${U('1542291026-7eec264c27ff', 800)}" alt="Red sneaker" /></div>
        <div class="float-card float-card--a"><img src="${U('1526170375885-4d8ecf77b99f', 200)}" alt="" /><div><strong>Polaroid OneStep</strong><span class="muted">just sold · €95</span></div></div>
        <div class="float-card float-card--b"><span class="pill">−40%</span><div><strong>Velvet sofa</strong><span class="muted">Paris</span></div></div>
      </div>
    </div>
    <div class="marquee" aria-hidden="true"><div class="marquee__track">
      ${Array(2).fill(['Vintage furniture', 'Designer fashion', 'Cameras & lenses', 'Watches', 'Guitars', 'Rare books', 'Bikes', 'Headphones'].map(t => `<span class="marquee__item">${t}</span>`).join('')).join('')}
    </div></div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head">
        <div class="reveal"><span class="eyebrow">Browse by category</span><h2>Find your <em>thing</em></h2></div>
        <a href="#/shop" class="link reveal">View all categories →</a>
      </div>
      <div class="cats" id="cats">${Array(8).fill('<div class="cat skel"></div>').join('')}</div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head">
        <div class="reveal"><span class="eyebrow">Fresh this week</span><h2>Just <em>listed</em></h2><p>Hand-picked arrivals from our community of sellers. Popular pieces go fast.</p></div>
        <a href="#/shop?sort=newest" class="btn reveal">Shop new arrivals <span class="arrow">→</span></a>
      </div>
      <div class="grid" id="latest">${skeletonCards(8)}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head"><div class="reveal"><span class="eyebrow">How it works</span><h2>Simple for buyers.<br/><em>Rewarding</em> for sellers.</h2></div></div>
      <div class="how">
        <div class="how__card reveal" style="--d:0s"><div class="how__num">01</div><h3>Snap & list</h3><p>Upload a few photos, set your price and you're live. It takes about a minute.</p></div>
        <div class="how__card reveal" style="--d:.1s"><div class="how__num">02</div><h3>Chat & agree</h3><p>Buyers message you directly. Answer questions, agree on details, no phone numbers needed.</p></div>
        <div class="how__card reveal" style="--d:.2s"><div class="how__num">03</div><h3>Ship & get paid</h3><p>Payment is held safely until the item ships. Mark it shipped and the money is yours.</p></div>
      </div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="banner reveal">
        <div class="banner__body">
          <span class="eyebrow" style="color:#8a877d">For sellers</span>
          <h2>Turn your closet into <em>cash.</em></h2>
          <p>List for free, reach thousands of buyers who care about quality, and get paid securely.</p>
          <ul><li>Free to list, no monthly fees</li><li>Buyer protection on every order</li><li>Message buyers in-app</li></ul>
          <div><a href="#/sell" class="btn btn--lime btn--lg magnetic">List an item <span class="arrow">→</span></a></div>
        </div>
        <div class="banner__img"><img data-parallax="0.12" src="${U('1490481651871-ab68de25d43d')}" alt="Clothes on a rack" /></div>
      </div>
    </div>
  </section>

  <section class="section section--tight">
    <div class="container">
      <div class="section__head"><div class="reveal"><span class="eyebrow">Trending now</span><h2>Most <em>wanted</em></h2></div><a href="#/shop?sort=popular" class="link reveal">See what's hot →</a></div>
      <div class="grid" id="popular">${skeletonCards(4)}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head"><div class="reveal"><span class="eyebrow">Loved by our community</span><h2>Kind <em>words</em></h2></div></div>
      <div class="quotes">
        ${[
          ['“Sold my old camera in two days. The whole thing felt safe and honestly kind of delightful.”', 'Leo M.', '1507003211169-0a1dd7228f2d'],
          ['“The quality of listings here is unreal. Found a vintage armchair I\'d been hunting for years.”', 'Sofia C.', '1438761681033-6461ffad8d80'],
          ['“Clean, fast, no noise. Messaging sellers is so easy. My go-to for second-hand finds.”', 'Amara O.', '1534528741775-53994a69daeb'],
        ].map(([q, n, p], i) => `<figure class="quote reveal" style="--d:${i * 0.1}s;margin:0"><span class="stars">★★★★★</span><p>${q}</p>
          <footer><img class="avatar" src="https://images.unsplash.com/photo-${p}?w=120&h=120&fit=crop&crop=faces" alt="${n}" /><b>${n}</b></footer></figure>`).join('')}
      </div>
    </div>
  </section>`;

  const [cats, latest, popular, stats] = await Promise.all([
    get('/categories'), get('/listings?limit=8&sort=newest'), get('/listings?limit=4&sort=popular'), get('/stats'),
  ]);
  remember(latest.items); remember(popular.items);

  $('#cats').innerHTML = cats.items.map((c, i) => `
    <a class="cat reveal" style="--d:${(i % 4) * 0.08}s" href="#/shop?category=${c.slug}">
      <img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" />
      <div class="cat__body"><div><h3>${esc(c.name)}</h3><small>${c.count} items</small></div><span class="cat__go">→</span></div>
    </a>`).join('');
  $('#latest').innerHTML = latest.items.map(card).join('');
  $('#popular').innerHTML = popular.items.map(card).join('');
  app.querySelectorAll('[data-count]').forEach(el => countUp(el, stats[el.dataset.count] || 0));
  reveal(app);
}
