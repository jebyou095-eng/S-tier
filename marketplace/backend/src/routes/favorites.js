import { Router } from 'express';
import { db, save } from '../db.js';
import { notFound } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { shape } from './listings.js';

const r = Router();
r.use(requireAuth);

r.get('/', (req, res) => {
  const ids = db.favorites.filter(f => f.userId === req.user.id).map(f => f.listingId);
  res.json({ items: db.listings.filter(l => ids.includes(l.id)).map(l => shape(l, req.user)) });
});

// Toggle a favorite. Returns the new state.
r.post('/:listingId', (req, res) => {
  const { listingId } = req.params;
  if (!db.listings.some(l => l.id === listingId)) throw notFound('Listing');
  const i = db.favorites.findIndex(f => f.userId === req.user.id && f.listingId === listingId);
  if (i >= 0) db.favorites.splice(i, 1);
  else db.favorites.push({ userId: req.user.id, listingId, createdAt: new Date().toISOString() });
  save();
  res.json({ isFavorite: i < 0, favorites: db.favorites.filter(f => f.listingId === listingId).length });
});

export default r;
