import { describe, expect, it } from 'vitest';
import { effectiveMemoryLimitKb, effectiveTimeLimitMs, LANGUAGE_IDS, LANGUAGES } from '../../src/judge/languages.js';
import { classifyRun, describeExit, parseMeta, truncate, type EffectiveLimits, type RunMeta } from '../../src/judge/outcome.js';

const limits: EffectiveLimits = { cpuMs: 1000, wallMs: 3000, memoryKb: 256 * 1024 };
const ok: RunMeta = { exitCode: 0, wallMs: 120, cpuMs: 100, rssKb: 4000, oomKilled: false };

describe('parseMeta', () => {
  it('parses the supervisor report and strips it from stderr', () => {
    const parsed = parseMeta('warning: something\n\n@@OJ@@ exit=0 wall=0.12 user=0.08 sys=0.02 rss=3456 oom=0\n');
    expect(parsed).not.toBeNull();
    expect(parsed!.meta).toEqual({ exitCode: 0, wallMs: 120, cpuMs: 100, rssKb: 3456, oomKilled: false });
    expect(parsed!.stderr).toBe('warning: something\n');
  });

  it('handles empty program stderr', () => {
    const parsed = parseMeta('\n@@OJ@@ exit=139 wall=0.00 user=0.00 sys=0.00 rss=1200 oom=1\n');
    expect(parsed!.meta.exitCode).toBe(139);
    expect(parsed!.meta.oomKilled).toBe(true);
    expect(parsed!.stderr).toBe('');
  });

  it('trusts only the last report, so a program cannot forge one', () => {
    const forged = '@@OJ@@ exit=0 wall=0.01 user=0.01 sys=0.00 rss=100 oom=0\n';
    const parsed = parseMeta(`${forged}\n@@OJ@@ exit=1 wall=2.50 user=2.40 sys=0.05 rss=9000 oom=0\n`);
    expect(parsed!.meta.exitCode).toBe(1);
    expect(parsed!.meta.cpuMs).toBe(2450);
    expect(parsed!.stderr).toContain('@@OJ@@ exit=0');
  });

  it('returns null when the report is missing or malformed', () => {
    expect(parseMeta('Error response from daemon: no such container')).toBeNull();
    expect(parseMeta('@@OJ@@ exit=abc')).toBeNull();
    expect(parseMeta('')).toBeNull();
  });
});

describe('classifyRun', () => {
  it('passes a clean run on to the checker', () => {
    expect(classifyRun(ok, limits, '')).toBeNull();
  });

  it('reports time limit on CPU time or on the wall-clock kill', () => {
    expect(classifyRun({ ...ok, cpuMs: 1001 }, limits, '')).toBe('TIME_LIMIT_EXCEEDED');
    expect(classifyRun({ ...ok, cpuMs: 10, wallMs: 3000, exitCode: 137 }, limits, '')).toBe('TIME_LIMIT_EXCEEDED');
    expect(classifyRun({ ...ok, cpuMs: 1000 }, limits, '')).toBeNull();
  });

  it('reports memory limit on an OOM kill or peak RSS above the limit', () => {
    expect(classifyRun({ ...ok, oomKilled: true, exitCode: 137 }, limits, '')).toBe('MEMORY_LIMIT_EXCEEDED');
    expect(classifyRun({ ...ok, rssKb: 256 * 1024 + 1 }, limits, '')).toBe('MEMORY_LIMIT_EXCEEDED');
    expect(classifyRun({ ...ok, rssKb: 256 * 1024 }, limits, '')).toBeNull();
  });

  it('treats language-level out-of-memory failures as memory limit', () => {
    expect(classifyRun({ ...ok, exitCode: 1 }, limits, 'Exception in thread "main" java.lang.OutOfMemoryError: Java heap space')).toBe(
      'MEMORY_LIMIT_EXCEEDED',
    );
    expect(classifyRun({ ...ok, exitCode: 134 }, limits, 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory')).toBe(
      'MEMORY_LIMIT_EXCEEDED',
    );
    expect(classifyRun({ ...ok, exitCode: 1 }, limits, 'Traceback (most recent call last):\nMemoryError')).toBe('MEMORY_LIMIT_EXCEEDED');
  });

  it('prefers memory limit over time limit when a runtime thrashes in the garbage collector before giving up', () => {
    const thrashed = { ...ok, exitCode: 134, cpuMs: 2600 };
    expect(classifyRun(thrashed, limits, 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory')).toBe(
      'MEMORY_LIMIT_EXCEEDED',
    );
    // A clean exit that merely mentions memory is still judged on its time.
    expect(classifyRun({ ...ok, cpuMs: 2600 }, limits, 'MemoryError')).toBe('TIME_LIMIT_EXCEEDED');
  });

  it('reports any other non-zero exit as a runtime error', () => {
    expect(classifyRun({ ...ok, exitCode: 1 }, limits, 'ZeroDivisionError: division by zero')).toBe('RUNTIME_ERROR');
    expect(classifyRun({ ...ok, exitCode: 139 }, limits, '')).toBe('RUNTIME_ERROR');
  });
});

describe('helpers', () => {
  it('names common fatal signals', () => {
    expect(describeExit(139)).toContain('SIGSEGV');
    expect(describeExit(136)).toContain('SIGFPE');
    expect(describeExit(3)).toBe('Exited with code 3');
  });

  it('truncates long text and leaves short text alone', () => {
    expect(truncate('abc', 10)).toBe('abc');
    expect(truncate('abcdefghij', 4)).toBe('abcd\n… (truncated)');
  });
});

describe('language table', () => {
  it('defines every language with a compile step and a run command', () => {
    for (const id of LANGUAGE_IDS) {
      const spec = LANGUAGES[id];
      expect(spec.id).toBe(id);
      expect(spec.compile.length).toBeGreaterThan(0);
      expect(spec.compile).toContain(spec.sourceFile);
      expect(spec.run(256).length).toBeGreaterThan(0);
      expect(spec.timeFactor).toBeGreaterThanOrEqual(1);
    }
  });

  it('scales limits per language', () => {
    expect(effectiveTimeLimitMs(LANGUAGES.CPP, 1000)).toBe(1000);
    expect(effectiveTimeLimitMs(LANGUAGES.PYTHON, 1000)).toBe(3000);
    expect(effectiveMemoryLimitKb(LANGUAGES.CPP, 256)).toBe(256 * 1024);
    expect(effectiveMemoryLimitKb(LANGUAGES.JAVA, 256)).toBeGreaterThan(256 * 1024);
    expect(LANGUAGES.JAVA.run(128)).toContain('-Xmx128m');
  });
});
