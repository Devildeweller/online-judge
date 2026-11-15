import { describe, expect, it } from 'vitest';
import { boardScore, computeStanding, type StandingSubmission } from '../../src/modules/leaderboard/standing.js';

const start = new Date('2026-01-01T10:00:00Z');
const at = (minutes: number, seconds = 0) => new Date(start.getTime() + minutes * 60_000 + seconds * 1000);
const sub = (problemId: number, verdict: StandingSubmission['verdict'], minutes: number): StandingSubmission => ({
  problemId,
  verdict,
  createdAt: at(minutes),
});

describe('computeStanding (ICPC rules)', () => {
  it('is empty without submissions', () => {
    expect(computeStanding([], start, 20)).toEqual({ solved: 0, penalty: 0, problems: {} });
  });

  it('charges elapsed minutes for a first-try solve', () => {
    const standing = computeStanding([sub(1, 'ACCEPTED', 17)], start, 20);
    expect(standing.solved).toBe(1);
    expect(standing.penalty).toBe(17);
    expect(standing.problems[1]).toEqual({ wrongAttempts: 0, solved: true, solvedAtMinutes: 17 });
  });

  it('adds the penalty for each rejected attempt before the accepted one', () => {
    const standing = computeStanding(
      [sub(1, 'WRONG_ANSWER', 5), sub(1, 'TIME_LIMIT_EXCEEDED', 9), sub(1, 'ACCEPTED', 30)],
      start,
      20,
    );
    expect(standing.solved).toBe(1);
    expect(standing.penalty).toBe(30 + 2 * 20);
    expect(standing.problems[1]!.wrongAttempts).toBe(2);
  });

  it('does not charge for unsolved problems but still counts their attempts', () => {
    const standing = computeStanding([sub(1, 'WRONG_ANSWER', 5), sub(1, 'RUNTIME_ERROR', 8), sub(2, 'ACCEPTED', 10)], start, 20);
    expect(standing.solved).toBe(1);
    expect(standing.penalty).toBe(10);
    expect(standing.problems[1]).toEqual({ wrongAttempts: 2, solved: false, solvedAtMinutes: null });
  });

  it('ignores compilation errors, internal errors and unjudged submissions', () => {
    const standing = computeStanding(
      [sub(1, 'COMPILATION_ERROR', 1), sub(1, 'INTERNAL_ERROR', 2), sub(1, null, 3), sub(1, 'ACCEPTED', 4)],
      start,
      20,
    );
    expect(standing.penalty).toBe(4);
    expect(standing.problems[1]!.wrongAttempts).toBe(0);
  });

  it('ignores everything after the first accepted submission', () => {
    const standing = computeStanding([sub(1, 'ACCEPTED', 12), sub(1, 'WRONG_ANSWER', 20), sub(1, 'ACCEPTED', 40)], start, 20);
    expect(standing.solved).toBe(1);
    expect(standing.penalty).toBe(12);
    expect(standing.problems[1]).toEqual({ wrongAttempts: 0, solved: true, solvedAtMinutes: 12 });
  });

  it('floors partial minutes and sums across problems', () => {
    const standing = computeStanding(
      [
        { problemId: 1, verdict: 'ACCEPTED', createdAt: at(9, 59) },
        sub(2, 'WRONG_ANSWER', 15),
        sub(2, 'ACCEPTED', 61),
      ],
      start,
      10,
    );
    expect(standing.solved).toBe(2);
    expect(standing.penalty).toBe(9 + 61 + 10);
  });
});

describe('boardScore', () => {
  it('ranks more solved problems above any penalty difference', () => {
    expect(boardScore(2, 100_000)).toBeGreaterThan(boardScore(1, 0));
  });

  it('ranks lower penalty first among equal solved counts', () => {
    expect(boardScore(3, 50)).toBeGreaterThan(boardScore(3, 51));
    expect(boardScore(0, 0)).toBe(0);
  });

  it('stays exactly representable as a double', () => {
    const score = boardScore(26, 123_456);
    expect(Number.isSafeInteger(score)).toBe(true);
    expect(score).toBe(26_000_000_000 - 123_456);
  });
});
