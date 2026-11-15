import { describe, expect, it } from 'vitest';
import { LANGUAGE_IDS } from '../../src/judge/languages.js';
import { buildTestCases, seedProblems } from '../../src/seed/problems/index.js';

const bySlug = (slug: string) => seedProblems.find((p) => p.slug === slug)!;

describe('seed problem set', () => {
  it('has unique slugs', () => {
    const slugs = seedProblems.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('contains well over fifty test cases, each with input and expected output', () => {
    let total = 0;
    for (const problem of seedProblems) {
      const tests = buildTestCases(problem);
      expect(tests.filter((t) => t.isSample).length).toBeGreaterThan(0);
      expect(tests.filter((t) => !t.isSample).length).toBeGreaterThanOrEqual(5);
      for (const test of tests) {
        expect(test.input.endsWith('\n')).toBe(true);
        expect(test.expectedOutput.trim().length).toBeGreaterThan(0);
        expect(test.expectedOutput).not.toMatch(/undefined|NaN|Infinity/);
      }
      total += tests.length;
    }
    expect(total).toBeGreaterThan(50);
  });

  it('generates the same test data on every run', () => {
    const problem = bySlug('pair-sum-count');
    expect(buildTestCases(problem)).toEqual(buildTestCases(problem));
  });

  it('ships reference solutions in all four languages for the stress-test problems', () => {
    const withSolutions = seedProblems.filter((p) => p.solutions);
    expect(withSolutions.length).toBeGreaterThanOrEqual(5);
    for (const problem of withSolutions) {
      for (const language of LANGUAGE_IDS) expect(problem.solutions![language], `${problem.slug} ${language}`).toBeTruthy();
    }
  });
});

describe('reference solutions on known answers', () => {
  const cases: [string, string, string][] = [
    ['sum-of-two', '3 5\n', '8'],
    ['sum-of-two', '1000000000000000000 1000000000000000000\n', '2000000000000000000'],
    ['maximum-subarray', '9\n-2 1 -3 4 -1 2 1 -5 4\n', '6'],
    ['maximum-subarray', '3\n-4 -1 -7\n', '-1'],
    ['balanced-brackets', '{[()]}\n', 'YES'],
    ['balanced-brackets', '([)]\n', 'NO'],
    ['balanced-brackets', '((\n', 'NO'],
    ['count-primes', '10\n', '4'],
    ['count-primes', '1\n', '0'],
    ['count-primes', '1000000\n', '78498'],
    ['pair-sum-count', '5 6\n1 5 3 3 7\n', '2'],
    ['pair-sum-count', '4 2\n1 1 1 1\n', '6'],
    ['count-not-greater', '5 4\n4 1 7 4 9\n4\n0\n9\n8\n', '3\n0\n5\n4'],
    ['modular-power', '3\n2 10 1000\n3 0 7\n5 3 1\n', '24\n1\n0'],
    ['triangle-area', '0 0\n4 0\n0 3\n', '6.0'],
    ['longest-increasing-subsequence', '8\n10 9 2 5 3 7 101 18\n', '4'],
    ['longest-increasing-subsequence', '4\n7 7 7 7\n', '1'],
    ['grid-escape', '3 4\n....\n.##.\n....\n', '5'],
    ['grid-escape', '2 2\n.#\n#.\n', '-1'],
    ['cheapest-route', '4 5\n1 2 4\n1 3 1\n3 2 2\n2 4 5\n3 4 9\n', '8'],
    ['cheapest-route', '3 1\n1 2 7\n', '-1'],
    ['knapsack', '4 7\n1 1\n3 4\n4 5\n5 7\n', '9'],
    ['knapsack', '2 3\n3 10\n3 20\n', '20'],
    ['range-sum-updates', '5 4\n1 2 3 4 5\n2 1 5\n1 3 10\n2 2 4\n2 3 3\n', '15\n16\n10'],
    ['edit-distance', 'kitten\nsitting\n', '3'],
    ['edit-distance', 'abc\nabc\n', '0'],
    ['count-islands', '4 5\n##..#\n#...#\n..#..\n.....\n', '3'],
  ];

  it.each(cases)('%s: %j', (slug, input, expected) => {
    expect(bySlug(slug).solve(input).trim()).toBe(expected);
  });
});
