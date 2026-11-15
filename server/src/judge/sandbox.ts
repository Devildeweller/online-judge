import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import type { Verdict } from '../lib/prisma.js';
import { docker, SandboxError } from './docker.js';
import { effectiveMemoryLimitKb, effectiveTimeLimitMs, type LanguageSpec } from './languages.js';
import { classifyRun, describeExit, parseMeta, truncate, type EffectiveLimits } from './outcome.js';

/** Unprivileged uid/gid that untrusted code runs as (created in docker/sandbox/Dockerfile). */
const SANDBOX_UID = '10001:10001';
const BOX_DIR = '/box';

const COMPILE_WALL_SECONDS = 30;
const COMPILE_MIN_MEMORY_MB = 768;
const MEMORY_SLACK_MB = 32;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const MAX_COMPILE_OUTPUT_CHARS = 16 * 1024;
/** Extra time on top of the in-container wall limit before the docker CLI itself is given up on. */
const CLI_GRACE_MS = 15_000;

export interface CompileOutcome {
  ok: boolean;
  output: string;
}

export interface RunLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface RunOutcome {
  /** null means the program finished within limits; its stdout still has to be checked. */
  verdict: Verdict | null;
  stdout: string;
  stderr: string;
  timeMs: number;
  memoryKb: number;
  exitCode: number;
  detail?: string;
}

export interface SandboxOptions {
  spec: LanguageSpec;
  memoryLimitMb: number;
  /** Upper bound on how long the container may live, as a safety net if the worker dies. */
  lifetimeSeconds: number;
}

/**
 * One disposable container per submission. Untrusted code never touches the host:
 *  - no network, read-only root filesystem, all capabilities dropped except those the
 *    supervisor needs to drop privileges (SETUID/SETGID) and reap strays (KILL)
 *  - code runs as an unprivileged uid with no-new-privileges, under memory, CPU and pid limits
 *  - sources and inputs arrive over stdin and live on tmpfs, so nothing is mounted from the host
 */
export class Sandbox {
  private destroyed = false;

  private constructor(
    private readonly name: string,
    private readonly spec: LanguageSpec,
  ) {}

  static async create(options: SandboxOptions): Promise<Sandbox> {
    const { spec, memoryLimitMb, lifetimeSeconds } = options;
    const name = `oj-${randomUUID()}`;
    const memoryMb = Math.max(memoryLimitMb + spec.memoryOverheadMb + MEMORY_SLACK_MB, COMPILE_MIN_MEMORY_MB);

    const result = await docker(
      [
        'run', '--detach', '--rm', '--init',
        '--name', name,
        '--label', 'oj.sandbox=1',
        '--network', 'none',
        '--memory', `${memoryMb}m`,
        '--memory-swap', `${memoryMb}m`,
        '--cpus', '1',
        '--pids-limit', '128',
        '--read-only',
        '--tmpfs', `${BOX_DIR}:rw,exec,nosuid,nodev,size=128m,uid=10001,gid=10001,mode=0755`,
        '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=64m,mode=1777',
        '--tmpfs', '/run/oj:rw,noexec,nosuid,nodev,size=8m,mode=0700',
        '--cap-drop', 'ALL',
        '--cap-add', 'SETUID',
        '--cap-add', 'SETGID',
        '--cap-add', 'KILL',
        '--security-opt', 'no-new-privileges',
        '--ulimit', 'nofile=256:256',
        // 1, not 0: when the host pipes core dumps to a handler (WSL2, systemd-coredump) a limit of 0 is
        // ignored and every crash stalls while its memory is dumped. 1 is the kernel's value for 'skip'.
        '--ulimit', 'core=1:1',
        '--ulimit', 'stack=268435456:268435456',
        '--workdir', BOX_DIR,
        env.SANDBOX_IMAGE,
        'sleep', String(lifetimeSeconds),
      ],
      { timeoutMs: 60_000 },
    );

    if (result.timedOut || result.code !== 0) {
      await docker(['rm', '--force', name], { timeoutMs: 30_000 }).catch(() => undefined);
      throw new SandboxError(`Could not start sandbox container: ${result.stderr.trim() || 'docker run timed out'}`);
    }
    return new Sandbox(name, spec);
  }

