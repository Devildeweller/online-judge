import { Router } from 'express';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { type Prisma, prisma } from '../../lib/prisma.js';
import { paged, pagination, parse } from '../../lib/validate.js';
import { currentUser, isAdmin, requireAuth } from '../../middleware/auth.js';
import { addContestParticipant, getContestBoard, getContestRow, removeContestParticipant } from '../leaderboard/service.js';
import { problemStatuses } from '../problems/access.js';

export type ContestPhase = 'UPCOMING' | 'RUNNING' | 'ENDED';

export function contestPhase(contest: { startTime: Date; endTime: Date }, now = new Date()): ContestPhase {
  if (now < contest.startTime) return 'UPCOMING';
  return now < contest.endTime ? 'RUNNING' : 'ENDED';
}

const slugParam = z.object({ slug: z.string().min(1).max(100) });

const listQuery = pagination.extend({
  phase: z.enum(['upcoming', 'running', 'ended']).optional(),
});

export const contestsRouter = Router();

contestsRouter.get('/', async (req, res) => {
  const query = parse(listQuery, req.query);
  const now = new Date();
  const where: Prisma.ContestWhereInput = isAdmin(req.user) ? {} : { isPublic: true };
  if (query.phase === 'upcoming') where.startTime = { gt: now };
  else if (query.phase === 'running') Object.assign(where, { startTime: { lte: now }, endTime: { gt: now } });
  else if (query.phase === 'ended') where.endTime = { lte: now };

  const [total, contests] = await Promise.all([
    prisma.contest.count({ where }),
    prisma.contest.findMany({
      where,
      orderBy: { startTime: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        startTime: true,
        endTime: true,
        isPublic: true,
        _count: { select: { registrations: true, problems: true } },
        registrations: req.user ? { where: { userId: req.user.id }, select: { userId: true } } : false,
      },
    }),
  ]);

  const items = contests.map(({ _count, registrations, ...contest }) => ({
    ...contest,
    phase: contestPhase(contest, now),
    participants: _count.registrations,
    problemCount: _count.problems,
    registered: Array.isArray(registrations) && registrations.length > 0,
  }));
  res.json(paged(items, total, query.page, query.pageSize));
});

async function findContest(slug: string, viewerIsAdmin: boolean) {
  const contest = await prisma.contest.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      startTime: true,
      endTime: true,
      penaltyMinutes: true,
      isPublic: true,
      _count: { select: { registrations: true } },
      problems: {
        orderBy: { position: 'asc' },
        select: { label: true, problem: { select: { id: true, slug: true, title: true, difficulty: true } } },
      },
    },
  });
  if (!contest || (!contest.isPublic && !viewerIsAdmin)) throw notFound('Contest');
  return contest;
}

contestsRouter.get('/:slug', async (req, res) => {
  const { slug } = parse(slugParam, req.params);
  const admin = isAdmin(req.user);
  const contest = await findContest(slug, admin);
  const phase = contestPhase(contest);
  const problemsVisible = phase !== 'UPCOMING' || admin;

  const [registration, statuses, solvers, myRow] = await Promise.all([
    req.user
      ? prisma.contestRegistration.findUnique({ where: { contestId_userId: { contestId: contest.id, userId: req.user.id } } })
      : null,
    problemsVisible ? problemStatuses(req.user?.id, contest.problems.map((p) => p.problem.id)) : new Map(),
    problemsVisible
      ? prisma.$queryRaw<{ problemId: number; solvers: bigint }[]>`
          SELECT "problemId", COUNT(DISTINCT "userId") AS solvers
          FROM "Submission"
          WHERE "contestId" = ${contest.id} AND "verdict" = 'ACCEPTED'
          GROUP BY "problemId"
        `
      : [],
    req.user ? getContestRow(contest.id, req.user.id) : null,
  ]);
  const solversByProblem = new Map(solvers.map((s) => [s.problemId, Number(s.solvers)]));

  const { problems, _count, ...rest } = contest;
  res.json({
    contest: {
      ...rest,
      phase,
      participants: _count.registrations,
      problemCount: problems.length,
      registered: registration !== null,
      myStanding: myRow,
      // The problem set stays secret until the start time.
      problems: problemsVisible
        ? problems.map((p) => ({
            label: p.label,
            ...p.problem,
            solvers: solversByProblem.get(p.problem.id) ?? 0,
            status: statuses.get(p.problem.id) ?? null,
          }))
        : null,
    },
  });
});

contestsRouter.post('/:slug/register', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { slug } = parse(slugParam, req.params);
  const contest = await findContest(slug, isAdmin(user));
  if (contestPhase(contest) === 'ENDED') throw badRequest('This contest has already ended');

  await prisma.contestRegistration.upsert({
    where: { contestId_userId: { contestId: contest.id, userId: user.id } },
    create: { contestId: contest.id, userId: user.id },
    update: {},
  });
  await addContestParticipant(contest.id, user.id, user.username);
  res.status(201).json({ registered: true });
});

contestsRouter.delete('/:slug/register', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { slug } = parse(slugParam, req.params);
  const contest = await findContest(slug, isAdmin(user));
  if (contestPhase(contest) !== 'UPCOMING') throw forbidden('You can only withdraw before the contest starts');

  await prisma.contestRegistration.deleteMany({ where: { contestId: contest.id, userId: user.id } });
  await removeContestParticipant(contest.id, user.id);
  res.json({ registered: false });
});

contestsRouter.get('/:slug/leaderboard', async (req, res) => {
  const { slug } = parse(slugParam, req.params);
  const query = parse(pagination.extend({ pageSize: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
  const admin = isAdmin(req.user);
  const contest = await findContest(slug, admin);
  const started = contestPhase(contest) !== 'UPCOMING' || admin;

  const [board, me] = await Promise.all([
    getContestBoard(contest.id, query.page, query.pageSize),
    req.user ? getContestRow(contest.id, req.user.id) : null,
  ]);
  res.json({
    ...paged(board.rows, board.total, query.page, query.pageSize),
    problems: started ? contest.problems.map((p) => ({ label: p.label, problemId: p.problem.id, slug: p.problem.slug })) : [],
    me,
    phase: contestPhase(contest),
  });
});
