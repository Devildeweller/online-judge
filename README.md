# CodeJudge — Online Judge Platform

A competitive programming platform: browse problems, write code in the browser, submit it, and watch the verdict arrive in real time. It runs timed contests with ICPC scoring and live leaderboards, and judges untrusted code in disposable Docker containers.

- **Problems** with Markdown + LaTeX statements, samples, tags, difficulty and per-problem limits
- **Four languages**: C++20, Python 3, Java 21, JavaScript (Node.js)
- **Asynchronous judging**: submissions go onto a Redis-backed queue and are judged by separate worker processes
- **Docker sandbox**: no network, read-only filesystem, dropped capabilities, unprivileged user, CPU / memory / process limits
- **Real-time tracking**: queue → compiling → running test *k* of *n* → verdict, pushed over WebSocket
- **Contests**: registration, hidden problem sets until the start, ICPC scoring with penalties, live leaderboard
- **Leaderboards** served from Redis sorted sets and rebuilt from PostgreSQL when needed
- **Admin panel**: problem and test-case management, contest scheduling, rejudging, queue dashboard, user roles

## Tech stack

| Layer | Technology |
| --- | --- |
| API | Node.js, TypeScript, Express 5, Zod |
| Database | PostgreSQL 17 with Prisma ORM (migrations in `server/prisma/migrations`) |
| Cache, queue, pub/sub | Redis 7: BullMQ job queue, sorted-set leaderboards, refresh-token sessions, rate limiting, pub/sub for live events |
| Judge | BullMQ workers driving the Docker CLI; sandbox image built from `docker/sandbox` |
| Real-time | Socket.IO |
| Frontend | React 19, Vite, TanStack Query, React Router, CodeMirror 6, KaTeX |
| Tests | Vitest (unit + integration), a 500-submission stress script |

## Architecture

```
 Browser (React)
    │  REST /api                      WebSocket /socket.io
    ▼                                        ▲
 ┌──────────────────────────────┐            │ relays events to rooms
 │  API  (Express + Socket.IO)  │────────────┘
 └───────┬───────────────┬──────┘
         │               │ enqueue job              ┌───────────────────────────┐
         ▼               ▼                          │  Judge worker(s)          │
   PostgreSQL          Redis  ── BullMQ queue ────▶ │  compile → run tests →    │
   users, problems,    queue, leaderboards,         │  check output → verdict   │
   tests, contests,    sessions, rate limits ◀───── │  publish progress events  │
   submissions         pub/sub events               └────────────┬──────────────┘
         ▲                                                       │ docker run / exec
         └────────────── results, counters ──────────────────────┤
                                                                 ▼
                                                  one throwaway container per submission
                                                  (no network, read-only, unprivileged)
```

The API never runs user code. It stores the submission, puts a job on the queue and returns immediately. Any number of workers can consume the queue; they have no sockets of their own, so they publish progress on a Redis channel and every API instance relays it to the right Socket.IO rooms.

## Quick start (development)

**Prerequisites:** Node.js 22 or newer and Docker (Docker Desktop on Windows/macOS). PostgreSQL and Redis run in containers, nothing else needs installing.

```bash
npm install
cp server/.env.example server/.env      # Windows PowerShell: Copy-Item server/.env.example server/.env
npm run setup                           # starts Postgres + Redis, builds the sandbox image, migrates, seeds
npm run dev                             # API :4000, judge worker, web app :5173
```

Open <http://localhost:5173>.

`npm run setup` is the same as running these one by one:

```bash
npm run infra:up        # docker compose up -d postgres redis
npm run sandbox:build   # docker build -t oj-sandbox:latest docker/sandbox   (about 1.1 GB, a few minutes the first time)
npm run db:generate     # generate the Prisma client
npm run db:migrate      # apply migrations
npm run db:seed         # demo data
```

