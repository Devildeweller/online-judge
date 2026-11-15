import { env } from '../config/env.js';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { rebuildContestBoard, rebuildGlobalBoard } from '../modules/leaderboard/service.js';
import { buildTestCases, seedProblems } from './problems/index.js';

const DEMO_PASSWORD = 'password123';
const DEMO_USERS = ['alice', 'bob', 'carol'];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface SeedContest {
  slug: string;
  title: string;
  description: string;
  startsIn: number;
  duration: number;
  problems: string[];
}

const CONTESTS: SeedContest[] = [
  {
    slug: 'launch-round',
    title: 'Launch Round',
    description: `The very first round on the platform: three introductory problems to get familiar with the judge.

Standard ICPC rules apply. Problems are ranked by number solved, ties are broken by penalty time.`,
    startsIn: -8 * DAY,
    duration: 2 * HOUR,
    problems: ['sum-of-two', 'balanced-brackets', 'maximum-subarray'],
  },
  {
    slug: 'weekly-round-1',
    title: 'Weekly Round 1',
    description: `Four problems of increasing difficulty covering hashing, number theory and dynamic programming.

- **Scoring:** ICPC style. Each rejected attempt on a problem you later solve adds 20 minutes of penalty.
- **Languages:** C++, Python, Java and JavaScript.
- Compilation errors are never penalised.

Register and start solving, the round is open right now.`,
    startsIn: -30 * 60 * 1000,
    duration: 3 * DAY,
    problems: ['pair-sum-count', 'count-primes', 'longest-increasing-subsequence', 'knapsack'],
  },
  {
    slug: 'graph-night',
    title: 'Graph Night',
    description: `Two hours, three problems, graphs and dynamic programming.

The problem set is hidden until the round begins. Register in advance to appear on the leaderboard from the first minute.`,
    startsIn: 2 * DAY,
    duration: 2 * HOUR,
    problems: ['count-islands', 'edit-distance', 'cheapest-route'],
  },
];

async function upsertUser(username: string, email: string, password: string, role: 'USER' | 'ADMIN') {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  return prisma.user.create({ data: { username, email, role, passwordHash: await hashPassword(password) } });
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const admin = await upsertUser(env.ADMIN_USERNAME, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, 'ADMIN');
  const demoUsers = [];
  for (const name of DEMO_USERS) demoUsers.push(await upsertUser(name, `${name}@example.com`, DEMO_PASSWORD, 'USER'));
  console.log(`users      admin "${admin.username}" and ${demoUsers.length} demo accounts`);

  let totalTests = 0;
  const problemIdBySlug = new Map<string, number>();
  for (const seed of seedProblems) {
    // Re-seeding leaves existing problems alone (an admin may have edited them) unless --force is given.
    const existing = await prisma.problem.findUnique({ where: { slug: seed.slug }, select: { id: true } });
    if (existing && !force) {
      problemIdBySlug.set(seed.slug, existing.id);
      console.log(`problem    ${seed.slug.padEnd(34)} kept`);
      continue;
    }
    const tests = buildTestCases(seed);
    totalTests += tests.length;
    const data = {
      title: seed.title,
      statement: seed.statement,
      inputFormat: seed.inputFormat,
      outputFormat: seed.outputFormat,
      constraints: seed.constraints,
      difficulty: seed.difficulty,
      tags: seed.tags,
      timeLimitMs: seed.timeLimitMs ?? 1000,
      memoryLimitMb: seed.memoryLimitMb ?? 256,
      checker: seed.checker ?? 'LINES',
    };
    const problem = await prisma.problem.upsert({
      where: { slug: seed.slug },
      // Visibility is left alone on re-seed so an admin's publish decision survives.
      update: data,
      create: { ...data, slug: seed.slug, isPublic: seed.isPublic ?? true, authorId: admin.id },
    });
    await prisma.$transaction([
      prisma.testCase.deleteMany({ where: { problemId: problem.id } }),
      prisma.testCase.createMany({ data: tests.map((t, i) => ({ ...t, problemId: problem.id, position: i + 1 })) }),
    ]);
    problemIdBySlug.set(seed.slug, problem.id);
    console.log(`problem    ${seed.slug.padEnd(34)} ${String(tests.length).padStart(3)} tests`);
  }
  console.log(`           ${seedProblems.length} problems in the set, ${totalTests} test cases written`);

  const now = Date.now();
  for (const seed of CONTESTS) {
    const existing = await prisma.contest.findUnique({ where: { slug: seed.slug } });
    if (existing) {
      console.log(`contest    ${seed.slug.padEnd(34)} kept`);
      continue;
    }
    const startTime = new Date(now + seed.startsIn);
    const contest = await prisma.contest.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
        startTime,
        endTime: new Date(startTime.getTime() + seed.duration),
        createdById: admin.id,
        problems: {
          create: seed.problems.map((slug, i) => ({ problemId: problemIdBySlug.get(slug)!, label: String.fromCharCode(65 + i), position: i })),
        },
        // Demo accounts join the open round so its leaderboard is not empty.
        registrations: seed.slug === 'weekly-round-1' ? { create: demoUsers.map((u) => ({ userId: u.id })) } : undefined,
      },
    });
    await rebuildContestBoard(contest.id);
    console.log(`contest    ${seed.slug.padEnd(34)} created`);
  }

  await rebuildGlobalBoard();
  console.log(`\nSign in as "${env.ADMIN_USERNAME}" (password from ADMIN_PASSWORD) or as alice / bob / carol with "${DEMO_PASSWORD}".`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
