import { type CookieOptions, type Response, Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { consumeRefreshToken, issueRefreshToken, refreshCookieMaxAgeMs, revokeRefreshToken, signAccessToken } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { addGlobalParticipant } from '../leaderboard/service.js';

const REFRESH_COOKIE = 'oj_refresh';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.CORS_ORIGIN.startsWith('https://'),
  path: '/api/auth',
  maxAge: refreshCookieMaxAgeMs(),
});

const registerSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/, 'Username must be 3-20 letters, digits or underscores'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email').max(254),
  password: z.string().min(1, 'Enter your password').max(128),
});

interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  solvedCount: number;
  createdAt: Date;
}

const sessionSelect = { id: true, username: true, email: true, role: true, solvedCount: true, createdAt: true } as const;

async function startSession(res: Response, user: SessionUser) {
  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  return { accessToken: signAccessToken(user), expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, user };
}

const perIp = (scope: string, limit: number) =>
  rateLimit({ scope, limit, windowSeconds: 60, identify: (req) => `ip${req.ip ?? 'unknown'}`, message: 'Too many attempts, try again in a minute' });

export const authRouter = Router();

authRouter.post('/register', perIp('register', 10), async (req, res) => {
  const input = parse(registerSchema, req.body);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: { equals: input.username, mode: 'insensitive' } }, { email: input.email }] },
    select: { email: true },
  });
  if (existing) throw conflict(existing.email === input.email ? 'That email is already registered' : 'That username is taken');

  const user = await prisma.user.create({
    data: { username: input.username, email: input.email, passwordHash: await hashPassword(input.password) },
    select: sessionSelect,
  });
  await addGlobalParticipant(user.id);
  res.status(201).json(await startSession(res, user));
});

authRouter.post('/login', perIp('login', 20), async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: { equals: input.identifier, mode: 'insensitive' } }, { email: input.identifier.toLowerCase() }],
    },
    select: { ...sessionSelect, passwordHash: true },
  });
  // Same message for unknown user and wrong password, so accounts cannot be enumerated.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw unauthorized('Incorrect username or password');

  const { passwordHash: _omit, ...session } = user;
  res.json(await startSession(res, session));
});

/** Rotates the refresh token: the old one is consumed, a new one is issued. */
authRouter.post('/refresh', async (req, res) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string' || token.length === 0) throw unauthorized('No session');

  const userId = await consumeRefreshToken(token);
  const user = userId === null ? null : await prisma.user.findUnique({ where: { id: userId }, select: sessionSelect });
  if (!user) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    throw unauthorized('Session expired, please sign in again');
  }
  res.json(await startSession(res, user));
});

authRouter.post('/logout', async (req, res) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token === 'string' && token.length > 0) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: currentUser(req).id }, select: sessionSelect });
  if (!user) throw unauthorized();
  res.json({ user });
});
