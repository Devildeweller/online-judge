import type { Verdict } from '../../lib/prisma.js';

export interface StandingSubmission {
  problemId: number;
  verdict: Verdict | null;
  createdAt: Date;
}

export interface ProblemCell {
  /** Rejected attempts that count: before the first accepted run, or all of them if unsolved. */
  wrongAttempts: number;
  solved: boolean;
  /** Minutes from contest start to the accepted submission. */
  solvedAtMinutes: number | null;
}

export interface Standing {
  solved: number;
  penalty: number;
  problems: Record<number, ProblemCell>;
}

/** Verdicts that say nothing about the solution itself and therefore carry no penalty. */
const NO_PENALTY: ReadonlySet<Verdict> = new Set<Verdict>(['COMPILATION_ERROR', 'INTERNAL_ERROR']);

/**
 * ICPC rules: rank by problems solved, then by penalty. A solved problem costs the minutes elapsed
 * at its first accepted submission plus `penaltyMinutes` for each rejected attempt before it.
 * Unsolved problems cost nothing. `submissions` must be in chronological order.
 */
export function computeStanding(submissions: StandingSubmission[], contestStart: Date, penaltyMinutes: number): Standing {
  const problems: Record<number, ProblemCell> = {};
  let solved = 0;
  let penalty = 0;

  for (const submission of submissions) {
    if (!submission.verdict || NO_PENALTY.has(submission.verdict)) continue;
    const cell = (problems[submission.problemId] ??= { wrongAttempts: 0, solved: false, solvedAtMinutes: null });
    if (cell.solved) continue;

    if (submission.verdict === 'ACCEPTED') {
      const minutes = Math.max(0, Math.floor((submission.createdAt.getTime() - contestStart.getTime()) / 60_000));
      cell.solved = true;
      cell.solvedAtMinutes = minutes;
      solved += 1;
      penalty += minutes + cell.wrongAttempts * penaltyMinutes;
    } else {
      cell.wrongAttempts += 1;
    }
  }

  return { solved, penalty, problems };
}

const SOLVED_WEIGHT = 1_000_000_000;

/** Single sortable number for a Redis sorted set: more solved wins, then lower penalty. */
export function boardScore(solved: number, penalty: number): number {
  return solved * SOLVED_WEIGHT - Math.min(penalty, SOLVED_WEIGHT - 1);
}
