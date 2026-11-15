import { Router } from 'express';
import { db } from '../db.js';
import { CATEGORIES, CONDITIONS } from '../categories.js';

const r = Router();

r.get('/health', (_req, res) => res.json({ ok: true, service: 'agora-backend', time: new Date().toISOString() }));

r.get('/categories', (_req, res) => {
  res.json({
    items: CATEGORIES.map(c => ({ ...c, count: db.listings.filter(l => l.category === c.slug && l.status === 'active').length })),
    conditions: CONDITIONS,
  });
});

r.get('/stats', (_req, res) => {
  res.json({
    listings: db.listings.filter(l => l.status === 'active').length,
    sellers: new Set(db.listings.map(l => l.sellerId)).size,
    users: db.users.length,
    sold: db.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.items.length, 0),
  });
});

export default r;
