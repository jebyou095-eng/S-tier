import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, id, save } from '../db.js';
import { bad, unauthorized, wrap } from '../errors.js';
import { requireAuth, signToken, privateUser } from '../middleware/auth.js';

const r = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

r.post('/register', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim()) throw bad('Please enter your name.');
  if (!EMAIL.test(email || '')) throw bad('Please enter a valid email address.');
  if ((password || '').length < 6) throw bad('Password must be at least 6 characters.');
  const lower = email.trim().toLowerCase();
  if (db.users.some(u => u.email === lower)) throw bad('An account with this email already exists. Try logging in.');
  const user = {
    id: id('usr'), name: name.trim(), email: lower, passwordHash: await bcrypt.hash(password, 10),
    avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name.trim())}`,
    location: '', bio: '', rating: 0, ratingCount: 0, verified: false, createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save();
  res.status(201).json({ token: signToken(user), user: privateUser(user) });
}));

r.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email === (email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) throw unauthorized('Wrong email or password.');
  res.json({ token: signToken(user), user: privateUser(user) });
}));

r.get('/me', requireAuth, (req, res) => res.json({ user: privateUser(req.user) }));

r.patch('/me', requireAuth, (req, res) => {
  const { name, location, bio, avatar } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim()) throw bad('Name cannot be empty.');
    req.user.name = String(name).trim().slice(0, 60);
  }
  if (location !== undefined) req.user.location = String(location).slice(0, 80);
  if (bio !== undefined) req.user.bio = String(bio).slice(0, 400);
  if (avatar !== undefined && /^https?:\/\//.test(avatar)) req.user.avatar = avatar;
  save();
  res.json({ user: privateUser(req.user) });
});

export default r;