### Seeded accounts

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin12345` (from `ADMIN_PASSWORD`) | Administrator |
| `alice`, `bob`, `carol` | `password123` | Users, registered in the running contest |

The seed also creates **15 problems with 189 test cases** (generated deterministically, expected outputs computed by reference solutions) and three contests: one finished, one running for three days, and one upcoming whose problem set is hidden until it starts. Re-running the seed leaves existing problems alone; `npm run db:seed -w server -- --force` rewrites them.

### Run everything in containers

```bash
docker compose --profile app up --build
```

This builds the API/worker image, the sandbox image and an nginx image serving the built frontend, applies migrations, seeds, and serves the whole platform at <http://localhost:8080>. Set `JWT_SECRET` and `ADMIN_PASSWORD` in the environment for anything beyond a local demo.

## How judging works

1. `POST /api/submissions` validates the request (rate limit, problem visibility, contest rules), inserts the submission as `QUEUED` and adds a job to the BullMQ queue. Contest submissions get a higher priority than practice ones; rejudges go last.
2. A worker picks up the job and starts **one container** for the submission from the `oj-sandbox` image.
3. The source is streamed into the container and compiled (or syntax-checked for Python and JavaScript). A failure ends the run with `COMPILATION_ERROR` and the compiler output.
4. Test cases run one at a time in the same container, input on stdin. After each test the worker publishes a progress event. Judging **stops at the first failing test**.
5. The verdict, per-test time and memory are written in one transaction. Problem counters, the user's solved count, the global leaderboard and the contest standing are then recomputed from the database, which makes the whole step safe to repeat.
6. If the infrastructure fails (Docker unavailable, a container that stops responding), the job is retried up to three times with exponential backoff. Only then is the submission marked `INTERNAL_ERROR`; it is never left stuck and the user's code is never blamed.

Jobs live in Redis with append-only persistence. If a worker or the whole machine goes down mid-run, queued jobs are still there afterwards and jobs that were in progress are detected as stalled and judged again.

### The sandbox

Every submission gets its own container, created with:

| Measure | Effect |
| --- | --- |
| `--network none` | No network interfaces other than loopback |
| `--read-only` + tmpfs work directory | Nothing persists; the image cannot be modified |
| `--cap-drop ALL` (+ `SETUID`, `SETGID`, `KILL` for the supervisor only) and `no-new-privileges` | User code runs with an empty capability set and cannot gain privileges |
| Unprivileged uid 10001 | Code never runs as root, even inside the container |
| `--memory`, `--memory-swap`, `--cpus 1`, `--pids-limit 128` | Memory, CPU and fork bombs are contained by cgroups |
| `--ulimit core=1`, `nofile=256` | Crashes do not stall on core dumps; file descriptors are capped |
| No bind mounts | Source and input travel over stdin, so no host path is ever shared |
| Bounded lifetime | The container's main process is `sleep N`; a forgotten container removes itself |

Inside the container a small root-owned supervisor, [`docker/sandbox/oj-run`](docker/sandbox/oj-run), drops to the unprivileged user, enforces the wall-clock limit, reaps any processes the program left behind and reports CPU time, peak memory and whether the kernel OOM killer fired. Its bookkeeping lives in a directory user code cannot read or write, and only the last report line is trusted, so a program cannot forge its own measurements.

### Verdicts and limits

| Verdict | Meaning |
| --- | --- |
| Accepted | Every test passed |
| Wrong Answer | Output differs (checker: lines, tokens, or floating point with 1e-6 tolerance) |
| Time Limit Exceeded | CPU time over the limit, or the wall-clock limit (2× CPU limit + 2 s) was hit |
| Memory Limit Exceeded | Peak memory over the limit, an OOM kill, or the runtime's own out-of-memory failure |
| Output Limit Exceeded | More than 16 MB written to stdout |
| Runtime Error | Non-zero exit code or fatal signal |
| Compilation Error | The compile step failed; never penalised in contests |
| Judge Error | Infrastructure failure after three attempts |

A problem's time limit is the limit for C++. Slower runtimes are scaled:

| Language | Toolchain | Time factor | Memory allowance on top of the limit |
| --- | --- | --- | --- |
| C++20 | GCC 14, `-O2` | ×1 | none |
| Python 3 | CPython 3.13 | ×3 | 16 MB |
| Java 21 | OpenJDK 21, `-Xmx<limit>` | ×2 | 192 MB (JVM overhead) |
| JavaScript | Node.js 20, `--max-old-space-size=<limit>` | ×2 | 96 MB |

## Contests and leaderboards

- A contest has a start, an end and an ordered problem set (labelled A, B, C…). Problems can stay unpublished and are revealed through the contest once it starts.
- Users must register before their submissions count. Late registration is allowed while the contest runs; withdrawing is possible only before the start.
- **ICPC scoring:** more problems solved ranks higher; ties are broken by lower penalty. A solved problem costs the minutes from the start to its accepted submission plus 20 minutes (configurable) per rejected attempt before it. Compilation errors and unsolved problems cost nothing.
- While a contest is running, other participants' submissions are not visible.
- Each contest's standings are a Redis sorted set (`score = solved × 10⁹ − penalty`) plus a hash with the per-problem cells. Entries are always recomputed from the submissions table, so a flushed Redis rebuilds itself on the next read. The global leaderboard ranks users by distinct problems solved in the same way.

## Real-time updates

The browser keeps one Socket.IO connection, authenticated with the access token.

| Event | Sent to | Payload |
| --- | --- | --- |
| `submission:update` | The submitting user | Status, verdict, tests passed, time, memory |
| `run:result` | The user who pressed Run | Output of a custom-input run |
| `leaderboard:update` | Everyone viewing that contest | Signal to refetch standings |

Lists also poll lightly while something is pending, so the UI stays correct if the socket drops.

## API overview

All routes are under `/api`. Errors have the shape `{ "error": { "code", "message", "details" } }`.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Problems | `GET /problems` (search, difficulty, tag, progress filters), `GET /problems/tags`, `GET /problems/:slug` |
| Submissions | `POST /submissions`, `GET /submissions` (filters, pagination), `GET /submissions/:id` |
| Run | `POST /run` (custom input, not stored), `GET /run/:runId` |
| Contests | `GET /contests`, `GET /contests/:slug`, `POST`/`DELETE /contests/:slug/register`, `GET /contests/:slug/leaderboard` |
| Users | `GET /users/:username`, `PATCH /users/me`, `GET /leaderboard` |
| Admin | `/admin/stats`, `/admin/problems` (CRUD + test cases + rejudge), `/admin/contests` (CRUD + rebuild leaderboard), `/admin/submissions/:id/rejudge`, `/admin/users` |
| Misc | `GET /health`, `GET /meta` |

**Authentication:** a short-lived JWT access token (15 minutes, kept in memory by the SPA) plus an opaque refresh token in an `httpOnly`, `SameSite=Lax` cookie. Only the hash of the refresh token is stored, in Redis, and it is rotated on every use. Passwords are hashed with scrypt.

**Rate limits** (Redis counters): 12 submissions and 20 runs per user per minute, 20 logins and 10 registrations per IP per minute. All configurable.

## Testing

```bash
npm test                    # 70 unit tests: checkers, verdict classification, ICPC scoring, hashing, seed data
npm run test:integration    # 60 integration tests: needs Postgres, Redis, Docker and the sandbox image
npm run stress              # 500 submissions through the real API and workers
```

The integration tests use their own database (`online_judge_test`), Redis database and queue name, so they can run next to a live development stack.

- `tests/integration/sandbox.test.ts` drives the real sandbox: all four toolchains, every failure verdict, and the isolation guarantees (no network, unprivileged user, read-only filesystem, fork bomb containment, forged reports ignored).
- `tests/integration/platform.test.ts` goes through the HTTP API end to end: accounts and token rotation, problem management, judging with live socket events, contest rules and scoring, leaderboard rebuild, admin permissions.

### Stress test

`npm run stress` creates its own accounts, submits a fixed mix of correct solutions and deliberately broken ones (wrong answer, compile error, crash, infinite loop, memory hog) in all four languages, waits for the workers, and checks every verdict against what the program was written to produce.

A measured run on a 12-core Windows laptop with Docker Desktop (WSL2 backend, 6 GB) and one worker process at `WORKER_CONCURRENCY=4`:

```
Language                  AC    WA    CE    RE   TLE   MLE   Total
C++20 (GCC)              102    17    10     8     5     8     150
Python 3                  62    12     6     8     4     8     100
Java 21 (OpenJDK)         96    13    13    10    13     5     150
JavaScript (Node.js)      60     8    11     9     3     9     100

