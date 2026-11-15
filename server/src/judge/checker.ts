import type { CheckerType } from '../lib/prisma.js';

export const FLOAT_TOLERANCE = 1e-6;

/** Lines with trailing whitespace removed and trailing blank lines dropped. */
function normalizedLines(text: string): string[] {
  const lines = text.split('\n').map((line) => line.replace(/[ \t\r\f\v]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function tokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function floatTokenEqual(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  if (!NUMERIC.test(actual) || !NUMERIC.test(expected)) return false;
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e)) return false;
  // absolute or relative error, whichever is more forgiving
  return Math.abs(a - e) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(e));
}

/**
 * LINES  - line by line, ignoring trailing whitespace and trailing blank lines (default).
 * TOKENS - whitespace-separated tokens, layout is irrelevant.
 * FLOAT  - like TOKENS, numeric tokens may differ by 1e-6 absolute or relative error.
 */
export function checkOutput(type: CheckerType, actual: string, expected: string): boolean {
  switch (type) {
    case 'LINES':
      return sameArray(normalizedLines(actual), normalizedLines(expected));
    case 'TOKENS':
      return sameArray(tokens(actual), tokens(expected));
    case 'FLOAT': {
      const a = tokens(actual);
      const e = tokens(expected);
      if (a.length !== e.length) return false;
      for (let i = 0; i < a.length; i++) if (!floatTokenEqual(a[i]!, e[i]!)) return false;
      return true;
    }
  }
}
