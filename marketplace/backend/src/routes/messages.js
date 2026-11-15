import { Router } from 'express';
import { db, id, save } from '../db.js';
import { bad, forbidden, notFound } from '../errors.js';
import { requireAuth, publicUser } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

// A thread = one listing + one buyer. Its id is deterministic so it's easy to find.
const threadId = (listingId, buyerId) => `${listingId}__${buyerId}`;

function threadsFor(userId) {
  const map = new Map();
  for (const m of db.messages) {
    if (m.from !== userId && m.to !== userId) continue;
    const t = map.get(m.threadId) || { id: m.threadId, listingId: m.listingId, messages: [] };
    t.messages.push(m);
    map.set(m.threadId, t);
  }
  return [...map.values()].map(t => {
    const last = t.messages.at(-1);
    const otherId = last.from === userId ? last.to : last.from;
    const l = db.listings.find(x => x.id === t.listingId);
    return {
      id: t.id, listing: l ? { id: l.id, title: l.title, image: l.images[0], price: l.price, status: l.status } : null,
      other: publicUser(db.users.find(u => u.id === otherId)),
      last: { text: last.text, at: last.createdAt, mine: last.from === userId },
      unread: t.messages.filter(m => m.to === userId && !m.read).length,
    };
  }).sort((a, b) => b.last.at.localeCompare(a.last.at));
}

r.get('/', (req, res) => {
  const items = threadsFor(req.user.id);
  res.json({ items, unread: items.reduce((s, t) => s + t.unread, 0) });
});

r.get('/:threadId', (req, res) => {
  const msgs = db.messages.filter(m => m.threadId === req.params.threadId);
  if (!msgs.length) throw notFound('Conversation');
  if (!msgs.some(m => m.from === req.user.id || m.to === req.user.id)) throw forbidden();
  let changed = false;
  for (const m of msgs) if (m.to === req.user.id && !m.read) { m.read = true; changed = true; }
  if (changed) save();
  const thread = threadsFor(req.user.id).find(t => t.id === req.params.threadId);
  res.json({ thread, messages: msgs.map(m => ({ ...m, mine: m.from === req.user.id })) });
});

// Send a message. Either { threadId, text } to reply or { listingId, text } to start a chat with the seller.
r.post('/', (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) throw bad('Message cannot be empty.');
  let { threadId: tid, listingId } = req.body;
  let to;
  if (tid) {
    const prev = db.messages.find(m => m.threadId === tid);
    if (!prev) throw notFound('Conversation');
    if (prev.from !== req.user.id && prev.to !== req.user.id) throw forbidden();
    listingId = prev.listingId;
    to = prev.from === req.user.id ? prev.to : prev.from;
  } else {
    const l = db.listings.find(x => x.id === listingId);
    if (!l) throw notFound('Listing');
    if (l.sellerId === req.user.id) throw bad("You can't message yourself about your own listing.");
    to = l.sellerId;
    tid = threadId(l.id, req.user.id);
  }
  const msg = { id: id('msg'), threadId: tid, listingId, from: req.user.id, to, text: text.slice(0, 2000), read: false, createdAt: new Date().toISOString() };
  db.messages.push(msg);
  save();
  res.status(201).json({ message: { ...msg, mine: true }, threadId: tid });
});

export default r;
