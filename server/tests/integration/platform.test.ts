import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { assertSandboxAvailable } from '../../src/judge/docker.js';
import { judgeSubmission } from '../../src/judge/pipeline.js';
import { hashPassword } from '../../src/lib/password.js';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { closeJudgeQueue, getJudgeQueue } from '../../src/queue/judgeQueue.js';
import { attachRealtime, type Realtime } from '../../src/realtime/socket.js';

/**
 * End-to-end flow through the real HTTP API, PostgreSQL, Redis and the Docker sandbox:
 * accounts, problem management, judging, contests with ICPC scoring, leaderboards and
 * live updates. Jobs are judged in-process with judgeSubmission() instead of a separate worker.
 */

let server: Server;
let realtime: Realtime;
let base: string;

interface Reply<T = any> {
  status: number;
  body: T;
  cookie: string | null;
}

async function call<T = any>(method: string, path: string, options: { token?: string; body?: unknown; cookie?: string } = {}): Promise<Reply<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${base}/api${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  const setCookie = response.headers.get('set-cookie');
  return { status: response.status, body: text ? JSON.parse(text) : undefined, cookie: setCookie ? setCookie.split(';')[0]! : null };
}

const SUM_CPP = '#include <iostream>\nint main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n"; }\n';
const SUM_PY = 'a, b = map(int, input().split())\nprint(a + b)\n';
const WRONG_PY = 'print(42)\n';
const BROKEN_CPP = 'int main() { return 0 }\n';

const problemBody = (slug: string, isPublic: boolean) => ({
  slug,
  title: `Sum ${slug}`,
  statement: 'Print $a + b$.',
  inputFormat: 'Two integers.',
  outputFormat: 'Their sum.',
  constraints: '',
  difficulty: 'EASY',
  tags: ['Math', 'warmup'],
  timeLimitMs: 1000,
  memoryLimitMb: 128,
  checker: 'LINES',
  isPublic,
  testCases: [
    { input: '1 2\n', expectedOutput: '3\n', isSample: true, explanation: 'One plus two.' },
    { input: '10 -4\n', expectedOutput: '6\n', isSample: false },
    { input: '100000 200000\n', expectedOutput: '300000\n', isSample: false },
  ],
});

const state = {
  alice: { token: '', id: 0, cookie: '' },
  bob: { token: '', id: 0 },
  admin: { token: '' },
  publicProblem: 0,
  hiddenProblem: 0,
  contest: { id: 0, slug: 'test-round' },
};

async function submit(token: string, problemId: number, language: string, sourceCode: string, contestId?: number) {
  const reply = await call('POST', '/submissions', { token, body: { problemId, language, sourceCode, contestId } });
  expect(reply.status, JSON.stringify(reply.body)).toBe(201);
  expect(reply.body.submission.status).toBe('QUEUED');
  return reply.body.submission.id as number;
}

async function submitAndJudge(token: string, problemId: number, language: string, sourceCode: string, contestId?: number) {
  const id = await submit(token, problemId, language, sourceCode, contestId);
  await judgeSubmission(id);
  const reply = await call('GET', `/submissions/${id}`, { token });
  expect(reply.status).toBe(200);
  return reply.body.submission;
}

