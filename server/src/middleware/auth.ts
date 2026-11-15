import type { Request, RequestHandler } from 'express';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { type AuthUser, verifyAccessToken } from '../lib/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Attaches req.user when a valid bearer token is sent. A token that is present but invalid
 * is rejected even on public routes, so the client refreshes instead of silently browsing as a guest.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const user = verifyAccessToken(header.slice(7));
  if (!user) return next(new AppError(401, 'TOKEN_INVALID', 'Access token is invalid or expired'));
  req.user = user;
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : unauthorized());
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') return next(forbidden('Administrator access required'));
  next();
};

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export const isAdmin = (user: AuthUser | undefined): boolean => user?.role === 'ADMIN';
