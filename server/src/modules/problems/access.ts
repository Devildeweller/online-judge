import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../lib/tokens.js';
import { isAdmin } from '../../middleware/auth.js';

/**
 * A problem is visible when it is published, or once any public contest that contains it has started.
 * Administrators see everything.
 */
export async function canViewProblem(problem: { id: number; isPublic: boolean }, user: AuthUser | undefined): Promise<boolean> {
  if (problem.isPublic || isAdmin(user)) return true;
  const started = await prisma.contestProblem.findFirst({
    where: { problemId: problem.id, contest: { isPublic: true, startTime: { lte: new Date() } } },
    select: { contestId: true },
  });
  return started !== null;
}

export type ProblemStatus = 'SOLVED' | 'ATTEMPTED' | null;

/** Solved / attempted flags for a set of problems, from the user's completed submissions. */
export async function problemStatuses(userId: number | undefined, problemIds: number[]): Promise<Map<number, ProblemStatus>> {
  const statuses = new Map<number, ProblemStatus>();
  if (userId === undefined || problemIds.length === 0) return statuses;

  const groups = await prisma.submission.groupBy({
    by: ['problemId', 'verdict'],
    where: { userId, problemId: { in: problemIds } },
    _count: { _all: true },
  });
  for (const group of groups) {
    if (group.verdict === 'ACCEPTED') statuses.set(group.problemId, 'SOLVED');
    else if (!statuses.has(group.problemId)) statuses.set(group.problemId, 'ATTEMPTED');
  }
  return statuses;
}
