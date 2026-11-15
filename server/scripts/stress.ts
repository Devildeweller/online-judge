/**
 * Load test for the judging pipeline.
 *
 * Submits a mix of correct and deliberately broken solutions in all four languages through the
 * real HTTP API, waits for the workers to judge them, and checks every verdict against what the
 * program was written to produce.
 *
 *   npm run stress                       500 submissions against http://localhost:4000
 *   npm run stress -- --count 200        fewer submissions
 *   npm run stress -- --base http://localhost:8080
 *   npm run stress -- --verify           re-check the verdicts of an earlier run
 *   npm run stress -- --cleanup          delete the stress accounts and everything they submitted
 *
 * Needs the API and at least one worker running, and the seeded problem set (npm run db:seed).
 * It creates its own accounts (stress_001, ...) directly in the database so that the per-user
 * submission rate limit stays in force without slowing the run down.
 */
import { LANGUAGE_IDS, LANGUAGES } from '../src/judge/languages.js';
import { hashPassword } from '../src/lib/password.js';
import { type Language, prisma, type Verdict } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { rebuildGlobalBoard } from '../src/modules/leaderboard/service.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { seedProblems } from '../src/seed/problems/index.js';

type Variant = 'correct' | 'wrong' | 'compile' | 'crash' | 'spin' | 'hog';

const EXPECTED: Record<Variant, Verdict> = {
  correct: 'ACCEPTED',
  wrong: 'WRONG_ANSWER',
  compile: 'COMPILATION_ERROR',
  crash: 'RUNTIME_ERROR',
  spin: 'TIME_LIMIT_EXCEEDED',
  hog: 'MEMORY_LIMIT_EXCEEDED',
};

/** Share of each kind of submission, in percent. */
const MIX: [Variant, number][] = [
  ['correct', 64],
  ['wrong', 10],
  ['compile', 8],
  ['crash', 7],
  ['spin', 5],
  ['hog', 6],
];

const BROKEN: Record<Exclude<Variant, 'correct'>, Record<Language, string>> = {
  wrong: {
    CPP: '#include <cstdio>\nint main(){ puts("wrong"); return 0; }\n',
    PYTHON: 'print("wrong")\n',
    JAVA: 'public class Main { public static void main(String[] a) { System.out.println("wrong"); } }\n',
    JAVASCRIPT: 'console.log("wrong");\n',
  },
  compile: {
    CPP: 'int main() { return 0 }\n',
    PYTHON: 'def main(:\n    pass\n',
    JAVA: 'public class Main { public static void main(String[] a) { int x = ; } }\n',
    JAVASCRIPT: 'function ( {\n',
  },
  crash: {
    CPP: '#include <cstdlib>\nint main(){ std::abort(); }\n',
    PYTHON: 'raise RuntimeError("boom")\n',
    JAVA: 'public class Main { public static void main(String[] a) { throw new RuntimeException("boom"); } }\n',
    JAVASCRIPT: 'throw new Error("boom");\n',
  },
  spin: {
    CPP: 'int main(){ volatile unsigned long long x = 0; for(;;) x = x + 1; }\n',
    PYTHON: 'while True:\n    pass\n',
    JAVA: 'public class Main { public static void main(String[] a) { long x = 0; while (true) { x++; } } }\n',
    JAVASCRIPT: 'for (;;) {}\n',
  },
  hog: {
    CPP: '#include <vector>\n#include <cstdio>\nint main(){ std::vector<std::vector<char>> v; for(int i=0;i<8192;i++) v.emplace_back(1<<20, 1); printf("%zu\\n", v.size()); }\n',
    PYTHON: 'blocks = []\nfor _ in range(8192):\n    blocks.append(bytearray(b"x") * (1 << 20))\nprint(len(blocks))\n',
    JAVA: 'public class Main { public static void main(String[] a) { long[][] b = new long[8192][]; for (int i = 0; i < b.length; i++) b[i] = new long[1 << 20]; System.out.println(b.length); } }\n',
    JAVASCRIPT: 'const blocks = [];\nfor (;;) blocks.push(new Array(1e6).fill(1.5));\n',
  },
};

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const COUNT = Number(option('count', '500'));
const BASE = option('base', 'http://localhost:4000').replace(/\/$/, '');
const PER_USER = 10; // stays under the default limit of 12 submissions per minute
const HTTP_CONCURRENCY = 12;
const TIMEOUT_MS = Number(option('timeout-minutes', '45')) * 60_000;

interface Planned {
  problemId: number;
  slug: string;
  language: Language;
  variant: Variant;
  sourceCode: string;
  token: string;
  id?: number;
}

