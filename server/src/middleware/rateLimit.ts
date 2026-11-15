import type { Request, RequestHandler } from 'express';
import { tooManyRequests } from '../lib/errors.js';
import { keys, redis } from '../lib/redis.js';

interface RateLimitOptions {
  scope: string;
  limit: number;
  windowSeconds: number;
  /** Defaults to the authenticated user id, falling back to the client IP. */
  identify?: (req: Request) => string;
  message?: string;
}

/** Fixed-window counter in Redis: one INCR per request, the key expires with its window. */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const { scope, limit, windowSeconds } = options;
  const identify = options.identify ?? ((req) => (req.user ? `u${req.user.id}` : `ip${req.ip ?? 'unknown'}`));

  return async (req, res, next) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / windowSeconds);
    const key = keys.rateLimit(scope, identify(req), window);

    const results = await redis.multi().incr(key).expire(key, windowSeconds + 1).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const resetIn = (window + 1) * windowSeconds - nowSeconds;

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', resetIn);

    if (count > limit) {
      res.setHeader('Retry-After', resetIn);
      return next(tooManyRequests(options.message ?? 'Too many requests, slow down', resetIn));
    }
    next();
  };
}
