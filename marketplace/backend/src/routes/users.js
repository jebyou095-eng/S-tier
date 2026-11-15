import { Router } from 'express';
import { db } from '../db.js';
import { notFound } from '../errors.js';
import { optionalAuth, publicUser } from '../middleware/auth.js';
import { shape } from './listings.js';

const r = Router();

r.get('/:id', optionalAuth, (req, res) => {
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) throw notFound('Seller');
  const listings = db.listings.filter(l => l.sellerId === u.id && l.status === 'active').map(l => shape(l, req.user));
  const sold = db.orders.filter(o => o.status !== 'cancelled').flatMap(o => o.items).filter(i => i.sellerId === u.id).length;
  const reviews = db.reviews.filter(rv => rv.sellerId === u.id).map(rv => ({ ...rv, author: publicUser(db.users.find(x => x.id === rv.authorId)) }));
  res.json({ user: publicUser(u), listings, sold, reviews });
});

export default r;
