import type { CheckerType, Difficulty, Language } from '../lib/prisma.js';

/** Small deterministic PRNG (mulberry32) so seeded test data is identical on every machine. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }

  array(length: number, lo: number, hi: number): number[] {
    return Array.from({ length }, () => this.int(lo, hi));
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}

export interface SeedSample {
  input: string;
  explanation?: string;
}

export interface SeedProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  checker?: CheckerType;
  isPublic?: boolean;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  samples: SeedSample[];
  /** Hidden test inputs. */
  tests: (rng: Rng) => string[];
  /** Reference solution; expected outputs are computed with it. */
  solve: (input: string) => string;
  /** Accepted solutions per language, used by the stress test to exercise every toolchain. */
  solutions?: Partial<Record<Language, string>>;
}

export const lines = (...parts: (string | number)[]): string => `${parts.join('\n')}\n`;
