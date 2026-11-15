import { spawn } from 'node:child_process';
import { env } from '../config/env.js';

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

export interface DockerResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  /** The docker CLI did not finish within timeoutMs and was killed. */
  timedOut: boolean;
  /** stdout grew past maxStdoutBytes; collection stopped and the CLI was killed. */
  stdoutOverflow: boolean;
}

export interface DockerOptions {
  input?: string | Buffer;
  timeoutMs: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

/** Runs the docker CLI without a shell, so arguments are never interpreted. */
export function docker(args: string[], options: DockerOptions): Promise<DockerResult> {
  const maxStdout = options.maxStdoutBytes ?? 1024 * 1024;
  const maxStderr = options.maxStderrBytes ?? 256 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(env.DOCKER_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let stdoutOverflow = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutOverflow) return;
      outBytes += chunk.length;
      if (outBytes > maxStdout) {
        stdoutOverflow = true;
        child.kill('SIGKILL');
        return;
      }
      out.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (errBytes >= maxStderr) return;
      errBytes += chunk.length;
      err.push(chunk);
    });

    child.on('error', (cause: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new SandboxError(
          cause.code === 'ENOENT'
            ? `Docker CLI "${env.DOCKER_BIN}" was not found. Is Docker installed and on PATH?`
            : `Failed to start docker: ${cause.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8'), timedOut, stdoutOverflow });
    });

    // The program may exit without reading its input; a broken pipe here is not an error.
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input ?? '');
  });
}

/** Throws a SandboxError with a clear message when the daemon or the sandbox image is unavailable. */
export async function assertSandboxAvailable(): Promise<void> {
  const daemon = await docker(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 20_000 });
  if (daemon.code !== 0) {
    throw new SandboxError(`Docker daemon is not reachable: ${daemon.stderr.trim() || 'unknown error'}`);
  }
  const image = await docker(['image', 'inspect', '--format', '{{.Id}}', env.SANDBOX_IMAGE], { timeoutMs: 20_000 });
  if (image.code !== 0) {
    throw new SandboxError(`Sandbox image "${env.SANDBOX_IMAGE}" is missing. Build it with: npm run sandbox:build`);
  }
}
