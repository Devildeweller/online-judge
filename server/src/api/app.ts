import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { effectiveMemoryLimitKb, LANGUAGE_IDS, LANGUAGES } from '../judge/languages.js';
import { RUN_MEMORY_LIMIT_MB, RUN_TIME_LIMIT_MS } from '../judge/pipeline.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { errorHandler, notFoundHandler } from '../middleware/error.js';
import { adminRouter } from '../modules/admin/routes.js';
import { authRouter } from '../modules/auth/routes.js';
import { contestsRouter } from '../modules/contests/routes.js';
import { problemsRouter } from '../modules/problems/routes.js';
import { runRouter } from '../modules/run/routes.js';
import { MAX_SOURCE_BYTES, submissionsRouter } from '../modules/submissions/routes.js';
import { leaderboardRouter, usersRouter } from '../modules/users/routes.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind the bundled nginx (or any single reverse proxy) the client IP comes from X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(cookieParser());

  // Admin routes parse their own (much larger) bodies after the caller is known to be an admin.
  const jsonBody = express.json({ limit: '512kb' });
  app.use((req, res, next) => (req.path.startsWith('/api/admin') ? next() : jsonBody(req, res, next)));

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.debug({ method: req.method, path: req.originalUrl, status: res.statusCode, ms: Math.round(ms) }, 'request');
    });
    next();
  });

  app.get('/api/health', async (_req, res) => {
    const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    const healthy = db.status === 'fulfilled' && cache.status === 'fulfilled';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      postgres: db.status === 'fulfilled' ? 'up' : 'down',
      redis: cache.status === 'fulfilled' ? 'up' : 'down',
    });
  });

  app.get('/api/meta', (_req, res) => {
    res.json({
      languages: LANGUAGE_IDS.map((id) => ({
        id,
        name: LANGUAGES[id].name,
        timeFactor: LANGUAGES[id].timeFactor,
        memoryOverheadMb: effectiveMemoryLimitKb(LANGUAGES[id], 0) / 1024,
      })),
      limits: { maxSourceBytes: MAX_SOURCE_BYTES, runTimeLimitMs: RUN_TIME_LIMIT_MS, runMemoryLimitMb: RUN_MEMORY_LIMIT_MB },
    });
  });

  app.use('/api', authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/problems', problemsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/run', runRouter);
  app.use('/api/contests', contestsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  // Test data is uploaded here, hence the large body limit.
  app.use('/api/admin', requireAdmin, express.json({ limit: '64mb' }), adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