/** Deterministic shuffle so two runs submit the same workload. */
function shuffled<T>(items: T[]): T[] {
  let state = 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function plan(): Promise<Planned[]> {
  const withSolutions = seedProblems.filter((p) => p.solutions);
  const rows = await prisma.problem.findMany({
    where: { slug: { in: withSolutions.map((p) => p.slug) } },
    select: { id: true, slug: true, _count: { select: { testCases: true } } },
  });
  if (rows.length !== withSolutions.length) throw new Error('Seeded problems are missing. Run: npm run db:seed');
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));

  const userCount = Math.ceil(COUNT / PER_USER);
  const passwordHash = await hashPassword(`stress-${Date.now()}-${Math.random()}`);
  const tokens: string[] = [];
  for (let i = 1; i <= userCount; i++) {
    const username = `stress_${String(i).padStart(3, '0')}`;
    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, email: `${username}@stress.invalid`, passwordHash },
    });
    tokens.push(signAccessToken({ id: user.id, username: user.username, role: user.role }));
  }

  const variants = shuffled(MIX.flatMap(([variant, share]) => Array<Variant>(Math.round((COUNT * share) / 100)).fill(variant)));
  while (variants.length < COUNT) variants.push('correct');

  const planned: Planned[] = [];
  for (let i = 0; i < COUNT; i++) {
    const problem = withSolutions[i % withSolutions.length]!;
    // Offsetting by the problem cycle pairs every problem with every language over time.
    const language = LANGUAGE_IDS[(i + Math.floor(i / withSolutions.length)) % LANGUAGE_IDS.length]!;
    const variant = variants[i]!;
    planned.push({
      problemId: idBySlug.get(problem.slug)!,
      slug: problem.slug,
      language,
      variant,
      sourceCode: variant === 'correct' ? problem.solutions![language]! : BROKEN[variant][language],
      // Shifting by one account per round gives every account a mix of problems, still ten submissions each.
      token: tokens[(i + Math.floor(i / tokens.length)) % tokens.length]!,
    });
  }
  return planned;
}

async function submitOne(item: Planned): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(`${BASE}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${item.token}` },
      body: JSON.stringify({ problemId: item.problemId, language: item.language, sourceCode: item.sourceCode }),
    });
    if (response.status === 201) {
      item.id = ((await response.json()) as { submission: { id: number } }).submission.id;
      return;
    }
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after') ?? '5');
      await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
      continue;
    }
    throw new Error(`Submit failed with HTTP ${response.status}: ${await response.text()}`);
  }
  throw new Error('Submit kept being rate limited');
}

async function submitAll(items: Planned[]): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: HTTP_CONCURRENCY }, async () => {
      while (next < items.length) await submitOne(items[next++]!);
    }),
  );
}

const pad = (value: string | number, width: number) => String(value).padStart(width);
const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0;

