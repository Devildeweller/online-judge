import { describe, expect, it } from 'vitest';
import { checkOutput } from '../../src/judge/checker.js';

describe('LINES checker', () => {
  it('accepts identical output', () => {
    expect(checkOutput('LINES', '1 2 3\n4\n', '1 2 3\n4\n')).toBe(true);
  });

  it('ignores trailing whitespace, CRLF and trailing blank lines', () => {
    expect(checkOutput('LINES', '1 2 3  \r\n4\t\r\n\n\n', '1 2 3\n4\n')).toBe(true);
    expect(checkOutput('LINES', 'YES', 'YES\n')).toBe(true);
  });

  it('rejects different tokens, extra lines and changed inner spacing', () => {
    expect(checkOutput('LINES', '1 2 4\n', '1 2 3\n')).toBe(false);
    expect(checkOutput('LINES', '1\n2\n', '1\n')).toBe(false);
    expect(checkOutput('LINES', '1  2\n', '1 2\n')).toBe(false);
    expect(checkOutput('LINES', '', '0\n')).toBe(false);
  });

  it('keeps blank lines in the middle significant', () => {
    expect(checkOutput('LINES', 'a\n\nb\n', 'a\nb\n')).toBe(false);
  });

  it('is case sensitive', () => {
    expect(checkOutput('LINES', 'yes\n', 'YES\n')).toBe(false);
  });
});

describe('TOKENS checker', () => {
  it('ignores layout entirely', () => {
    expect(checkOutput('TOKENS', '1\n2\n3', '1 2 3\n')).toBe(true);
    expect(checkOutput('TOKENS', '  1   2\t3 \n\n', '1 2 3')).toBe(true);
  });

  it('rejects missing, extra or different tokens', () => {
    expect(checkOutput('TOKENS', '1 2', '1 2 3')).toBe(false);
    expect(checkOutput('TOKENS', '1 2 3 4', '1 2 3')).toBe(false);
    expect(checkOutput('TOKENS', '1 2 03', '1 2 3')).toBe(false);
  });
});

describe('FLOAT checker', () => {
  it('accepts answers within absolute error for small values', () => {
    expect(checkOutput('FLOAT', '0.5000004', '0.5')).toBe(true);
    expect(checkOutput('FLOAT', '6', '6.0')).toBe(true);
    expect(checkOutput('FLOAT', '6.00000', '6.0')).toBe(true);
  });

  it('accepts answers within relative error for large values', () => {
    expect(checkOutput('FLOAT', '1000000000000.5', '1000000000000.0')).toBe(true);
  });

  it('rejects answers outside tolerance', () => {
    expect(checkOutput('FLOAT', '0.50001', '0.5')).toBe(false);
    expect(checkOutput('FLOAT', '1000002', '1000000')).toBe(false);
  });

  it('accepts scientific notation and compares non-numeric tokens exactly', () => {
    expect(checkOutput('FLOAT', '1e3', '1000.0')).toBe(true);
    expect(checkOutput('FLOAT', 'YES 1.0', 'YES 1')).toBe(true);
    expect(checkOutput('FLOAT', 'NO 1.0', 'YES 1')).toBe(false);
  });

  it('rejects nan, inf and a wrong token count', () => {
    expect(checkOutput('FLOAT', 'nan', '1.0')).toBe(false);
    expect(checkOutput('FLOAT', 'inf', '1.0')).toBe(false);
    expect(checkOutput('FLOAT', '1.0 2.0', '1.0')).toBe(false);
  });
});
