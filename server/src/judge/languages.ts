import type { Language } from '../lib/prisma.js';

export interface LanguageSpec {
  id: Language;
  name: string;
  /** File the submission is written to inside the sandbox. */
  sourceFile: string;
  /** Compile (or syntax check) command; a non-zero exit is a compilation error. */
  compile: string[];
  /** Command that runs the solution; receives the problem's memory limit in MB. */
  run: (memoryLimitMb: number) => string[];
  /** Slower runtimes get proportionally more CPU time than the problem's base limit. */
  timeFactor: number;
  /** Runtime baseline (VM, interpreter) that is not charged against the problem's memory limit. */
  memoryOverheadMb: number;
}

export const LANGUAGES: Record<Language, LanguageSpec> = {
  CPP: {
    id: 'CPP',
    name: 'C++20 (GCC)',
    sourceFile: 'main.cpp',
    compile: ['g++', '-std=c++20', '-O2', '-pipe', '-o', 'main', 'main.cpp'],
    run: () => ['./main'],
    timeFactor: 1,
    memoryOverheadMb: 0,
  },
  PYTHON: {
    id: 'PYTHON',
    name: 'Python 3',
    sourceFile: 'main.py',
    compile: ['python3', '-m', 'py_compile', 'main.py'],
    run: () => ['python3', 'main.py'],
    timeFactor: 3,
    memoryOverheadMb: 16,
  },
  JAVA: {
    id: 'JAVA',
    name: 'Java 21 (OpenJDK)',
    sourceFile: 'Main.java',
    compile: ['javac', '-encoding', 'UTF-8', '-J-XX:-UsePerfData', '-J-XX:+UseSerialGC', '-J-Xmx384m', 'Main.java'],
    run: (mb) => ['java', `-Xmx${mb}m`, '-Xss64m', '-XX:+UseSerialGC', '-XX:-UsePerfData', '-cp', '/box', 'Main'],
    timeFactor: 2,
    memoryOverheadMb: 192,
  },
  JAVASCRIPT: {
    id: 'JAVASCRIPT',
    name: 'JavaScript (Node.js)',
    sourceFile: 'main.js',
    compile: ['node', '--check', 'main.js'],
    run: (mb) => ['node', `--max-old-space-size=${mb}`, 'main.js'],
    timeFactor: 2,
    memoryOverheadMb: 96,
  },
};

export const LANGUAGE_IDS = ['CPP', 'PYTHON', 'JAVA', 'JAVASCRIPT'] as const satisfies readonly Language[];

export function effectiveTimeLimitMs(spec: LanguageSpec, timeLimitMs: number): number {
  return Math.round(timeLimitMs * spec.timeFactor);
}

export function effectiveMemoryLimitKb(spec: LanguageSpec, memoryLimitMb: number): number {
  return (memoryLimitMb + spec.memoryOverheadMb) * 1024;
}
