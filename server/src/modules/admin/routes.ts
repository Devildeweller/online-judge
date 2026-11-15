import { Router } from 'express';
import { z } from 'zod';
import { applyVerdictEffects } from '../../judge/pipeline.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { type Prisma, prisma } from '../../lib/prisma.js';
import { idParam, paged, pagination, parse } from '../../lib/validate.js';
import { currentUser } from '../../middleware/auth.js';
import { enqueueSubmission, getJudgeQueue, Priority } from '../../queue/judgeQueue.js';
import { dropContestBoard, rebuildContestBoard, rebuildGlobalBoard } from '../leaderboard/service.js';

const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens');

const testCaseSchema = z.object({
  input: z.string().max(8_000_000),
  expectedOutput: z.string().max(8_000_000),
  isSample: z.boolean().default(false),
  explanation: z.string().max(2000).nullish(),
});

const problemSchema = z.object({
  slug,
  title: z.string().trim().min(1).max(120),
  statement: z.string().min(1).max(50_000),
  inputFormat: z.string().max(10_000).default(''),
  outputFormat: z.string().max(10_000).default(''),
  constraints: z.string().max(10_000).default(''),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
  timeLimitMs: z.number().int().min(100).max(10_000).default(1000),
  memoryLimitMb: z.number().int().min(16).max(1024).default(256),
  checker: z.enum(['LINES', 'TOKENS', 'FLOAT']).default('LINES'),
  isPublic: z.boolean().default(false),
  /** When present, replaces the whole test set in the given order. */
  testCases: z.array(testCaseSchema).max(300).optional(),
});

const contestSchema = z
  .object({
    slug,
    title: z.string().trim().min(1).max(120),
    description: z.string().max(20_000).default(''),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    penaltyMinutes: z.number().int().min(0).max(240).default(20),
    isPublic: z.boolean().default(true),
    /** Problems in order; they are labelled A, B, C, ... */
    problemIds: z.array(z.number().int().positive()).max(26).default([]),
  })
  .refine((c) => c.endTime > c.startTime, { path: ['endTime'], message: 'End time must be after the start time' })
  .refine((c) => new Set(c.problemIds).size === c.problemIds.length, { path: ['problemIds'], message: 'A problem can only appear once' });

const labelFor = (index: number) => String.fromCharCode(65 + index);

function testCaseRows(problemId: number, cases: z.infer<typeof testCaseSchema>[]) {
  return cases.map((c, i) => ({
    problemId,
    position: i + 1,
    input: c.input,
    expectedOutput: c.expectedOutput,
    isSample: c.isSample,
    explanation: c.explanation || null,
  }));
}

/** Everything here is mounted behind requireAdmin. */
export const adminRouter = Router();

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------

adminRouter.get('/stats', async (_req, res) => {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, problems, publicProblems, contests, submissions, lastDay, verdicts, languages, queue] = await Promise.all([
    prisma.user.count(),
    prisma.problem.count(),
    prisma.problem.count({ where: { isPublic: true } }),
    prisma.contest.count(),
    prisma.submission.count(),
    prisma.submission.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.submission.groupBy({ by: ['verdict'], where: { status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ['language'], _count: { _all: true } }),
    getJudgeQueue().getJobCounts('waiting', 'prioritized', 'active', 'delayed', 'failed', 'completed'),
  ]);
  res.json({
    totals: { users, problems, publicProblems, contests, submissions, submissionsLastDay: lastDay },
    verdicts: Object.fromEntries(verdicts.filter((g) => g.verdict).map((g) => [g.verdict, g._count._all])),
    languages: Object.fromEntries(languages.map((g) => [g.language, g._count._all])),
    queue: {
      waiting: (queue.waiting ?? 0) + (queue.prioritized ?? 0),
      active: queue.active ?? 0,
      delayed: queue.delayed ?? 0,
      failed: queue.failed ?? 0,
      completed: queue.completed ?? 0,
    },
  });
});

// ---------------------------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------------------------

adminRouter.get('/problems/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      testCases: { orderBy: { position: 'asc' }, select: { position: true, input: true, expectedOutput: true, isSample: true, explanation: true } },
    },
  });
  if (!problem) throw notFound('Problem');
  res.json({ problem });
});

adminRouter.post('/problems', async (req, res) => {
  const { testCases, ...data } = parse(problemSchema, req.body);
  const problem = await prisma.$transaction(async (tx) => {
    const created = await tx.problem.create({ data: { ...data, authorId: currentUser(req).id } });
    if (testCases?.length) await tx.testCase.createMany({ data: testCaseRows(created.id, testCases) });
    return created;
  });
  res.status(201).json({ problem });
});

adminRouter.put('/problems/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { testCases, ...data } = parse(problemSchema, req.body);
  const problem = await prisma.$transaction(async (tx) => {
    const updated = await tx.problem.update({ where: { id }, data });
    if (testCases) {
      await tx.testCase.deleteMany({ where: { problemId: id } });
      if (testCases.length) await tx.testCase.createMany({ data: testCaseRows(id, testCases) });
    }
    return updated;
  });
  res.json({ problem });
});