beforeAll(async () => {
  await assertSandboxAvailable();
  await prisma.$executeRawUnsafe(
    'TRUNCATE "SubmissionTestResult", "Submission", "ContestRegistration", "ContestProblem", "Contest", "TestCase", "Problem", "User" RESTART IDENTITY CASCADE',
  );
  await redis.flushdb();

  server = createApp().listen(0);
  realtime = attachRealtime(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await realtime?.close();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await closeJudgeQueue();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('health and metadata', () => {
  it('reports PostgreSQL and Redis as up', async () => {
    const reply = await call('GET', '/health');
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ status: 'ok', postgres: 'up', redis: 'up' });
  });

  it('lists the four supported languages', async () => {
    const reply = await call('GET', '/meta');
    expect(reply.body.languages.map((l: { id: string }) => l.id)).toEqual(['CPP', 'PYTHON', 'JAVA', 'JAVASCRIPT']);
  });

  it('answers unknown routes with a JSON 404', async () => {
    const reply = await call('GET', '/nope');
    expect(reply.status).toBe(404);
    expect(reply.body.error.code).toBe('NOT_FOUND');
  });
});

describe('authentication', () => {
  it('validates registration input', async () => {
    const short = await call('POST', '/auth/register', { body: { username: 'al', email: 'a@example.com', password: 'longenough' } });
    expect(short.status).toBe(400);
    const weak = await call('POST', '/auth/register', { body: { username: 'alice', email: 'a@example.com', password: 'short' } });
    expect(weak.status).toBe(400);
    const email = await call('POST', '/auth/register', { body: { username: 'alice', email: 'not-an-email', password: 'longenough' } });
    expect(email.status).toBe(400);
  });

  it('registers users, issues tokens and never returns the password hash', async () => {
    const alice = await call('POST', '/auth/register', { body: { username: 'alice', email: 'Alice@Example.com', password: 'alice-password' } });
    expect(alice.status).toBe(201);
    expect(alice.body.user).toMatchObject({ username: 'alice', email: 'alice@example.com', role: 'USER' });
    expect(JSON.stringify(alice.body)).not.toContain('passwordHash');
    expect(alice.cookie).toMatch(/^oj_refresh=/);
    Object.assign(state.alice, { token: alice.body.accessToken, id: alice.body.user.id, cookie: alice.cookie });

    const bob = await call('POST', '/auth/register', { body: { username: 'bob', email: 'bob@example.com', password: 'bob-password' } });
    Object.assign(state.bob, { token: bob.body.accessToken, id: bob.body.user.id });
  });

  it('rejects duplicate usernames (case-insensitively) and emails', async () => {
    const name = await call('POST', '/auth/register', { body: { username: 'ALICE', email: 'other@example.com', password: 'alice-password' } });
    expect(name.status).toBe(409);
    const email = await call('POST', '/auth/register', { body: { username: 'alice2', email: 'alice@example.com', password: 'alice-password' } });
    expect(email.status).toBe(409);
  });

  it('logs in by username or email and rejects a wrong password with a generic message', async () => {
    expect((await call('POST', '/auth/login', { body: { identifier: 'alice', password: 'alice-password' } })).status).toBe(200);
    expect((await call('POST', '/auth/login', { body: { identifier: 'ALICE@example.com', password: 'alice-password' } })).status).toBe(200);
    const wrong = await call('POST', '/auth/login', { body: { identifier: 'alice', password: 'nope' } });
    const unknown = await call('POST', '/auth/login', { body: { identifier: 'nobody', password: 'nope' } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('protects /auth/me and rejects a tampered token', async () => {
    expect((await call('GET', '/auth/me')).status).toBe(401);
    expect((await call('GET', '/auth/me', { token: `${state.alice.token}x` })).status).toBe(401);
    const me = await call('GET', '/auth/me', { token: state.alice.token });
    expect(me.body.user.username).toBe('alice');
  });

  it('rotates refresh tokens: each one works exactly once', async () => {
    const first = await call('POST', '/auth/refresh', { cookie: state.alice.cookie });
    expect(first.status).toBe(200);
    expect(first.cookie).not.toBe(state.alice.cookie);

    const replay = await call('POST', '/auth/refresh', { cookie: state.alice.cookie });
    expect(replay.status).toBe(401);

    const second = await call('POST', '/auth/refresh', { cookie: first.cookie! });
    expect(second.status).toBe(200);
    state.alice.token = second.body.accessToken;

    await call('POST', '/auth/logout', { cookie: second.cookie! });
    expect((await call('POST', '/auth/refresh', { cookie: second.cookie! })).status).toBe(401);
  });
});

describe('problem management', () => {
  it('keeps the admin API away from guests and ordinary users', async () => {
    expect((await call('GET', '/admin/stats')).status).toBe(401);
    expect((await call('GET', '/admin/stats', { token: state.alice.token })).status).toBe(403);
    expect((await call('POST', '/admin/problems', { token: state.alice.token, body: problemBody('nope', true) })).status).toBe(403);
  });

  it('lets an admin create problems with test cases', async () => {
    await prisma.user.create({ data: { username: 'root', email: 'root@example.com', role: 'ADMIN', passwordHash: await hashPassword('root-password') } });
    const login = await call('POST', '/auth/login', { body: { identifier: 'root', password: 'root-password' } });
    state.admin.token = login.body.accessToken;

    const open = await call('POST', '/admin/problems', { token: state.admin.token, body: problemBody('sum-public', true) });
    expect(open.status, JSON.stringify(open.body)).toBe(201);
    state.publicProblem = open.body.problem.id;
    expect(open.body.problem.tags).toEqual(['math', 'warmup']);

    const hidden = await call('POST', '/admin/problems', { token: state.admin.token, body: problemBody('sum-hidden', false) });
    state.hiddenProblem = hidden.body.problem.id;

    const full = await call('GET', `/admin/problems/${state.publicProblem}`, { token: state.admin.token });
    expect(full.body.problem.testCases).toHaveLength(3);
  });

  it('rejects invalid problems and duplicate slugs', async () => {
    const bad = await call('POST', '/admin/problems', { token: state.admin.token, body: { ...problemBody('Bad Slug', true) } });
    expect(bad.status).toBe(400);
    const duplicate = await call('POST', '/admin/problems', { token: state.admin.token, body: problemBody('sum-public', true) });
    expect(duplicate.status).toBe(409);
  });

  it('shows only samples to solvers and hides unpublished problems entirely', async () => {
    const list = await call('GET', '/problems');
    expect(list.body.items.map((p: { slug: string }) => p.slug)).toEqual(['sum-public']);

    const detail = await call('GET', '/problems/sum-public');
    expect(detail.body.problem.samples).toHaveLength(1);
    expect(detail.body.problem.samples[0]).toMatchObject({ input: '1 2\n', expectedOutput: '3\n' });
    expect(JSON.stringify(detail.body)).not.toContain('100000 200000');

    expect((await call('GET', '/problems/sum-hidden', { token: state.alice.token })).status).toBe(404);
    expect((await call('GET', '/problems/sum-hidden', { token: state.admin.token })).status).toBe(200);
    const all = await call('GET', '/problems?scope=all', { token: state.alice.token });
    expect(all.body.items).toHaveLength(1);
  });

  it('filters by search, difficulty and tag', async () => {
    expect((await call('GET', '/problems?search=sum')).body.total).toBe(1);
    expect((await call('GET', '/problems?search=zzz')).body.total).toBe(0);
    expect((await call('GET', '/problems?difficulty=HARD')).body.total).toBe(0);
    expect((await call('GET', '/problems?tag=math')).body.total).toBe(1);
    expect((await call('GET', '/problems/tags')).body.tags).toContainEqual({ tag: 'math', count: 1 });
  });
});

describe('judging', () => {
  it('requires authentication and a valid payload to submit', async () => {
    const body = { problemId: state.publicProblem, language: 'CPP', sourceCode: SUM_CPP };
    expect((await call('POST', '/submissions', { body })).status).toBe(401);
    expect((await call('POST', '/submissions', { token: state.alice.token, body: { ...body, language: 'RUST' } })).status).toBe(400);
    expect((await call('POST', '/submissions', { token: state.alice.token, body: { ...body, sourceCode: '' } })).status).toBe(400);
    expect((await call('POST', '/submissions', { token: state.alice.token, body: { ...body, sourceCode: 'x'.repeat(70_000) } })).status).toBe(400);
    expect((await call('POST', '/submissions', { token: state.alice.token, body: { ...body, problemId: state.hiddenProblem } })).status).toBe(404);
  });

  it('queues a submission as a job and judges it to Accepted, pushing live updates over the socket', async () => {
    const socket: Socket = connect(base, { auth: { token: state.alice.token }, transports: ['websocket'] });
    const updates: { id: number; status: string; verdict: string | null; passedTests: number }[] = [];
    socket.on('submission:update', (u) => updates.push(u));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });

    const queue = getJudgeQueue();
    const before = await queue.getJobCounts('waiting', 'prioritized');
    const id = await submit(state.alice.token, state.publicProblem, 'CPP', SUM_CPP);
    const after = await queue.getJobCounts('waiting', 'prioritized');
    expect((after.waiting ?? 0) + (after.prioritized ?? 0)).toBe((before.waiting ?? 0) + (before.prioritized ?? 0) + 1);

    await judgeSubmission(id);
    const reply = await call('GET', `/submissions/${id}`, { token: state.alice.token });
    const s = reply.body.submission;
    expect(s).toMatchObject({ status: 'COMPLETED', verdict: 'ACCEPTED', passedTests: 3, totalTests: 3, failedTest: null, canViewSource: true });
    expect(s.sourceCode).toBe(SUM_CPP);
    expect(s.results.map((r: { verdict: string }) => r.verdict)).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    expect(s.timeMs).toBeGreaterThanOrEqual(0);
    expect(s.memoryKb).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 300));
    socket.disconnect();
    const mine = updates.filter((u) => u.id === id);
    expect(mine.map((u) => u.status)).toEqual(expect.arrayContaining(['COMPILING', 'RUNNING', 'COMPLETED']));
    expect(mine.at(-1)).toMatchObject({ status: 'COMPLETED', verdict: 'ACCEPTED', passedTests: 3 });
  });

  it('refuses socket connections that present an invalid token', async () => {
    const socket = connect(base, { auth: { token: 'garbage' }, transports: ['websocket'], reconnection: false });
    const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    expect(error.message).toBe('TOKEN_INVALID');
    socket.disconnect();
  });

  it('stops at the first failing test for a wrong answer', async () => {
    const s = await submitAndJudge(state.bob.token, state.publicProblem, 'PYTHON', WRONG_PY);
    expect(s).toMatchObject({ verdict: 'WRONG_ANSWER', passedTests: 0, failedTest: 1 });
    expect(s.results).toHaveLength(1);
  });

  it('reports compilation errors with compiler output and no test results', async () => {
    const s = await submitAndJudge(state.bob.token, state.publicProblem, 'CPP', BROKEN_CPP);
    expect(s.verdict).toBe('COMPILATION_ERROR');
    expect(s.compileOutput).toContain('error');
    expect(s.results).toHaveLength(0);
  });

  it('keeps source code private while leaving the verdict public', async () => {
    const list = await call('GET', `/submissions?username=alice`, { token: state.bob.token });
    const id = list.body.items[0].id;
    const asBob = await call('GET', `/submissions/${id}`, { token: state.bob.token });
    expect(asBob.body.submission).toMatchObject({ verdict: 'ACCEPTED', canViewSource: false, sourceCode: null, compileOutput: null });
    const asAdmin = await call('GET', `/submissions/${id}`, { token: state.admin.token });
    expect(asAdmin.body.submission.sourceCode).toBe(SUM_CPP);
  });

  it('updates problem counters, solved marks, profiles and the global leaderboard', async () => {
    const detail = await call('GET', '/problems/sum-public', { token: state.alice.token });
    expect(detail.body.problem).toMatchObject({ submissionCount: 3, acceptedCount: 1, status: 'SOLVED' });
    expect((await call('GET', '/problems/sum-public', { token: state.bob.token })).body.problem.status).toBe('ATTEMPTED');
    expect((await call('GET', '/problems?status=solved', { token: state.alice.token })).body.total).toBe(1);
    expect((await call('GET', '/problems?status=todo', { token: state.alice.token })).body.total).toBe(0);

    const profile = await call('GET', '/users/alice');
    expect(profile.body.user).toMatchObject({ solvedCount: 1, rank: 1 });
    expect(profile.body.user.stats).toMatchObject({ submissions: 1, accepted: 1 });
    expect(profile.body.user.solvedProblems.map((p: { slug: string }) => p.slug)).toEqual(['sum-public']);

    const board = await call('GET', '/leaderboard');
    expect(board.body.items[0]).toMatchObject({ rank: 1, username: 'alice', solved: 1 });
    const bob = board.body.items.find((r: { username: string }) => r.username === 'bob');
    expect(bob).toMatchObject({ rank: 2, solved: 0 });
  });

  it('filters the submission list', async () => {
    expect((await call('GET', '/submissions')).body.total).toBe(3);
    expect((await call('GET', '/submissions?verdict=ACCEPTED')).body.total).toBe(1);
    expect((await call('GET', '/submissions?language=PYTHON')).body.total).toBe(1);
    expect((await call('GET', '/submissions?mine=1', { token: state.bob.token })).body.total).toBe(2);
    expect((await call('GET', '/submissions?problem=sum-public&username=alice')).body.total).toBe(1);
  });

  it('rejudges a submission on request from an admin', async () => {
    const list = await call('GET', '/submissions?username=alice');
    const id = list.body.items[0].id;
    expect((await call('POST', `/admin/submissions/${id}/rejudge`, { token: state.alice.token })).status).toBe(403);
    const rejudge = await call('POST', `/admin/submissions/${id}/rejudge`, { token: state.admin.token });
    expect(rejudge.status).toBe(202);
    expect((await call('GET', `/submissions/${id}`, { token: state.alice.token })).body.submission).toMatchObject({ status: 'QUEUED', verdict: null });
    // While it waits, the old verdict no longer counts.
    expect((await call('GET', '/users/alice')).body.user.solvedCount).toBe(0);

    await judgeSubmission(id);
    expect((await call('GET', `/submissions/${id}`, { token: state.alice.token })).body.submission.verdict).toBe('ACCEPTED');
    expect((await call('GET', '/users/alice')).body.user.solvedCount).toBe(1);
  });
});

describe('contests', () => {
  it('lets an admin schedule a running contest and validates times', async () => {
    const now = Date.now();
    const bad = await call('POST', '/admin/contests', {
      token: state.admin.token,
      body: { slug: 'bad', title: 'Bad', startTime: new Date(now).toISOString(), endTime: new Date(now - 1000).toISOString(), problemIds: [] },
    });
    expect(bad.status).toBe(400);

    const created = await call('POST', '/admin/contests', {
      token: state.admin.token,
      body: {
        slug: state.contest.slug,
        title: 'Test Round',
        description: 'A round for the test suite.',
        // Started 30 minutes ago, so an accepted submission now carries 30 minutes of penalty.
        startTime: new Date(now - 30 * 60_000).toISOString(),
        endTime: new Date(now + 60 * 60_000).toISOString(),
        penaltyMinutes: 20,
        problemIds: [state.hiddenProblem, state.publicProblem],
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    state.contest.id = created.body.contest.id;
  });

  it('reveals an unpublished problem through a contest that has started', async () => {
    const contest = await call('GET', `/contests/${state.contest.slug}`, { token: state.alice.token });
    expect(contest.body.contest).toMatchObject({ phase: 'RUNNING', registered: false, problemCount: 2 });
    expect(contest.body.contest.problems.map((p: { label: string; slug: string }) => [p.label, p.slug])).toEqual([
      ['A', 'sum-hidden'],
      ['B', 'sum-public'],
    ]);
    expect((await call('GET', '/problems/sum-hidden', { token: state.alice.token })).status).toBe(200);
    // Still not in the public list.
    expect((await call('GET', '/problems')).body.total).toBe(1);
  });

  it('requires registration before contest submissions', async () => {
    const body = { problemId: state.hiddenProblem, language: 'PYTHON', sourceCode: SUM_PY };
    const unregistered = await call('POST', '/submissions', { token: state.alice.token, body: { ...body, contestId: state.contest.id } });
    expect(unregistered.status).toBe(403);
    // A hidden problem in a running contest cannot be submitted outside it either.
    expect((await call('POST', '/submissions', { token: state.alice.token, body })).status).toBe(403);

    expect((await call('POST', `/contests/${state.contest.slug}/register`)).status).toBe(401);
    expect((await call('POST', `/contests/${state.contest.slug}/register`, { token: state.alice.token })).status).toBe(201);
    expect((await call('POST', `/contests/${state.contest.slug}/register`, { token: state.bob.token })).status).toBe(201);
    // Registering twice is harmless.
    expect((await call('POST', `/contests/${state.contest.slug}/register`, { token: state.bob.token })).status).toBe(201);
    // Withdrawing is only possible before the start.
    expect((await call('DELETE', `/contests/${state.contest.slug}/register`, { token: state.bob.token })).status).toBe(403);
  });

  it('scores with ICPC rules: solved count first, then penalty including rejected attempts', async () => {
    const empty = await call('GET', `/contests/${state.contest.slug}/leaderboard`);
    expect(empty.body.total).toBe(2);
    expect(empty.body.items.every((r: { solved: number; rank: number }) => r.solved === 0 && r.rank === 1)).toBe(true);

    // Alice: one wrong answer, one compile error (free), then accepted on A.
    await submitAndJudge(state.alice.token, state.hiddenProblem, 'PYTHON', WRONG_PY, state.contest.id);
    await submitAndJudge(state.alice.token, state.hiddenProblem, 'CPP', BROKEN_CPP, state.contest.id);
    const accepted = await submitAndJudge(state.alice.token, state.hiddenProblem, 'PYTHON', SUM_PY, state.contest.id);
    expect(accepted).toMatchObject({ verdict: 'ACCEPTED', contestId: state.contest.id });
    // Bob: a wrong answer on B only.
    await submitAndJudge(state.bob.token, state.publicProblem, 'PYTHON', WRONG_PY, state.contest.id);

    const board = await call('GET', `/contests/${state.contest.slug}/leaderboard`, { token: state.bob.token });
    const [first, second] = board.body.items;
    expect(first).toMatchObject({ rank: 1, username: 'alice', solved: 1 });
    // 30 or 31 minutes elapsed plus one 20-minute penalty.
    expect(first.penalty).toBeGreaterThanOrEqual(50);
    expect(first.penalty).toBeLessThanOrEqual(52);
    expect(first.problems[state.hiddenProblem]).toMatchObject({ solved: true, wrongAttempts: 1 });
    expect(second).toMatchObject({ rank: 2, username: 'bob', solved: 0, penalty: 0 });
    expect(second.problems[state.publicProblem]).toMatchObject({ solved: false, wrongAttempts: 1 });
    expect(board.body.me).toMatchObject({ username: 'bob', rank: 2 });
    expect(board.body.problems.map((p: { label: string }) => p.label)).toEqual(['A', 'B']);

    const contest = await call('GET', `/contests/${state.contest.slug}`, { token: state.alice.token });
    expect(contest.body.contest.myStanding).toMatchObject({ rank: 1, solved: 1 });
    expect(contest.body.contest.problems[0]).toMatchObject({ label: 'A', solvers: 1, status: 'SOLVED' });
  });

  it('hides contest submissions of other participants while the contest runs', async () => {
    const asBob = await call('GET', `/submissions?contestId=${state.contest.id}`, { token: state.bob.token });
    expect(asBob.body.items.every((s: { user: { username: string } }) => s.user.username === 'bob')).toBe(true);
    const asGuest = await call('GET', `/submissions?contestId=${state.contest.id}`);
    expect(asGuest.body.total).toBe(0);
    const asAdmin = await call('GET', `/submissions?contestId=${state.contest.id}`, { token: state.admin.token });
    expect(asAdmin.body.total).toBe(4);
  });

  it('rebuilds a lost leaderboard from PostgreSQL', async () => {
    const before = await call('GET', `/contests/${state.contest.slug}/leaderboard`);
    // Drop every leaderboard key, as if Redis had lost them (the job queue's keys are left alone).
    const boardKeys = [...(await redis.keys('contest:*')), ...(await redis.keys('board:*'))];
    expect(boardKeys.length).toBeGreaterThan(0);
    await redis.del(...boardKeys);
    const after = await call('GET', `/contests/${state.contest.slug}/leaderboard`);
    expect(after.body.items).toEqual(before.body.items);
    expect((await call('GET', '/leaderboard')).body.items[0]).toMatchObject({ username: 'alice', rank: 1 });
  });

  it('keeps the problem set of an upcoming contest secret and blocks early submissions', async () => {
    const secret = await call('POST', '/admin/problems', { token: state.admin.token, body: problemBody('sum-secret', false) });
    const now = Date.now();
    const upcoming = await call('POST', '/admin/contests', {
      token: state.admin.token,
      body: {
        slug: 'future-round',
        title: 'Future Round',
        startTime: new Date(now + 60 * 60_000).toISOString(),
        endTime: new Date(now + 120 * 60_000).toISOString(),
        problemIds: [secret.body.problem.id],
      },
    });
    expect(upcoming.status).toBe(201);

    const view = await call('GET', '/contests/future-round', { token: state.alice.token });
    expect(view.body.contest).toMatchObject({ phase: 'UPCOMING', problems: null, problemCount: 1 });
    expect((await call('GET', '/problems/sum-secret', { token: state.alice.token })).status).toBe(404);
    expect((await call('GET', '/contests/future-round/leaderboard')).body.problems).toEqual([]);

    expect((await call('POST', '/contests/future-round/register', { token: state.alice.token })).status).toBe(201);
    const early = await call('POST', '/submissions', {
      token: state.alice.token,
      body: { problemId: secret.body.problem.id, contestId: upcoming.body.contest.id, language: 'PYTHON', sourceCode: SUM_PY },
    });
    expect(early.status).toBe(404);
    // Before the start a participant may still withdraw.
    expect((await call('DELETE', '/contests/future-round/register', { token: state.alice.token })).status).toBe(200);

    const phases = await call('GET', '/contests');
    expect(phases.body.items.map((c: { slug: string; phase: string }) => [c.slug, c.phase])).toEqual([
      ['future-round', 'UPCOMING'],
      ['test-round', 'RUNNING'],
    ]);
  });
});

describe('admin dashboard', () => {
  it('reports totals, verdict counts and queue depth', async () => {
    const stats = await call('GET', '/admin/stats', { token: state.admin.token });
    expect(stats.status).toBe(200);
    expect(stats.body.totals).toMatchObject({ users: 3, problems: 3, publicProblems: 1, contests: 2, submissions: 7 });
    expect(stats.body.verdicts).toMatchObject({ ACCEPTED: 2, WRONG_ANSWER: 3, COMPILATION_ERROR: 2 });
    expect(stats.body.queue.waiting).toBeGreaterThan(0);
  });

  it('changes roles but never lets an admin demote themselves', async () => {
    const users = await call('GET', '/admin/users?search=bob', { token: state.admin.token });
    expect(users.body.items).toHaveLength(1);
    const promote = await call('PATCH', `/admin/users/${state.bob.id}/role`, { token: state.admin.token, body: { role: 'ADMIN' } });
    expect(promote.body.user.role).toBe('ADMIN');
    await call('PATCH', `/admin/users/${state.bob.id}/role`, { token: state.admin.token, body: { role: 'USER' } });

    const root = await prisma.user.findUniqueOrThrow({ where: { username: 'root' } });
    const self = await call('PATCH', `/admin/users/${root.id}/role`, { token: state.admin.token, body: { role: 'USER' } });
    expect(self.status).toBe(400);
  });
});
