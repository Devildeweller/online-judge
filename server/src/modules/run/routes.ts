import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { LANGUAGE_IDS } from '../../judge/languages.js';
import type { RunResult } from '../../judge/pipeline.js';
import { notFound } from '../../lib/errors.js';
import { keys, redis } from '../../lib/redis.js';
import { parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { enqueueRun } from '../../queue/judgeQueue.js';
import { sourceCodeSchema } from '../submissions/routes.js';

const runSchema = z.object({
  language: z.enum(LANGUAGE_IDS),
  sourceCode: sourceCodeSchema,
  stdin: z.string().max(64 * 1024, 'Input must be at most 64 KB').default(''),
});

/** Runs code against custom input. Nothing is stored in PostgreSQL; the result lives in Redis for ten minutes. */
export const runRouter = Router();

runRouter.post(
  '/',
  requireAuth,
  rateLimit({ scope: 'run', limit: env.RUN_RATE_LIMIT, windowSeconds: 60, message: 'You are running code too fast, wait a moment' }),
  async (req, res) => {
    const user = currentUser(req);
    const input = parse(runSchema, req.body);
    const runId = randomUUID();
    await enqueueRun({ runId, userId: user.id, language: input.language, sourceCode: input.sourceCode, stdin: input.stdin });
    res.status(202).json({ runId });
  },
);

runRouter.get('/:runId', requireAuth, async (req, res) => {
  const { runId } = parse(z.object({ runId: z.uuid() }), req.params);
  const raw = await redis.get(keys.runResult(runId));
  if (!raw) {
    res.json({ pending: true });
    return;
  }
  const stored = JSON.parse(raw) as { userId: number; result: RunResult };
  if (stored.userId !== currentUser(req).id) throw notFound('Run');
  res.json({ pending: false, result: stored.result });
});
