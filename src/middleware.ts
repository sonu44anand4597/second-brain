import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { JWT_PASSWORD } from './config.js';
import { UserModel } from './db.js';
declare global { namespace Express { interface Request { userId?: string; sessionVersion?: number } } }
export const userMiddleware: RequestHandler = async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('brainly_session='))?.slice(16);
  try {
    const decoded = jwt.verify(bearer || cookie || '', JWT_PASSWORD, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !mongoose.isObjectIdOrHexString(decoded.id)) throw new Error();
    const user = await UserModel.findById(decoded.id).select('sessionVersion').lean();
    if (!user || (decoded.version ?? 0) !== (user.sessionVersion ?? 0)) throw new Error();
    req.userId = decoded.id;
    req.sessionVersion = user.sessionVersion ?? 0;
    next();
  } catch {
    res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
};
