import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { LANGUAGE_IDS } from '../../judge/languages.js';
import { failSubmission } from '../../judge/pipeline.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { type Prisma, prisma } from '../../lib/prisma.js';
import { paged, pagination, parse, idParam, queryFlag } from '../../lib/validate.js';
import { currentUser, isAdmin, requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { enqueueSubmission, Priority } from '../../queue/judgeQueue.js';
import { canViewProblem } from '../problems/access.js';

export const MAX_SOURCE_BYTES = 64 * 1024;

const VERDICTS = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'OUTPUT_LIMIT_EXCEEDED',
  'RUNTIME_ERROR',
  'COMPILATION_ERROR',
  'INTERNAL_ERROR',
] as const;

export const sourceCodeSchema = z
  .string()
  .min(1, 'Source code is empty')
  .refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_SOURCE_BYTES, `Source code must be at most ${MAX_SOURCE_BYTES / 1024} KB`)
  .refine((s) => !s.includes('\0'), 'Source code contains a NUL character');

const createSchema = z.object({
  problemId: z.number().int().positive(),
  contestId: z.number().int().positive().nullish(),
  language: z.enum(LANGUAGE_IDS),
  sourceCode: sourceCodeSchema,
});

const listQuery = pagination.extend({
  mine: queryFlag,
  username: z.string().trim().max(20).optional(),
  problem: z.string().trim().max(100).optional(),
  contestId: z.coerce.number().int().positive().optional(),
  verdict: z.enum(VERDICTS).optional(),
  language: z.enum(LANGUAGE_IDS).optional(),
});

const listSelect = {
  id: true,
  language: true,
  status: true,
  verdict: true,
  timeMs: true,
  memoryKb: true,
  passedTests: true,
  totalTests: true,
  contestId: true,
  createdAt: true,
  user: { select: { id: true, username: true } },
  problem: { select: { id: true, slug: true, title: true } },
} as const;

export const submissionsRouter = Router();

submissionsRouter.post(
  '/',
  requireAuth,
  rateLimit({ scope: 'submit', limit: env.SUBMIT_RATE_LIMIT, windowSeconds: 60, message: 'You are submitting too fast, wait a moment' }),
  async (req, res) => {
    const user = currentUser(req);
    const input = parse(createSchema, req.body);
    const now = new Date();

    const problem = await prisma.problem.findUnique({
      where: { id: input.problemId },
      select: { id: true, isPublic: true, _count: { select: { testCases: true } } },
    });
    if (!problem || !(await canViewProblem(problem, user))) throw notFound('Problem');
    if (problem._count.testCases === 0) throw badRequest('This problem has no test cases yet');

    let contestId: number | null = null;
    if (input.contestId) {
      const contest = await prisma.contest.findUnique({
        where: { id: input.contestId },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          problems: { where: { problemId: problem.id }, select: { problemId: true } },
          registrations: { where: { userId: user.id }, select: { userId: true } },
        },
      });
      if (!contest || contest.problems.length === 0) throw badRequest('This problem is not part of that contest');
      if (now < contest.startTime) throw forbidden('The contest has not started yet');
      // After the contest ends the submission is accepted as ordinary practice.
      if (now < contest.endTime) {
        if (contest.registrations.length === 0) throw forbidden('Register for the contest before submitting');
        contestId = contest.id;
      }
    }

    if (contestId === null && !problem.isPublic && !isAdmin(user)) {
      const running = await prisma.contestProblem.findFirst({
        where: { problemId: problem.id, contest: { startTime: { lte: now }, endTime: { gt: now } } },
        select: { contestId: true },
      });
      if (running) throw forbidden('This problem belongs to a running contest; submit it from the contest page');
    }

    const submission = await prisma.submission.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        contestId,
        language: input.language,
        sourceCode: input.sourceCode,
        totalTests: problem._count.testCases,
      },
      select: listSelect,
    });

    try {
      await enqueueSubmission(submission.id, contestId === null ? Priority.practice : Priority.contest);
    } catch (err) {
      logger.error({ err, submissionId: submission.id }, 'could not enqueue submission');
      await failSubmission(submission.id, 'The judge queue is unavailable. Please try again later.');
    }

    res.status(201).json({ submission });
  },
);

/**
 * Non-admins see their own submissions plus those on published problems or finished contests,
 * so nothing leaks from a contest that is still running.
 */
function visibilityFilter(userId: number | undefined): Prisma.SubmissionWhereInput {
  const visible: Prisma.SubmissionWhereInput[] = [
    { problem: { isPublic: true }, OR: [{ contestId: null }, { contest: { endTime: { lt: new Date() } } }] },
  ];
  if (userId !== undefined) visible.push({ userId });
  return { OR: visible };
}

submissionsRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  const filters: Prisma.SubmissionWhereInput[] = [];

  if (!isAdmin(req.user)) filters.push(visibilityFilter(req.user?.id));
  if (query.mine) filters.push({ userId: currentUser(req).id });
  if (query.username) filters.push({ user: { username: { equals: query.username, mode: 'insensitive' } } });
  if (query.problem) filters.push({ problem: { slug: query.problem } });
  if (query.contestId) filters.push({ contestId: query.contestId });
  if (query.verdict) filters.push({ verdict: query.verdict });
  if (query.language) filters.push({ language: query.language });

  const where: Prisma.SubmissionWhereInput = { AND: filters };
  const [total, submissions] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: listSelect,
    }),
  ]);
  res.json(paged(submissions, total, query.page, query.pageSize));
});

submissionsRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const filters: Prisma.SubmissionWhereInput[] = [{ id }];
  if (!isAdmin(req.user)) filters.push(visibilityFilter(req.user?.id));

  const submission = await prisma.submission.findFirst({
    where: { AND: filters },
    select: {
      ...listSelect,
      failedTest: true,
      judgedAt: true,
      sourceCode: true,
      compileOutput: true,
      errorMessage: true,
      results: { orderBy: { position: 'asc' }, select: { position: true, verdict: true, timeMs: true, memoryKb: true } },
    },
  });
  if (!submission) throw notFound('Submission');

  // Source and diagnostics belong to the author; everyone else sees the verdict only.
  const canViewSource = isAdmin(req.user) || req.user?.id === submission.user.id;
  const { sourceCode, compileOutput, errorMessage, ...summary } = submission;
  res.json({
    submission: canViewSource
      ? { ...summary, canViewSource, sourceCode, compileOutput, errorMessage }
      : { ...summary, canViewSource, sourceCode: null, compileOutput: null, errorMessage: null },
  });
});
