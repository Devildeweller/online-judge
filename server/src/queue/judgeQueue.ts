import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import type { Language } from '../lib/prisma.js';
import { bullConnection } from '../lib/redis.js';

export const JUDGE_QUEUE = env.JUDGE_QUEUE;

export interface SubmissionJob {
  kind: 'submission';
  submissionId: number;
}

export interface RunJob {
  kind: 'run';
  runId: string;
  userId: number;
  language: Language;
  sourceCode: string;
  stdin: string;
}

export type JudgeJob = SubmissionJob | RunJob;

/** Lower number = served first. Interactive runs jump the queue, rejudges go last. */
export const Priority = { run: 1, contest: 2, practice: 3, rejudge: 10 } as const;

let queue: Queue<JudgeJob> | undefined;

export function getJudgeQueue(): Queue<JudgeJob> {
  queue ??= new Queue<JudgeJob>(JUDGE_QUEUE, {
    connection: bullConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600, count: 2000 },
      removeOnFail: { age: 24 * 3600, count: 5000 },
    },
  });
  return queue;
}

export async function enqueueSubmission(submissionId: number, priority: number): Promise<void> {
  await getJudgeQueue().add('submission', { kind: 'submission', submissionId }, { priority });
}

export async function enqueueRun(job: Omit<RunJob, 'kind'>): Promise<void> {
  await getJudgeQueue().add('run', { kind: 'run', ...job }, { priority: Priority.run, attempts: 1 });
}

export async function closeJudgeQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
