import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { paged, pagination, parse } from '../../lib/validate.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { getGlobalBoard, getGlobalRank } from '../leaderboard/service.js';

export const usersRouter = Router();
export const leaderboardRouter = Router();

leaderboardRouter.get('/', async (req, res) => {
  const query = parse(pagination.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
  const board = await getGlobalBoard(query.page, query.pageSize);
  res.json(paged(board.rows, board.total, query.page, query.pageSize));
});

usersRouter.patch('/me', requireAuth, async (req, res) => {
  const input = parse(z.object({ bio: z.string().trim().max(280).nullable() }), req.body);
  const user = await prisma.user.update({
    where: { id: currentUser(req).id },
    data: { bio: input.bio || null },
    select: { id: true, username: true, bio: true },
  });
  res.json({ user });
});

usersRouter.get('/:username', async (req, res) => {
  const { username } = parse(z.object({ username: z.string().min(1).max(20) }), req.params);
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true, username: true, bio: true, role: true, solvedCount: true, createdAt: true },
  });
  if (!user) throw notFound('User');

  const since = new Date(Date.now() - 26 * 7 * 24 * 60 * 60 * 1000);
  const [rank, byVerdict, byLanguage, solved, totals, activity, contests] = await Promise.all([
    getGlobalRank(user.id),
    prisma.submission.groupBy({ by: ['verdict'], where: { userId: user.id, status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ['language'], where: { userId: user.id }, _count: { _all: true } }),
    // Only published problems are listed, so a profile never reveals a hidden contest problem.
    prisma.problem.findMany({
      where: { isPublic: true, submissions: { some: { userId: user.id, verdict: 'ACCEPTED' } } },
      orderBy: { id: 'asc' },
      select: { id: true, slug: true, title: true, difficulty: true },
    }),
    prisma.problem.groupBy({ by: ['difficulty'], where: { isPublic: true }, _count: { _all: true } }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
      FROM "Submission"
      WHERE "userId" = ${user.id} AND "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day
    `,
    prisma.contestRegistration.count({ where: { userId: user.id } }),
  ]);

  const difficulty = { EASY: { solved: 0, total: 0 }, MEDIUM: { solved: 0, total: 0 }, HARD: { solved: 0, total: 0 } };
  for (const group of totals) difficulty[group.difficulty].total = group._count._all;
  for (const problem of solved) difficulty[problem.difficulty].solved += 1;

  const submissions = byVerdict.reduce((sum, g) => sum + g._count._all, 0);
  const accepted = byVerdict.find((g) => g.verdict === 'ACCEPTED')?._count._all ?? 0;

  res.json({
    user: {
      ...user,
      rank,
      contests,
      stats: {
        submissions,
        accepted,
        difficulty,
        verdicts: Object.fromEntries(byVerdict.filter((g) => g.verdict).map((g) => [g.verdict, g._count._all])),
        languages: Object.fromEntries(byLanguage.map((g) => [g.language, g._count._all])),
      },
      solvedProblems: solved,
      activity: activity.map((a) => ({ day: a.day.toISOString().slice(0, 10), count: Number(a.count) })),
    },
  });
});
