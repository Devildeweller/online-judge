import { Rng, type SeedProblem } from '../types.js';
import { advancedProblems } from './advanced.js';
import { easyProblems } from './easy.js';

export const seedProblems: SeedProblem[] = [...easyProblems, ...advancedProblems];

export interface BuiltTestCase {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  explanation: string | null;
}

function seedFor(slug: string): number {
  let hash = 2166136261;
  for (const ch of slug) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Samples first, then hidden tests; expected outputs come from the reference solution. */
export function buildTestCases(problem: SeedProblem): BuiltTestCase[] {
  const samples = problem.samples.map((s) => ({
    input: s.input,
    expectedOutput: problem.solve(s.input),
    isSample: true,
    explanation: s.explanation ?? null,
  }));
  const hidden = problem.tests(new Rng(seedFor(problem.slug))).map((input) => ({
    input,
    expectedOutput: problem.solve(input),
    isSample: false,
    explanation: null,
  }));
  return [...samples, ...hidden];
}
