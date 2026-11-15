import { logger } from '../lib/logger.js';
import { prisma, type SubmissionStatus, type Verdict } from '../lib/prisma.js';
import { keys, redis } from '../lib/redis.js';
import { refreshContestStanding, refreshUserSolved } from '../modules/leaderboard/service.js';
import { publishEvent, rooms } from '../queue/events.js';
import type { RunJob } from '../queue/judgeQueue.js';
import { checkOutput } from './checker.js';
import { LANGUAGES } from './languages.js';
import { truncate } from './outcome.js';
import { Sandbox } from './sandbox.js';

const MAX_ERROR_CHARS = 4000;
const PROGRESS_WRITE_INTERVAL_MS = 750;

export interface SubmissionUpdate {
  id: number;
  userId: number;
  problemId: number;
  contestId: number | null;
  status: SubmissionStatus;
  verdict: Verdict | null;
  passedTests: number;
  totalTests: number;
  timeMs: number | null;
  memoryKb: number | null;
}

async function announce(update: SubmissionUpdate): Promise<void> {
  await publishEvent({
    rooms: [rooms.user(update.userId)],
    event: 'submission:update',
    payload: update,
  });
}

interface TestResult {
  position: number;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
}

interface Final {
  verdict: Verdict;
  results: TestResult[];
  compileOutput: string | null;
  errorMessage: string | null;
  failedTest: number | null;
}

/**
 * Judges one submission: compile once, then run test cases in order and stop at the first failure.
 * Throws only for infrastructure problems (Docker, database), which lets the queue retry the job.
 */
export async function judgeSubmission(submissionId: number): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      problem: {
        select: {
          timeLimitMs: true,
          memoryLimitMb: true,
          checker: true,
          testCases: { orderBy: { position: 'asc' }, select: { position: true, input: true, expectedOutput: true } },
        },
      },
    },
  });
  if (!submission) {
    logger.warn({ submissionId }, 'submission vanished before judging');
    return;
  }

  const { problem } = submission;
  const tests = problem.testCases;
  const spec = LANGUAGES[submission.language];
  const update: SubmissionUpdate = {
    id: submission.id,
    userId: submission.userId,
    problemId: submission.problemId,
    contestId: submission.contestId,
    status: 'COMPILING',
    verdict: null,
    passedTests: 0,
    totalTests: tests.length,
    timeMs: null,
    memoryKb: null,
  };

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: 'COMPILING', verdict: null, passedTests: 0, totalTests: tests.length },
  });
  await announce(update);

  const final: Final = { verdict: 'ACCEPTED', results: [], compileOutput: null, errorMessage: null, failedTest: null };
  const perTestSeconds = (problem.timeLimitMs * spec.timeFactor * 2) / 1000 + 20;
  const sandbox = await Sandbox.create({
    spec,
    memoryLimitMb: problem.memoryLimitMb,
    lifetimeSeconds: Math.min(3600, Math.ceil(120 + tests.length * perTestSeconds)),
  });

  try {
    await sandbox.writeSource(submission.sourceCode);
    const compiled = await sandbox.compile();
    final.compileOutput = compiled.output || null;

    if (!compiled.ok) {
      final.verdict = 'COMPILATION_ERROR';
    } else {
      update.status = 'RUNNING';
      await prisma.submission.update({ where: { id: submission.id }, data: { status: 'RUNNING' } });
      await announce(update);

      let lastProgressWrite = Date.now();
      for (const test of tests) {
        const outcome = await sandbox.run(test.input, problem);
        const verdict: Verdict =
          outcome.verdict ?? (checkOutput(problem.checker, outcome.stdout, test.expectedOutput) ? 'ACCEPTED' : 'WRONG_ANSWER');

        final.results.push({ position: test.position, verdict, timeMs: outcome.timeMs, memoryKb: outcome.memoryKb });
        update.timeMs = Math.max(update.timeMs ?? 0, outcome.timeMs);
        update.memoryKb = Math.max(update.memoryKb ?? 0, outcome.memoryKb);

        if (verdict !== 'ACCEPTED') {
          final.verdict = verdict;
          final.failedTest = test.position;
          const parts = [outcome.detail, outcome.stderr.trim()].filter(Boolean);
          final.errorMessage = parts.length > 0 ? truncate(parts.join('\n'), MAX_ERROR_CHARS) : null;
          break;
        }

        update.passedTests += 1;
        await announce(update);
        if (Date.now() - lastProgressWrite >= PROGRESS_WRITE_INTERVAL_MS) {
          lastProgressWrite = Date.now();
          await prisma.submission.update({ where: { id: submission.id }, data: { passedTests: update.passedTests } });
        }
      }
    }
  } finally {
    await sandbox.destroy();
  }

  await prisma.$transaction([
    prisma.submissionTestResult.deleteMany({ where: { submissionId: submission.id } }),
    prisma.submissionTestResult.createMany({ data: final.results.map((r) => ({ ...r, submissionId: submission.id })) }),
    prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: 'COMPLETED',
        verdict: final.verdict,
        passedTests: update.passedTests,
        totalTests: tests.length,
        failedTest: final.failedTest,
        timeMs: update.timeMs,
        memoryKb: update.memoryKb,
        compileOutput: final.compileOutput,
        errorMessage: final.errorMessage,
        judgedAt: new Date(),
      },
    }),
  ]);

  update.status = 'COMPLETED';
  update.verdict = final.verdict;
  await applyVerdictEffects(update);
  await announce(update);
  logger.info(
    { submissionId, language: submission.language, verdict: final.verdict, passed: update.passedTests, total: tests.length, timeMs: update.timeMs },
    'submission judged',
  );
}