Submissions judged      500
Languages               4
Problems                5 (75 distinct test cases)
Test case executions    4949
Total time              674.6 s
Throughput              0.74 submissions/s
Verdicts as expected    500 / 500
```

All 500 submissions are queued within about three seconds, so most of each submission's turnaround in this test is time spent waiting in the queue (median 320 s); a single submission on an idle system is judged in a few seconds. Throughput is bounded by container start-up and per-test `docker exec` overhead, which is noticeably higher on Docker Desktop than on native Linux, and it scales with the number of workers. The worker was restarted once during this run; the jobs it was holding were recovered by the queue and judged again.

Other modes: `npm run stress -- --count 200`, `--verify` (re-check an earlier run), `--cleanup` (delete the stress accounts and their submissions).

## Project structure

```
├── docker-compose.yml          Postgres, Redis and (profile "app") the full stack
├── docker/sandbox/             Sandbox image: toolchains + the oj-run supervisor
├── server/
│   ├── prisma/                 Schema and SQL migrations
│   ├── src/
│   │   ├── api/                Express app and HTTP entry point
│   │   ├── worker/             Judge worker entry point
│   │   ├── judge/              Languages, sandbox, checkers, verdict classification, pipeline
│   │   ├── queue/              BullMQ queue and the Redis event channel
│   │   ├── realtime/           Socket.IO server
│   │   ├── modules/            auth, problems, submissions, run, contests, leaderboard, users, admin
│   │   ├── middleware/         Authentication, rate limiting, error handling
│   │   ├── lib/                Prisma, Redis, tokens, password hashing, validation, logging
│   │   └── seed/               Demo problems (statements, generators, reference solutions) and contests
│   ├── scripts/stress.ts       Load test
│   └── tests/                  unit/ and integration/
└── web/
    └── src/                    pages/, components/, lib/ (API client, socket, formatting), auth/
