import { get, post } from '../api.js';
import { auth } from '../store.js';
import { go } from '../router.js';
import { $, $$, esc, src, money, timeAgo, toastError } from '../ui.js';

export default async function messages(app, { params }) {
  if (!auth.loggedIn) { go('#/login?next=' + encodeURIComponent(location.hash)); return; }
  const { items } = await get('/messages');
  const active = params.thread;

  app.innerHTML = `
  <div class="container"><div class="inbox fade-up ${active ? 'has-chat' : ''}">
    <div class="threads"><h2>Messages</h2>
      ${items.length ? items.map(t => `
        <a class="thread ${t.id === active ? 'on' : ''} ${t.unread ? 'unread' : ''}" href="#/messages/${t.id}">
          <img src="${src(t.listing?.image)}" alt="" />
          <div style="min-width:0"><b>${esc(t.other?.name || 'User')}</b> <small class="muted">· ${timeAgo(t.last.at)}</small>
            <p>${t.last.mine ? 'You: ' : ''}${esc(t.last.text)}</p></div>
        </a>`).join('') : '<p class="muted" style="padding:0 20px 20px">No conversations yet. Message a seller from any listing.</p>'}
    </div>
    <div class="chat" id="chat">${active ? '<div class="chat__body"><div class="skel" style="height:40px;width:60%"></div></div>' : '<div class="empty" style="margin:auto"><div class="empty__art">💬</div><h3>Select a conversation</h3></div>'}</div>
  </div></div>`;

  if (!active) return;
  let shown = 0;
  const load = async (scroll) => {
    const { thread, messages } = await get(`/messages/${active}`);
    if (!$('#chat .chat__form')) {
      $('#chat').innerHTML = `
        <div class="chat__head"><a href="#/messages" class="icon-btn" aria-label="Back" style="display:${innerWidth < 860 ? 'grid' : 'none'}">←</a>
          ${thread.listing ? `<a href="#/item/${thread.listing.id}"><img src="${src(thread.listing.image)}" alt="" /></a>` : ''}
          <div style="flex:1;min-width:0"><b>${esc(thread.other?.name)}</b><div class="muted" style="font-size:13px">${thread.listing ? `${esc(thread.listing.title)} · ${money(thread.listing.price)}` : ''}</div></div>
          ${thread.listing ? `<a class="btn btn--sm" href="#/item/${thread.listing.id}">View item</a>` : ''}</div>
        <div class="chat__body"></div>
        <form class="chat__form"><input name="text" placeholder="Write a message…" autocomplete="off" /><button class="btn btn--ink">Send</button></form>`;
      $('#chat form').onsubmit = async (e) => {
        e.preventDefault();
        const text = e.target.text.value.trim();
        if (!text) return;
        e.target.text.value = '';
        try { await post('/messages', { threadId: active, text }); await load(true); } catch (err) { toastError(err); }
      };
    }
    const b = $('#chat .chat__body');
    const fresh = messages.slice(shown);
    const first = shown === 0;
    shown = messages.length;
    b.insertAdjacentHTML('beforeend', fresh.map(m => `<div class="bubble ${m.mine ? 'mine' : ''}">${esc(m.text)}<small>${timeAgo(m.createdAt)}</small></div>`).join(''));
    if (fresh.length || scroll) b.scrollTo({ top: b.scrollHeight, behavior: first ? 'instant' : 'smooth' });
  };
  await load(true);
  $('#chat input')?.focus();
  const timer = setInterval(() => load().catch(() => {}), 5000);
  return () => clearInterval(timer);
}
