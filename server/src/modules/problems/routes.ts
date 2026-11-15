import { Router } from 'express';
import { z } from 'zod';
import { notFound, unauthorized } from '../../lib/errors.js';
import { type Prisma, prisma } from '../../lib/prisma.js';
import { paged, pagination, parse } from '../../lib/validate.js';
import { isAdmin } from '../../middleware/auth.js';
import { canViewProblem, problemStatuses } from './access.js';

const listQuery = pagination.extend({
  search: z.string().trim().max(100).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  tag: z.string().trim().toLowerCase().max(30).optional(),
  status: z.enum(['solved', 'attempted', 'todo']).optional(),
  /** Admin only: include unpublished problems. */
  scope: z.enum(['public', 'all']).default('public'),
});

export const problemsRouter = Router();

problemsRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  const where: Prisma.ProblemWhereInput = {};

  if (!(query.scope === 'all' && isAdmin(req.user))) where.isPublic = true;
  if (query.difficulty) where.difficulty = query.difficulty;
  if (query.tag) where.tags = { has: query.tag };
  if (query.search) {
    where.OR = [{ title: { contains: query.search, mode: 'insensitive' } }, { slug: { contains: query.search.toLowerCase() } }];
  }

  if (query.status) {
    if (!req.user) throw unauthorized('Sign in to filter by your progress');
    const [solved, attempted] = await Promise.all([
      prisma.submission.findMany({ where: { userId: req.user.id, verdict: 'ACCEPTED' }, distinct: ['problemId'], select: { problemId: true } }),
      prisma.submission.findMany({ where: { userId: req.user.id }, distinct: ['problemId'], select: { problemId: true } }),
    ]);
    const solvedIds = solved.map((s) => s.problemId);
    const attemptedIds = attempted.map((s) => s.problemId);
    if (query.status === 'solved') where.id = { in: solvedIds };
    else if (query.status === 'attempted') where.id = { in: attemptedIds.filter((id) => !solvedIds.includes(id)) };
    else where.id = { notIn: attemptedIds };
  }

  const [total, problems] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, slug: true, title: true, difficulty: true, tags: true, acceptedCount: true, submissionCount: true, isPublic: true },
    }),
  ]);

  const statuses = await problemStatuses(req.user?.id, problems.map((p) => p.id));
  res.json(paged(problems.map((p) => ({ ...p, status: statuses.get(p.id) ?? null })), total, query.page, query.pageSize));
});

problemsRouter.get('/tags', async (_req, res) => {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT tag, COUNT(*) AS count
    FROM "Problem", unnest(tags) AS tag
    WHERE "isPublic" = true
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `;
  res.json({ tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })) });
});

problemsRouter.get('/:slug', async (req, res) => {
  const { slug } = parse(z.object({ slug: z.string().min(1).max(100) }), req.params);
  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      statement: true,
      inputFormat: true,
      outputFormat: true,
      constraints: true,
      difficulty: true,
      tags: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      checker: true,
      isPublic: true,
      acceptedCount: true,
      submissionCount: true,
      author: { select: { username: true } },
      testCases: {
        where: { isSample: true },
        orderBy: { position: 'asc' },
        select: { position: true, input: true, expectedOutput: true, explanation: true },
      },
    },
  });
  // Hidden problems answer 404 rather than 403 so their existence is not revealed.
  if (!problem || !(await canViewProblem(problem, req.user))) throw notFound('Problem');

  const statuses = await problemStatuses(req.user?.id, [problem.id]);
  const { testCases, ...rest } = problem;
  res.json({ problem: { ...rest, samples: testCases, status: statuses.get(problem.id) ?? null } });
});
