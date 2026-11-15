import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { db } from '../db.js';
import { unauthorized } from '../errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    return db.users.find(u => u.id === sub) || null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = readUser(req);
  next();
}

export function requireAuth(req, _res, next) {
  req.user = readUser(req);
  if (!req.user) return next(unauthorized('Your session has expired or you are not logged in.'));
  next();
}

export const publicUser = (u) => u && ({
  id: u.id, name: u.name, avatar: u.avatar, location: u.location, bio: u.bio,
  joinedAt: u.createdAt, rating: u.rating, ratingCount: u.ratingCount, verified: !!u.verified,
});

export const privateUser = (u) => u && ({ ...publicUser(u), email: u.email });
