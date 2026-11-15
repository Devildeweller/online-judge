import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from './prisma.js';
import { keys, redis } from './redis.js';

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
}

interface AccessClaims {
  sub: string;
  username: string;
  role: Role;
}

export function signAccessToken(user: AuthUser): string {
  const claims: AccessClaims = { sub: String(user.id), username: user.username, role: user.role };
  return jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: env.ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as unknown as AccessClaims;
    const id = Number(claims.sub);
    if (!Number.isInteger(id)) return null;
    return { id, username: claims.username, role: claims.role };
  } catch {
    return null;
  }
}

const refreshTtlSeconds = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Refresh tokens are opaque random strings; only their hash is stored in Redis. */
export async function issueRefreshToken(userId: number): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await redis.set(keys.refreshToken(hashToken(token)), String(userId), 'EX', refreshTtlSeconds());
  return token;
}

/** Single use: the token is deleted as it is read, so a replayed token is rejected. */
export async function consumeRefreshToken(token: string): Promise<number | null> {
  const value = await redis.getdel(keys.refreshToken(hashToken(token)));
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await redis.del(keys.refreshToken(hashToken(token)));
}

export const refreshCookieMaxAgeMs = () => refreshTtlSeconds() * 1000;
