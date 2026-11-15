import { Router } from 'express';
import { db, id, save } from '../db.js';
import { bad, forbidden, notFound, wrap } from '../errors.js';
import { optionalAuth, requireAuth, publicUser } from '../middleware/auth.js';
import { upload, removeUpload } from '../middleware/upload.js';
import { CATEGORIES, CONDITIONS } from '../categories.js';

const r = Router();

export function shape(l, me) {
  const seller = db.users.find(u => u.id === l.sellerId);
  return {
    ...l,
    seller: publicUser(seller),
    favorites: db.favorites.filter(f => f.listingId === l.id).length,
    isFavorite: !!me && db.favorites.some(f => f.listingId === l.id && f.userId === me.id),
    isMine: !!me && me.id === l.sellerId,
  };
}

function validate(body, partial = false) {
  const out = {};
  const has = (k) => body[k] !== undefined && body[k] !== '';
  if (!partial || has('title')) {
    const t = String(body.title || '').trim();
    if (t.length < 3) throw bad('Title must be at least 3 characters.');
    out.title = t.slice(0, 100);
  }
  if (!partial || has('description')) {
    const d = String(body.description || '').trim();
    if (d.length < 10) throw bad('Description must be at least 10 characters.');
    out.description = d.slice(0, 3000);
  }
  if (!partial || has('price')) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p <= 0 || p > 1_000_000) throw bad('Price must be a number between 0.01 and 1,000,000.');
    out.price = Math.round(p * 100) / 100;
  }
  if (!partial || has('category')) {
    if (!CATEGORIES.some(c => c.slug === body.category)) throw bad(`Unknown category "${body.category}".`);
    out.category = body.category;
  }
  if (!partial || has('condition')) {
    if (!CONDITIONS.includes(body.condition)) throw bad(`Condition must be one of: ${CONDITIONS.join(', ')}.`);
    out.condition = body.condition;
  }
  if (has('quantity')) {
    const q = parseInt(body.quantity, 10);
    if (!(q >= 0 && q <= 999)) throw bad('Quantity must be between 0 and 999.');
    out.quantity = q;
  } else if (!partial) out.quantity = 1;
  if (has('location')) out.location = String(body.location).slice(0, 80);
  if (has('originalPrice')) {
    const op = Number(body.originalPrice);
    out.originalPrice = Number.isFinite(op) && op > 0 ? op : null;
  }
  return out;
}

function collectImages(req, existing = []) {
  let urls = req.body.imageUrls ?? req.body['imageUrls[]'];
  if (typeof urls === 'string') { try { urls = JSON.parse(urls); } catch { urls = urls.split(/\s*,\s*|\n/); } }
  urls = (Array.isArray(urls) ? urls : []).map(String).map(s => s.trim()).filter(u => /^(https?:\/\/|\/uploads\/)/.test(u));
  const uploaded = (req.files || []).map(f => `/uploads/${f.filename}`);
  const keep = req.body.keepImages !== undefined ? urls : [...existing, ...urls];
  return [...new Set([...keep, ...uploaded])].slice(0, 8);
}

// GET /api/listings?q=&category=&condition=&min=&max=&sort=&seller=&page=&limit=
r.get('/', optionalAuth, (req, res) => {
  const { q, category, condition, min, max, seller, sort = 'newest', status = 'active' } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 12));
  let list = db.listings.slice();
  if (status !== 'all') list = list.filter(l => l.status === status);
  if (seller) list = list.filter(l => l.sellerId === seller);
  if (category) list = list.filter(l => l.category === category);
  if (condition) { const c = String(condition).split(','); list = list.filter(l => c.includes(l.condition)); }
  if (min) list = list.filter(l => l.price >= Number(min));
  if (max) list = list.filter(l => l.price <= Number(max));
  if (q) {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter(l => {
      const hay = `${l.title} ${l.description} ${l.category} ${l.location}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }
  const sorters = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    popular: (a, b) => (b.views + 5 * favCount(b.id)) - (a.views + 5 * favCount(a.id)),
  };
  list.sort(sorters[sort] || sorters.newest);
  const total = list.length;
  res.json({
    items: list.slice((page - 1) * limit, page * limit).map(l => shape(l, req.user)),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
  });
});
const favCount = (lid) => db.favorites.filter(f => f.listingId === lid).length;

r.get('/:id', optionalAuth, (req, res) => {
  const l = db.listings.find(x => x.id === req.params.id);
  if (!l) throw notFound('Listing');
  if (!req.user || req.user.id !== l.sellerId) { l.views = (l.views || 0) + 1; save(); }
  const related = db.listings
    .filter(x => x.id !== l.id && x.status === 'active' && x.category === l.category)
    .slice(0, 4).map(x => shape(x, req.user));
  res.json({ item: shape(l, req.user), related });
});

r.post('/', requireAuth, upload.array('images', 8), (req, res) => {
  const data = validate(req.body);
  const images = collectImages(req);
  if (!images.length) throw bad('Add at least one photo (upload a file or paste an image link).');
  const listing = {
    id: id('lst'), ...data, images, sellerId: req.user.id,
    location: data.location || req.user.location || '', status: data.quantity === 0 ? 'sold' : 'active',
    views: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  db.listings.push(listing);
  save();
  res.status(201).json({ item: shape(listing, req.user) });
});

r.patch('/:id', requireAuth, upload.array('images', 8), (req, res) => {
  const l = db.listings.find(x => x.id === req.params.id);
  if (!l) throw notFound('Listing');
  if (l.sellerId !== req.user.id) throw forbidden('Only the seller can edit this listing.');
  Object.assign(l, validate(req.body, true));
  if (req.files?.length || req.body.imageUrls !== undefined) {
    const next = collectImages(req, l.images);
    if (!next.length) throw bad('A listing needs at least one photo.');
    l.images.filter(u => !next.includes(u)).forEach(removeUpload);
    l.images = next;
  }
  if (req.body.status && ['active', 'sold', 'paused'].includes(req.body.status)) l.status = req.body.status;
  else if (l.quantity === 0) l.status = 'sold';
  else if (l.status === 'sold' && l.quantity > 0 && req.body.quantity !== undefined) l.status = 'active';
  l.updatedAt = new Date().toISOString();
  save();
  res.json({ item: shape(l, req.user) });
});

r.delete('/:id', requireAuth, (req, res) => {
  const i = db.listings.findIndex(x => x.id === req.params.id);
  if (i < 0) throw notFound('Listing');
  if (db.listings[i].sellerId !== req.user.id) throw forbidden('Only the seller can delete this listing.');
  const [gone] = db.listings.splice(i, 1);
  gone.images.forEach(removeUpload);
  for (let j = db.favorites.length - 1; j >= 0; j--) if (db.favorites[j].listingId === gone.id) db.favorites.splice(j, 1);
  save();
  res.json({ ok: true });
});

export default r;