/** Removes the stress accounts (their submissions cascade) and recomputes what was derived from them. */
async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { username: { startsWith: 'stress_' } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const touched = await prisma.submission.findMany({ where: { userId: { in: ids } }, distinct: ['problemId'], select: { problemId: true } });
  const removed = await prisma.submission.count({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  for (const { problemId } of touched) {
    const [submissionCount, acceptedCount] = await Promise.all([
      prisma.submission.count({ where: { problemId, status: 'COMPLETED' } }),
      prisma.submission.count({ where: { problemId, verdict: 'ACCEPTED' } }),
    ]);
    await prisma.problem.update({ where: { id: problemId }, data: { submissionCount, acceptedCount } });
  }
  await rebuildGlobalBoard();
  console.log(`Removed ${ids.length} stress accounts and ${removed} submissions.`);
}

/** What a submission was written to produce, recognised from its source code. */
function expectedVerdict(language: Language, sourceCode: string): Verdict {
  for (const variant of Object.keys(BROKEN) as Exclude<Variant, 'correct'>[]) {
    if (BROKEN[variant][language] === sourceCode) return EXPECTED[variant];
  }
  return 'ACCEPTED';
}

/** Prints the verdict matrix and timings for the given submissions and flags every unexpected verdict. */
async function report(ids: number[], wallSeconds: number | null): Promise<void> {
  const [rows, testRuns] = await Promise.all([
    prisma.submission.findMany({
      where: { id: { in: ids } },
      select: { id: true, language: true, sourceCode: true, status: true, verdict: true, createdAt: true, judgedAt: true, errorMessage: true, problem: { select: { id: true, slug: true } } },
    }),
    prisma.submissionTestResult.count({ where: { submissionId: { in: ids } } }),
  ]);
  const problemIds = [...new Set(rows.map((r) => r.problem.id))];
  const distinctTests = await prisma.testCase.count({ where: { problemId: { in: problemIds } } });

  const matrix = new Map<Language, Map<Verdict, number>>(LANGUAGE_IDS.map((l) => [l, new Map()]));
  const mismatches: string[] = [];
  const latencies: number[] = [];
  let unjudged = 0;
  for (const row of rows) {
    if (row.status !== 'COMPLETED' || !row.verdict) {
      unjudged += 1;
      continue;
    }
    const expected = expectedVerdict(row.language, row.sourceCode);
    const cell = matrix.get(row.language)!;
    cell.set(row.verdict, (cell.get(row.verdict) ?? 0) + 1);
    if (row.judgedAt) latencies.push(row.judgedAt.getTime() - row.createdAt.getTime());
    if (row.verdict !== expected) {
      const detail = row.errorMessage ? ` — ${row.errorMessage.split('\n')[0]}` : '';
      mismatches.push(`  #${row.id} ${row.problem.slug} ${row.language}: expected ${expected}, got ${row.verdict}${detail}`);
    }
  }
  latencies.sort((a, b) => a - b);
  const judged = rows.length - unjudged;

  const short: Partial<Record<Verdict, string>> = { ACCEPTED: 'AC', WRONG_ANSWER: 'WA', COMPILATION_ERROR: 'CE', RUNTIME_ERROR: 'RE', TIME_LIMIT_EXCEEDED: 'TLE', MEMORY_LIMIT_EXCEEDED: 'MLE', INTERNAL_ERROR: 'IE' };
  const sawInternal = [...matrix.values()].some((cell) => cell.has('INTERNAL_ERROR'));
  const columns: Verdict[] = [...Object.values(EXPECTED), ...(sawInternal ? (['INTERNAL_ERROR'] as Verdict[]) : [])];
  console.log(`${'Language'.padEnd(22)}${columns.map((v) => pad(short[v] ?? v, 6)).join('')}${pad('Total', 8)}`);
  for (const language of LANGUAGE_IDS) {
    const cell = matrix.get(language)!;
    const total = [...cell.values()].reduce((a, b) => a + b, 0);
    console.log(`${LANGUAGES[language].name.padEnd(22)}${columns.map((v) => pad(cell.get(v) ?? 0, 6)).join('')}${pad(total, 8)}`);
  }

  const lines = [
    `Submissions judged      ${judged}${unjudged > 0 ? ` (${unjudged} still waiting)` : ''}`,
    `Languages               ${[...matrix.values()].filter((cell) => cell.size > 0).length}`,
    `Problems                ${problemIds.length} (${distinctTests} distinct test cases)`,
    `Test case executions    ${testRuns}`,
  ];
  if (wallSeconds !== null) {
    lines.push(`Total time              ${wallSeconds.toFixed(1)} s`, `Throughput              ${(judged / wallSeconds).toFixed(2)} submissions/s`);
    lines.push(
      `Queue-to-verdict time   median ${(percentile(latencies, 50) / 1000).toFixed(1)} s, p95 ${(percentile(latencies, 95) / 1000).toFixed(1)} s, max ${((latencies.at(-1) ?? 0) / 1000).toFixed(1)} s`,
    );
  }
  lines.push(`Verdicts as expected    ${judged - mismatches.length} / ${judged}`);
  console.log(`\n${lines.join('\n')}`);

  if (mismatches.length > 0) {
    console.log(`\nUnexpected verdicts:\n${mismatches.slice(0, 40).join('\n')}`);
    process.exitCode = 1;
  }
  if (unjudged > 0) process.exitCode = 1;
}

/** Re-checks every submission the stress accounts have made so far, without submitting anything. */
async function verify(): Promise<void> {
  const rows = await prisma.submission.findMany({ where: { user: { username: { startsWith: 'stress_' } } }, select: { id: true } });
  if (rows.length === 0) {
    console.log('No stress submissions found. Run the stress test first.');
    return;
  }
  await report(rows.map((r) => r.id), null);
}

async function main(): Promise<void> {
  if (process.argv.includes('--cleanup')) return cleanup();
  if (process.argv.includes('--verify')) return verify();

  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`The API at ${BASE} is not reachable. Start it with: npm run dev`);

  const items = await plan();
  console.log(`Submitting ${items.length} solutions to ${BASE} (${Math.ceil(COUNT / PER_USER)} accounts, ${LANGUAGE_IDS.length} languages)...`);
  const started = Date.now();
  await submitAll(items);
  console.log(`All submissions accepted by the API in ${((Date.now() - started) / 1000).toFixed(1)} s. Waiting for the judge...`);

  const ids = items.map((i) => i.id!);
  let done = 0;
  while (done < ids.length) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`Timed out with ${ids.length - done} submissions still unjudged. Is a worker running?`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const now = await prisma.submission.count({ where: { id: { in: ids }, status: 'COMPLETED' } });
    if (now !== done) {
      done = now;
      const elapsed = (Date.now() - started) / 1000;
      process.stdout.write(`\r  judged ${pad(done, 4)} / ${ids.length}   ${elapsed.toFixed(0)} s   ${(done / elapsed).toFixed(2)} submissions/s   `);
    }
  }
  process.stdout.write('\n\n');
  await report(ids, (Date.now() - started) / 1000);
}

main()
  .catch((err: unknown) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