/** Derived data that depends on verdicts: problem counters, solved counts and leaderboards. */
export async function applyVerdictEffects(s: Pick<SubmissionUpdate, 'id' | 'userId' | 'problemId' | 'contestId'>): Promise<void> {
  const [submissionCount, acceptedCount] = await Promise.all([
    prisma.submission.count({ where: { problemId: s.problemId, status: 'COMPLETED' } }),
    prisma.submission.count({ where: { problemId: s.problemId, verdict: 'ACCEPTED' } }),
  ]);
  await prisma.problem.update({ where: { id: s.problemId }, data: { submissionCount, acceptedCount } });
  await refreshUserSolved(s.userId);

  if (s.contestId !== null) {
    await refreshContestStanding(s.contestId, s.userId);
    await publishEvent({ rooms: [rooms.contest(s.contestId)], event: 'leaderboard:update', payload: { contestId: s.contestId } });
  }
}

/** Called when a job has exhausted its retries: the user gets a verdict instead of a stuck submission. */
export async function failSubmission(submissionId: number, reason: string): Promise<void> {
  const submission = await prisma.submission
    .update({
      where: { id: submissionId },
      data: { status: 'COMPLETED', verdict: 'INTERNAL_ERROR', errorMessage: truncate(reason, MAX_ERROR_CHARS), judgedAt: new Date() },
    })
    .catch(() => null);
  if (!submission) return;
  await announce({
    id: submission.id,
    userId: submission.userId,
    problemId: submission.problemId,
    contestId: submission.contestId,
    status: 'COMPLETED',
    verdict: 'INTERNAL_ERROR',
    passedTests: submission.passedTests,
    totalTests: submission.totalTests,
    timeMs: submission.timeMs,
    memoryKb: submission.memoryKb,
  });
}

// ---------------------------------------------------------------------------------------------
// "Run" - execute code against custom input without creating a submission
// ---------------------------------------------------------------------------------------------

export const RUN_TIME_LIMIT_MS = 2000;
export const RUN_MEMORY_LIMIT_MB = 256;
const RUN_RESULT_TTL_SECONDS = 600;
const MAX_RUN_OUTPUT_CHARS = 64 * 1024;

export interface RunResult {
  runId: string;
  status: 'OK' | Verdict;
  stdout: string;
  stderr: string;
  compileOutput: string | null;
  timeMs: number | null;
  memoryKb: number | null;
  exitCode: number | null;
}

export async function storeRunResult(userId: number, result: RunResult): Promise<void> {
  await redis.set(keys.runResult(result.runId), JSON.stringify({ userId, result }), 'EX', RUN_RESULT_TTL_SECONDS);
  await publishEvent({ rooms: [rooms.user(userId)], event: 'run:result', payload: result });
}

export async function executeRun(job: RunJob): Promise<void> {
  const spec = LANGUAGES[job.language];
  const result: RunResult = {
    runId: job.runId,
    status: 'OK',
    stdout: '',
    stderr: '',
    compileOutput: null,
    timeMs: null,
    memoryKb: null,
    exitCode: null,
  };

  const sandbox = await Sandbox.create({ spec, memoryLimitMb: RUN_MEMORY_LIMIT_MB, lifetimeSeconds: 180 });
  try {
    await sandbox.writeSource(job.sourceCode);
    const compiled = await sandbox.compile();
    result.compileOutput = compiled.output || null;
    if (!compiled.ok) {
      result.status = 'COMPILATION_ERROR';
    } else {
      const outcome = await sandbox.run(job.stdin, { timeLimitMs: RUN_TIME_LIMIT_MS, memoryLimitMb: RUN_MEMORY_LIMIT_MB });
      result.status = outcome.verdict ?? 'OK';
      result.stdout = truncate(outcome.stdout, MAX_RUN_OUTPUT_CHARS);
      result.stderr = truncate([outcome.detail, outcome.stderr].filter(Boolean).join('\n'), MAX_ERROR_CHARS);
      result.timeMs = outcome.timeMs;
      result.memoryKb = outcome.memoryKb;
      result.exitCode = outcome.exitCode;
    }
  } finally {
    await sandbox.destroy();
  }
  await storeRunResult(job.userId, result);
}