```

## Configuration

Settings are read from `server/.env` (see [`server/.env.example`](server/.env.example)).

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | local Compose Postgres | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | (required, ≥ 32 chars) | Signs access tokens |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s), comma separated |
| `WORKER_CONCURRENCY` | `2` | Submissions judged in parallel by one worker process |
| `SANDBOX_IMAGE` | `oj-sandbox:latest` | Image used for sandbox containers |
| `DOCKER_BIN` | `docker` | Docker CLI; set a full path if it is not on `PATH` |
| `SUBMIT_RATE_LIMIT` / `RUN_RATE_LIMIT` | `12` / `20` | Per user, per minute |

To judge more in parallel, raise `WORKER_CONCURRENCY` or start more worker processes; they all consume the same queue.

## Security notes and limits

- The worker controls the Docker daemon (directly in development, through the mounted socket in the Compose stack). That is root-equivalent access to the host, so run workers on machines dedicated to judging.
- Containers share the host kernel. The measures above are solid defence in depth for a trusted-ish audience; a public deployment should add a stronger boundary such as gVisor (`--runtime=runsc`) or Firecracker microVMs, which can be set per container without changing the pipeline.
- CPU time is measured with 10 ms resolution, and timings vary with host load. Limits should leave headroom.
- The default `JWT_SECRET`, database password and admin password are for local development only.

## Troubleshooting

- **Submissions stay "In queue":** no worker is running or Docker is down. Check the worker's log; the admin dashboard shows the queue depth.
- **Worker exits with "Sandbox image is missing":** run `npm run sandbox:build`.
- **"Docker CLI was not found":** make sure `docker` is on `PATH`, or set `DOCKER_BIN` in `server/.env` to the full path of the Docker executable.
- **Port already in use:** PostgreSQL 5432, Redis 6379, API 4000 and web 5173 must be free; the ports are set in `docker-compose.yml`, `server/.env` and `web/vite.config.ts`.
- **Slow `npm install` on Windows:** keep the project outside a cloud-synced folder such as OneDrive, which tries to sync `node_modules`.