  /** Streams the source into the tmpfs work directory as the sandbox user. */
  async writeSource(sourceCode: string): Promise<void> {
    const result = await docker(
      ['exec', '--interactive', '--user', SANDBOX_UID, '--workdir', BOX_DIR, this.name, 'sh', '-c', 'cat > "$1"', 'sh', this.spec.sourceFile],
      { input: sourceCode, timeoutMs: 30_000 },
    );
    if (result.timedOut || result.code !== 0) {
      throw new SandboxError(`Could not write source into sandbox: ${result.stderr.trim() || 'timed out'}`);
    }
  }

  async compile(): Promise<CompileOutcome> {
    const result = await this.supervise(this.spec.compile, COMPILE_WALL_SECONDS, '', MAX_COMPILE_OUTPUT_CHARS * 2);
    if (result.timedOut) throw new SandboxError('The sandbox stopped responding while compiling');

    const parsed = parseMeta(result.stderr);
    if (!parsed) throw new SandboxError(`Compiler produced no supervisor report: ${truncate(result.stderr, 500)}`);

    const output = truncate([parsed.stderr, result.stdout.toString('utf8')].filter(Boolean).join('\n').trim(), MAX_COMPILE_OUTPUT_CHARS);
    if (parsed.meta.wallMs >= COMPILE_WALL_SECONDS * 1000 - 20) {
      return { ok: false, output: `Compilation timed out after ${COMPILE_WALL_SECONDS} seconds.\n${output}`.trim() };
    }
    if (parsed.meta.oomKilled) return { ok: false, output: `Compiler ran out of memory.\n${output}`.trim() };
    return { ok: parsed.meta.exitCode === 0, output };
  }

  async run(input: string, limits: RunLimits): Promise<RunOutcome> {
    const effective: EffectiveLimits = {
      cpuMs: effectiveTimeLimitMs(this.spec, limits.timeLimitMs),
      wallMs: 0,
      memoryKb: effectiveMemoryLimitKb(this.spec, limits.memoryLimitMb),
    };
    // Wall clock is more generous than CPU time so I/O-bound or briefly descheduled programs are not punished.
    const wallSeconds = Math.ceil((effective.cpuMs * 2 + 2000) / 100) / 10;
    effective.wallMs = Math.round(wallSeconds * 1000);

    const result = await this.supervise(this.spec.run(limits.memoryLimitMb), wallSeconds, input, MAX_STDERR_BYTES);
    const base = { stdout: '', stderr: '', timeMs: effective.cpuMs, memoryKb: 0, exitCode: -1 };

    if (result.stdoutOverflow) {
      return { ...base, timeMs: 0, verdict: 'OUTPUT_LIMIT_EXCEEDED', detail: `Output exceeded ${MAX_OUTPUT_BYTES / (1024 * 1024)} MB` };
    }
    // The supervisor enforces the wall limit inside the container and always reports back. If the docker
    // CLI itself hangs past that, the fault is in the infrastructure, so the job is retried, not blamed on the code.
    if (result.timedOut) throw new SandboxError('The sandbox stopped responding while running a test');

    const parsed = parseMeta(result.stderr);
    if (!parsed) throw new SandboxError(`Run produced no supervisor report: ${truncate(result.stderr, 500)}`);

    const { meta, stderr } = parsed;
    const verdict = classifyRun(meta, effective, stderr);
    return {
      verdict,
      stdout: result.stdout.toString('utf8'),
      stderr,
      // A run stopped at the wall limit may have slept rather than burned CPU; never show it as faster than the limit.
      timeMs: verdict === 'TIME_LIMIT_EXCEEDED' ? Math.max(meta.cpuMs, effective.cpuMs) : meta.cpuMs,
      memoryKb: meta.rssKb,
      exitCode: meta.exitCode,
      detail: verdict === 'RUNTIME_ERROR' ? describeExit(meta.exitCode) : undefined,
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    await docker(['rm', '--force', this.name], { timeoutMs: 30_000 }).catch(() => undefined);
  }

  /** Runs a command under the in-container supervisor, which enforces the wall limit and reports usage. */
  private supervise(command: string[], wallSeconds: number, input: string, stderrBytes: number) {
    return docker(
      ['exec', '--interactive', '--workdir', BOX_DIR, this.name, 'oj-run', String(wallSeconds), String(stderrBytes), ...command],
      {
        input,
        timeoutMs: Math.round(wallSeconds * 1000) + CLI_GRACE_MS,
        maxStdoutBytes: MAX_OUTPUT_BYTES,
        maxStderrBytes: stderrBytes + 4096,
      },
    );
  }
}
