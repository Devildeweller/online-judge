import type { Verdict } from '../lib/prisma.js';

/** Resource usage reported by the in-container supervisor (docker/sandbox/oj-run). */
export interface RunMeta {
  exitCode: number;
  wallMs: number;
  cpuMs: number;
  rssKb: number;
  oomKilled: boolean;
}

export interface EffectiveLimits {
  cpuMs: number;
  wallMs: number;
  memoryKb: number;
}

const META_MARKER = '@@OJ@@';
const META_PATTERN = /@@OJ@@ exit=(\d+) wall=([\d.]+) user=([\d.]+) sys=([\d.]+) rss=(\d+) oom=([01])\s*$/;

/**
 * The supervisor appends one metadata line after the program's own stderr. Only the last
 * marker counts, so a program printing a fake marker cannot override the real one.
 */
export function parseMeta(rawStderr: string): { meta: RunMeta; stderr: string } | null {
  const at = rawStderr.lastIndexOf(META_MARKER);
  if (at < 0) return null;
  const match = META_PATTERN.exec(rawStderr.slice(at));
  if (!match) return null;
  const [, exit, wall, user, sys, rss, oom] = match;
  return {
    meta: {
      exitCode: Number(exit),
      wallMs: Math.round(Number(wall) * 1000),
      cpuMs: Math.round((Number(user) + Number(sys)) * 1000),
      rssKb: Number(rss),
      oomKilled: oom === '1',
    },
    stderr: rawStderr.slice(0, at).replace(/\n$/, ''),
  };
}

const OUT_OF_MEMORY_HINTS = ['java.lang.OutOfMemoryError', 'heap out of memory', 'MemoryError', 'std::bad_alloc'];

/** Returns the failure verdict, or null when the program ran within limits and its output should be checked. */
export function classifyRun(meta: RunMeta, limits: EffectiveLimits, stderr: string): Verdict | null {
  if (meta.oomKilled || meta.rssKb > limits.memoryKb) return 'MEMORY_LIMIT_EXCEEDED';
  // Managed runtimes fail on their own heap limit before the container limit is reached, often after
  // burning CPU in the garbage collector, so this is checked before the time limit.
  if (meta.exitCode !== 0 && OUT_OF_MEMORY_HINTS.some((hint) => stderr.includes(hint))) return 'MEMORY_LIMIT_EXCEEDED';
  // The supervisor stops the program at the wall limit; allow for its 10ms timer resolution.
  if (meta.cpuMs > limits.cpuMs || meta.wallMs >= limits.wallMs - 20) return 'TIME_LIMIT_EXCEEDED';
  if (meta.exitCode !== 0) return 'RUNTIME_ERROR';
  return null;
}

const SIGNALS: Record<number, string> = {
  4: 'SIGILL (illegal instruction)',
  6: 'SIGABRT (aborted)',
  7: 'SIGBUS (bus error)',
  8: 'SIGFPE (arithmetic error, e.g. division by zero)',
  9: 'SIGKILL (killed)',
  11: 'SIGSEGV (segmentation fault)',
  13: 'SIGPIPE (broken pipe)',
  25: 'SIGXFSZ (file size limit exceeded)',
};

export function describeExit(exitCode: number): string {
  const signal = exitCode > 128 ? exitCode - 128 : undefined;
  if (signal !== undefined && SIGNALS[signal]) return `Terminated by ${SIGNALS[signal]}`;
  return `Exited with code ${exitCode}`;
}

export function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n… (truncated)`;
}