adminRouter.delete('/problems/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const affected = await prisma.contestProblem.findMany({ where: { problemId: id }, select: { contestId: true } });
  const users = await prisma.submission.findMany({ where: { problemId: id, verdict: 'ACCEPTED' }, distinct: ['userId'], select: { userId: true } });
  await prisma.problem.delete({ where: { id } });

  // Solved counts and boards were derived from the deleted submissions.
  if (users.length > 0) {
    for (const { userId } of users) {
      const solved = await prisma.submission.findMany({ where: { userId, verdict: 'ACCEPTED' }, distinct: ['problemId'], select: { problemId: true } });
      await prisma.user.update({ where: { id: userId }, data: { solvedCount: solved.length } });
    }
    await rebuildGlobalBoard();
  }
  await Promise.all(affected.map((c) => rebuildContestBoard(c.contestId)));
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------------
// Rejudge
// ---------------------------------------------------------------------------------------------

async function rejudge(where: Prisma.SubmissionWhereInput): Promise<number> {
  const submissions = await prisma.submission.findMany({
    where,
    orderBy: { id: 'asc' },
    select: { id: true, userId: true, problemId: true, contestId: true },
  });
  if (submissions.length === 0) return 0;

  await prisma.$transaction([
    prisma.submissionTestResult.deleteMany({ where: { submissionId: { in: submissions.map((s) => s.id) } } }),
    prisma.submission.updateMany({
      where: { id: { in: submissions.map((s) => s.id) } },
      data: { status: 'QUEUED', verdict: null, passedTests: 0, failedTest: null, timeMs: null, memoryKb: null, compileOutput: null, errorMessage: null, judgedAt: null },
    }),
  ]);

  // Old verdicts no longer count; boards catch up again as each submission is judged.
  const seen = new Set<string>();
  for (const s of submissions) {
    const key = `${s.userId}:${s.problemId}:${s.contestId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await applyVerdictEffects(s);
  }
  for (const s of submissions) await enqueueSubmission(s.id, Priority.rejudge);
  return submissions.length;
}

adminRouter.post('/submissions/:id/rejudge', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const queued = await rejudge({ id });
  if (queued === 0) throw notFound('Submission');
  res.status(202).json({ queued });
});

adminRouter.post('/problems/:id/rejudge', async (req, res) => {
  const { id } = parse(idParam, req.params);
  if (!(await prisma.problem.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Problem');
  res.status(202).json({ queued: await rejudge({ problemId: id }) });
});

// ---------------------------------------------------------------------------------------------
// Contests
// ---------------------------------------------------------------------------------------------

async function assertProblemsExist(problemIds: number[]): Promise<void> {
  const found = await prisma.problem.count({ where: { id: { in: problemIds } } });
  if (found !== problemIds.length) throw badRequest('One or more selected problems do not exist');
}

adminRouter.get('/contests/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      problems: { orderBy: { position: 'asc' }, select: { label: true, problem: { select: { id: true, slug: true, title: true, difficulty: true, isPublic: true } } } },
    },
  });
  if (!contest) throw notFound('Contest');
  res.json({ contest });
});

adminRouter.post('/contests', async (req, res) => {
  const { problemIds, ...data } = parse(contestSchema, req.body);
  await assertProblemsExist(problemIds);
  const contest = await prisma.contest.create({
    data: {
      ...data,
      createdById: currentUser(req).id,
      problems: { create: problemIds.map((problemId, i) => ({ problemId, label: labelFor(i), position: i })) },
    },
  });
  res.status(201).json({ contest });
});

adminRouter.put('/contests/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { problemIds, ...data } = parse(contestSchema, req.body);
  await assertProblemsExist(problemIds);
  const contest = await prisma.$transaction(async (tx) => {
    await tx.contestProblem.deleteMany({ where: { contestId: id } });
    return tx.contest.update({
      where: { id },
      data: { ...data, problems: { create: problemIds.map((problemId, i) => ({ problemId, label: labelFor(i), position: i })) } },
    });
  });
  // Start time or penalty may have changed, which shifts every standing.
  await rebuildContestBoard(id);
  res.json({ contest });
});

adminRouter.delete('/contests/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  await prisma.contest.delete({ where: { id } });
  await dropContestBoard(id);
  res.status(204).end();
});

adminRouter.post('/contests/:id/rebuild-leaderboard', async (req, res) => {
  const { id } = parse(idParam, req.params);
  if (!(await prisma.contest.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Contest');
  await rebuildContestBoard(id);
  res.json({ rebuilt: true });
});

// ---------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------

adminRouter.get('/users', async (req, res) => {
  const query = parse(pagination.extend({ search: z.string().trim().max(100).optional() }), req.query);
  const where: Prisma.UserWhereInput = query.search
    ? { OR: [{ username: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] }
    : {};
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, username: true, email: true, role: true, solvedCount: true, createdAt: true, _count: { select: { submissions: true } } },
    }),
  ]);
  res.json(paged(users.map(({ _count, ...u }) => ({ ...u, submissions: _count.submissions })), total, query.page, query.pageSize));
});

adminRouter.patch('/users/:id/role', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { role } = parse(z.object({ role: z.enum(['USER', 'ADMIN']) }), req.body);
  if (id === currentUser(req).id && role !== 'ADMIN') throw badRequest('You cannot remove your own administrator role');
  const user = await prisma.user.update({ where: { id }, data: { role }, select: { id: true, username: true, role: true } });
  res.json({ user });
});
