import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestHandler } from 'express';
import { config } from './config.js';

const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('scrypt:')) {
    const a = Buffer.from(password); const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export const cookieOptions = {
  httpOnly: true, sameSite: 'lax' as const, secure: config.production, path: '/api', maxAge: 7 * 86400000,
};
export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10000) for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    const key = req.userId || req.ip || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (buckets.size >= 20000) { res.status(503).json({ message: 'Please try again shortly' }); return; }
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.until - now) / 1000));
      res.status(429).json({ message: 'Request limit reached. Please try again later.' }); return;
    }
    next();
  };
}
export const secureHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin && !config.origins.includes(origin)) {
    res.status(403).json({ message: 'Origin is not allowed' }); return;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  if (['POST', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    res.status(415).json({ message: 'Use application/json' }); return;
  }
  next();
};
