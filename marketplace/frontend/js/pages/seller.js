import { get } from '../api.js';
import { remember } from '../store.js';
import { esc, card, avatar, emptyState, dateFmt } from '../ui.js';

export default async function seller(app, { params }) {
  const { user: u, listings, sold, reviews } = await get(`/users/${params.id}`);
  remember(listings);
  app.innerHTML = `
  <div class="container">
    <div class="profile-hero">
      <div class="fade-up">${avatar(u, 'avatar--lg')}</div>
      <div class="fade-up" style="--d:.06s"><span class="eyebrow">${u.verified ? '✔ Verified seller' : 'Seller'} · ${esc(u.location || '')}</span>
        <h1>${esc(u.name)}</h1><p class="muted" style="max-width:560px;margin-top:8px">${esc(u.bio || 'No bio yet.')}</p></div>
      <div class="profile-stats fade-up" style="--d:.12s">
        <div><strong>${u.rating ? u.rating + '★' : '—'}</strong><span>${u.ratingCount} reviews</span></div>
        <div><strong>${listings.length}</strong><span>For sale</span></div>
        <div><strong>${sold}</strong><span>Sold here</span></div>
      </div>
    </div>
    <p class="muted" style="margin-bottom:32px">Member since ${dateFmt(u.joinedAt)}</p>
    <h2 style="font-size:32px;margin-bottom:24px" class="reveal">For <em>sale</em></h2>
    <div class="grid">${listings.length ? listings.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('Nothing for sale right now', 'Check back soon.')}</div>`}</div>
    ${reviews.length ? `<section class="section--tight"><h2 style="font-size:32px;margin:48px 0 24px" class="reveal">Reviews</h2><div class="quotes" style="padding-bottom:80px">
      ${reviews.map((r, i) => `<figure class="quote reveal" style="--d:${i * 0.08}s;margin:0"><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><p>“${esc(r.text)}”</p>
        <footer>${avatar(r.author)}<div><b>${esc(r.author?.name || '')}</b><div class="muted">${dateFmt(r.createdAt)}</div></div></footer></figure>`).join('')}
    </div></section>` : '<div style="height:80px"></div>'}
  </div>`;
}
