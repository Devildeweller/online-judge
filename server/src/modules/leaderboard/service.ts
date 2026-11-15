import { prisma } from '../../lib/prisma.js';
import { keys, redis } from '../../lib/redis.js';
import { boardScore, computeStanding, type ProblemCell, type StandingSubmission } from './standing.js';

/**
 * Leaderboards are served from Redis sorted sets. PostgreSQL stays the source of truth: every
 * entry is recomputed from the submissions table, so a write can be repeated safely and a lost
 * or flushed board is rebuilt on the next read.
 */

export interface ContestRow {
  userId: number;
  username: string;
  solved: number;
  penalty: number;
  problems: Record<number, ProblemCell>;
}

export interface RankedContestRow extends ContestRow {
  rank: number;
}

const READY_TTL_SECONDS = 7 * 24 * 60 * 60;

async function contestSubmissions(contestId: number, userId?: number) {
  return prisma.submission.findMany({
    where: { contestId, userId, status: 'COMPLETED' },
    select: { userId: true, problemId: true, verdict: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export async function rebuildContestBoard(contestId: number): Promise<void> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { startTime: true, penaltyMinutes: true, registrations: { select: { user: { select: { id: true, username: true } } } } },
  });
  if (!contest) return;

  const byUser = new Map<number, StandingSubmission[]>();
  for (const s of await contestSubmissions(contestId)) {
    const list = byUser.get(s.userId) ?? [];
    list.push(s);
    byUser.set(s.userId, list);
  }

  const board = keys.contestBoard(contestId);
  const rows = keys.contestRows(contestId);
  const tx = redis.multi().del(board, rows);
  for (const { user } of contest.registrations) {
    const standing = computeStanding(byUser.get(user.id) ?? [], contest.startTime, contest.penaltyMinutes);
    const row: ContestRow = { userId: user.id, username: user.username, ...standing };
    tx.zadd(board, boardScore(row.solved, row.penalty), String(user.id));
    tx.hset(rows, String(user.id), JSON.stringify(row));
  }
  tx.set(keys.contestReady(contestId), '1', 'EX', READY_TTL_SECONDS);
  await tx.exec();
}

async function ensureContestBoard(contestId: number): Promise<void> {
  if (!(await redis.exists(keys.contestReady(contestId)))) await rebuildContestBoard(contestId);
}

/** Recomputes one participant after a verdict. Idempotent, so job retries and rejudges are safe. */
export async function refreshContestStanding(contestId: number, userId: number): Promise<void> {
  await ensureContestBoard(contestId);
  const [contest, user, registered] = await Promise.all([
    prisma.contest.findUnique({ where: { id: contestId }, select: { startTime: true, penaltyMinutes: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    prisma.contestRegistration.findUnique({ where: { contestId_userId: { contestId, userId } }, select: { userId: true } }),
  ]);
  if (!contest || !user || !registered) return;

  const standing = computeStanding(await contestSubmissions(contestId, userId), contest.startTime, contest.penaltyMinutes);
  const row: ContestRow = { userId, username: user.username, ...standing };
  await redis
    .multi()
    .zadd(keys.contestBoard(contestId), boardScore(row.solved, row.penalty), String(userId))
    .hset(keys.contestRows(contestId), String(userId), JSON.stringify(row))
    .exec();
}

export async function addContestParticipant(contestId: number, userId: number, username: string): Promise<void> {
  await ensureContestBoard(contestId);
  const row: ContestRow = { userId, username, solved: 0, penalty: 0, problems: {} };
  await redis
    .multi()
    .zadd(keys.contestBoard(contestId), 'NX', 0, String(userId))
    .hsetnx(keys.contestRows(contestId), String(userId), JSON.stringify(row))
    .exec();
}

export async function removeContestParticipant(contestId: number, userId: number): Promise<void> {
  await redis.multi().zrem(keys.contestBoard(contestId), String(userId)).hdel(keys.contestRows(contestId), String(userId)).exec();
}

export async function dropContestBoard(contestId: number): Promise<void> {
  await redis.del(keys.contestBoard(contestId), keys.contestRows(contestId), keys.contestReady(contestId));
}

/** Competition ranking: tied entries share a rank, the next rank skips accordingly (1, 2, 2, 4). */
async function ranksFor(boardKey: string, scores: string[]): Promise<number[]> {
  if (scores.length === 0) return [];
  const distinct = [...new Set(scores)];
  const pipeline = redis.pipeline();
  for (const score of distinct) pipeline.zcount(boardKey, `(${score}`, '+inf');
  const results = await pipeline.exec();
  const rankByScore = new Map(distinct.map((score, i) => [score, Number(results?.[i]?.[1] ?? 0) + 1]));
  return scores.map((score) => rankByScore.get(score) ?? 0);
}

function splitWithScores(flat: string[]): { members: string[]; scores: string[] } {
  const members: string[] = [];
  const scores: string[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    members.push(flat[i]!);
    scores.push(flat[i + 1]!);
  }
  return { members, scores };
}

export async function getContestBoard(contestId: number, page: number, pageSize: number) {
  await ensureContestBoard(contestId);
  const board = keys.contestBoard(contestId);
  const start = (page - 1) * pageSize;

  const [total, flat] = await Promise.all([redis.zcard(board), redis.zrevrange(board, start, start + pageSize - 1, 'WITHSCORES')]);
  const { members, scores } = splitWithScores(flat);
  if (members.length === 0) return { total, rows: [] as RankedContestRow[] };

  const [rawRows, ranks] = await Promise.all([redis.hmget(keys.contestRows(contestId), ...members), ranksFor(board, scores)]);
  const rows: RankedContestRow[] = [];
  rawRows.forEach((raw, i) => {
    if (raw) rows.push({ ...(JSON.parse(raw) as ContestRow), rank: ranks[i] ?? 0 });
  });
  return { total, rows };
}

export async function getContestRow(contestId: number, userId: number): Promise<RankedContestRow | null> {
  await ensureContestBoard(contestId);
  const board = keys.contestBoard(contestId);
  const [score, raw] = await Promise.all([redis.zscore(board, String(userId)), redis.hget(keys.contestRows(contestId), String(userId))]);
  if (score === null || !raw) return null;
  const [rank] = await ranksFor(board, [score]);
  return { ...(JSON.parse(raw) as ContestRow), rank: rank ?? 0 };
}

// ---------------------------------------------------------------------------------------------
// Global board: distinct problems solved
// ---------------------------------------------------------------------------------------------

export async function rebuildGlobalBoard(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true, solvedCount: true } });
  const tx = redis.multi().del(keys.globalBoard);
  for (const user of users) tx.zadd(keys.globalBoard, user.solvedCount, String(user.id));
  tx.set(keys.globalReady, '1', 'EX', READY_TTL_SECONDS);
  await tx.exec();
}

async function ensureGlobalBoard(): Promise<void> {
  if (!(await redis.exists(keys.globalReady))) await rebuildGlobalBoard();
}

/** Recounts a user's distinct accepted problems and mirrors the number to PostgreSQL and Redis. */
export async function refreshUserSolved(userId: number): Promise<number> {
  const solved = await prisma.submission.findMany({
    where: { userId, verdict: 'ACCEPTED' },
    distinct: ['problemId'],
    select: { problemId: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { solvedCount: solved.length } });
  await ensureGlobalBoard();
  await redis.zadd(keys.globalBoard, solved.length, String(userId));
  return solved.length;
}

export async function addGlobalParticipant(userId: number): Promise<void> {
  if (await redis.exists(keys.globalReady)) await redis.zadd(keys.globalBoard, 'NX', 0, String(userId));
}

export async function getGlobalBoard(page: number, pageSize: number) {
  await ensureGlobalBoard();
  const start = (page - 1) * pageSize;
  const [total, flat] = await Promise.all([
    redis.zcard(keys.globalBoard),
    redis.zrevrange(keys.globalBoard, start, start + pageSize - 1, 'WITHSCORES'),
  ]);
  const { members, scores } = splitWithScores(flat);
  if (members.length === 0) return { total, rows: [] };

  const ids = members.map(Number);
  const [users, ranks, accepted, attempts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, createdAt: true } }),
    ranksFor(keys.globalBoard, scores),
    prisma.submission.groupBy({ by: ['userId'], where: { userId: { in: ids }, verdict: 'ACCEPTED' }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const acceptedBy = new Map(accepted.map((g) => [g.userId, g._count._all]));
  const attemptsBy = new Map(attempts.map((g) => [g.userId, g._count._all]));

  const rows = ids.flatMap((id, i) => {
    const user = userById.get(id);
    if (!user) return [];
    return [
      {
        rank: ranks[i] ?? 0,
        userId: id,
        username: user.username,
        solved: Number(scores[i]),
        submissions: attemptsBy.get(id) ?? 0,
        accepted: acceptedBy.get(id) ?? 0,
        joinedAt: user.createdAt,
      },
    ];
  });
  return { total, rows };
}

export async function getGlobalRank(userId: number): Promise<number | null> {
  await ensureGlobalBoard();
  const score = await redis.zscore(keys.globalBoard, String(userId));
  if (score === null) return null;
  const [rank] = await ranksFor(keys.globalBoard, [score]);
  return rank ?? null;
}
