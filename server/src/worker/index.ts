import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { assertSandboxAvailable } from '../judge/docker.js';
import { executeRun, failSubmission, judgeSubmission, storeRunResult } from '../judge/pipeline.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { bullConnection, redis } from '../lib/redis.js';
import { JUDGE_QUEUE, type JudgeJob } from '../queue/judgeQueue.js';

async function main(): Promise<void> {
  await assertSandboxAvailable();

  const worker = new Worker<JudgeJob>(
    JUDGE_QUEUE,
    async (job) => {
      if (job.data.kind === 'submission') await judgeSubmission(job.data.submissionId);
      else await executeRun(job.data);
    },
    {
      connection: bullConnection,
      concurrency: env.WORKER_CONCURRENCY,
      // Judging can take minutes; the lock is renewed automatically while the worker is alive.
      lockDuration: 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= attempts;
    logger.error({ jobId: job.id, kind: job.data.kind, attempt: job.attemptsMade, attempts, err: err.message }, 'judge job failed');
    if (!exhausted) return;

    const settle =
      job.data.kind === 'submission'
        ? failSubmission(job.data.submissionId, `Judge infrastructure error: ${err.message}`)
        : storeRunResult(job.data.userId, {
            runId: job.data.runId,
            status: 'INTERNAL_ERROR',
            stdout: '',
            stderr: `Judge infrastructure error: ${err.message}`,
            compileOutput: null,
            timeMs: null,
            memoryKb: null,
            exitCode: null,
          });
    settle.catch((e: unknown) => logger.error({ err: e }, 'could not record job failure'));
  });

  worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));

  logger.info({ concurrency: env.WORKER_CONCURRENCY, image: env.SANDBOX_IMAGE }, 'judge worker ready');

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'worker shutting down, finishing active jobs');
    await worker.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.fatal({ err: err instanceof Error ? err.message : err }, 'worker failed to start');
  process.exit(1);
});
