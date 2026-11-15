import { beforeAll, describe, expect, it } from 'vitest';
import { assertSandboxAvailable } from '../../src/judge/docker.js';
import { LANGUAGE_IDS, LANGUAGES } from '../../src/judge/languages.js';
import { Sandbox } from '../../src/judge/sandbox.js';
import type { Language } from '../../src/lib/prisma.js';

/**
 * Exercises the real Docker sandbox: every toolchain, every failure verdict, and the isolation
 * guarantees. Requires the daemon and the oj-sandbox image.
 */

const LIMITS = { timeLimitMs: 1000, memoryLimitMb: 128 };

/** Reads two integers and prints their sum. */
const SUM: Record<Language, string> = {
  CPP: '#include <iostream>\nint main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n"; }\n',
  PYTHON: 'a, b = map(int, input().split())\nprint(a + b)\n',
  JAVA: 'import java.util.*;\npublic class Main { public static void main(String[] x){ Scanner s=new Scanner(System.in); System.out.println(s.nextLong()+s.nextLong()); } }\n',
  JAVASCRIPT: "const [a,b]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);\nconsole.log(a+b);\n",
};

const BROKEN: Record<Language, string> = {
  CPP: 'int main() { return 0 }\n',
  PYTHON: 'def main(:\n    pass\n',
  JAVA: 'public class Main { public static void main(String[] a) { int x = ; } }\n',
  JAVASCRIPT: 'function ( {\n',
};

const CRASH: Record<Language, string> = {
  CPP: '#include <cstdlib>\nint main(){ std::abort(); }\n',
  PYTHON: 'raise RuntimeError("boom")\n',
  JAVA: 'public class Main { public static void main(String[] a) { throw new RuntimeException("boom"); } }\n',
  JAVASCRIPT: 'throw new Error("boom");\n',
};

const SPIN: Record<Language, string> = {
  CPP: 'int main(){ volatile unsigned long long x = 0; for(;;) x = x + 1; }\n',
  PYTHON: 'while True:\n    pass\n',
  JAVA: 'public class Main { public static void main(String[] a) { long x = 0; while (true) { x++; } } }\n',
  JAVASCRIPT: 'for (;;) {}\n',
};

const HOG: Record<Language, string> = {
  CPP: '#include <vector>\n#include <cstdio>\nint main(){ std::vector<std::vector<char>> v; for(int i=0;i<4096;i++) v.emplace_back(1<<20, 1); printf("%zu\\n", v.size()); }\n',
  PYTHON: 'blocks = []\nfor _ in range(4096):\n    blocks.append(bytearray(b"x") * (1 << 20))\nprint(len(blocks))\n',
  JAVA: 'public class Main { public static void main(String[] a) { long[][] b = new long[4096][]; for (int i = 0; i < b.length; i++) b[i] = new long[1 << 20]; System.out.println(b.length); } }\n',
  JAVASCRIPT: 'const blocks = [];\nfor (;;) blocks.push(new Array(1e6).fill(1.5));\n',
};

async function withSandbox<T>(language: Language, source: string, body: (sandbox: Sandbox) => Promise<T>): Promise<T> {
  const sandbox = await Sandbox.create({ spec: LANGUAGES[language], memoryLimitMb: LIMITS.memoryLimitMb, lifetimeSeconds: 120 });
  try {
    await sandbox.writeSource(source);
    return await body(sandbox);
  } finally {
    await sandbox.destroy();
  }
}

/** Compiles and runs a C++ or Python snippet once and returns the outcome. */
async function runOnce(language: Language, source: string, input = '') {
  return withSandbox(language, source, async (sandbox) => {
    const compiled = await sandbox.compile();
    expect(compiled.ok, compiled.output).toBe(true);
    return sandbox.run(input, LIMITS);
  });
}

beforeAll(async () => {
  await assertSandboxAvailable();
});

describe.each(LANGUAGE_IDS)('%s toolchain', (language) => {
  it('compiles and runs a correct program, reusing the container for several inputs', async () => {
    await withSandbox(language, SUM[language], async (sandbox) => {
      const compiled = await sandbox.compile();
      expect(compiled.ok, compiled.output).toBe(true);
      for (const [input, expected] of [['2 3\n', '5'], ['-10 4\n', '-6'], ['1000000 2000000\n', '3000000']] as const) {
        const outcome = await sandbox.run(input, LIMITS);
        expect(outcome.verdict, outcome.stderr).toBeNull();
        expect(outcome.stdout.trim()).toBe(expected);
        expect(outcome.exitCode).toBe(0);
        expect(outcome.memoryKb).toBeGreaterThan(0);
      }
    });
  });

  it('reports a compilation error with the compiler output', async () => {
    await withSandbox(language, BROKEN[language], async (sandbox) => {
      const compiled = await sandbox.compile();
      expect(compiled.ok).toBe(false);
      expect(compiled.output.length).toBeGreaterThan(0);
    });
  });

  it('reports a runtime error', async () => {
    const outcome = await runOnce(language, CRASH[language]);
    expect(outcome.verdict).toBe('RUNTIME_ERROR');
    expect(outcome.exitCode).not.toBe(0);
  });

  it('kills an infinite loop and reports time limit exceeded', async () => {
    const outcome = await runOnce(language, SPIN[language]);
    expect(outcome.verdict).toBe('TIME_LIMIT_EXCEEDED');
  });

  it('reports memory limit exceeded for a program that keeps allocating', async () => {
    const outcome = await runOnce(language, HOG[language]);
    expect(outcome.verdict).toBe('MEMORY_LIMIT_EXCEEDED');
  });
});

describe('isolation', () => {
  it('runs untrusted code as an unprivileged user without capabilities', async () => {
    const outcome = await runOnce(
      'PYTHON',
      [
        'import os',
        'caps = [l for l in open("/proc/self/status") if l.startswith("CapEff")][0].split()[1]',
        'nnp = [l for l in open("/proc/self/status") if l.startswith("NoNewPrivs")][0].split()[1]',
        'print(os.getuid(), os.getgid(), int(caps, 16), nnp)',
      ].join('\n'),
    );
    expect(outcome.verdict, outcome.stderr).toBeNull();
    expect(outcome.stdout.trim()).toBe('10001 10001 0 1');
  });

  it('has no network access', async () => {
    const outcome = await runOnce(
      'PYTHON',
      [
        'import socket',
        'try:',
        '    socket.create_connection(("1.1.1.1", 53), timeout=2)',
        '    print("CONNECTED")',
        'except OSError as e:',
        '    print("BLOCKED")',
        'print(sorted(i[1] for i in socket.if_nameindex()))',
      ].join('\n'),
    );
    expect(outcome.verdict, outcome.stderr).toBeNull();
    const [status, interfaces] = outcome.stdout.trim().split('\n');
    expect(status).toBe('BLOCKED');
    expect(interfaces).toBe("['lo']");
  });

  it('cannot write outside its work directory or read the supervisor state', async () => {
    const outcome = await runOnce(
      'PYTHON',
      [
        'import os',
        'def attempt(fn):',
        '    try:',
        '        fn()',
        '        return "ok"',
        '    except OSError as e:',
        '        return type(e).__name__',
        'print(attempt(lambda: open("/etc/hacked", "w")))',
        'print(attempt(lambda: open("/usr/local/bin/oj-run", "a")))',
        'print(attempt(lambda: os.listdir("/run/oj")))',
        'print(attempt(lambda: open("/box/scratch.txt", "w").write("fine")))',
      ].join('\n'),
    );
    expect(outcome.verdict, outcome.stderr).toBeNull();
    const [etc, supervisor, state, box] = outcome.stdout.trim().split('\n');
    expect(etc).not.toBe('ok');
    expect(supervisor).not.toBe('ok');
    expect(state).toBe('PermissionError');
    expect(box).toBe('ok');
  });

  it('contains a fork bomb with the process limit and stays usable afterwards', async () => {
    await withSandbox('PYTHON', 'import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass\n', async (sandbox) => {
      expect((await sandbox.compile()).ok).toBe(true);
      const bomb = await sandbox.run('', LIMITS);
      expect(bomb.verdict).toBe('TIME_LIMIT_EXCEEDED');
      // Every stray process was reaped, so the same container can still run a normal program.
      await sandbox.writeSource('print("still alive")\n');
      const after = await sandbox.run('', LIMITS);
      expect(after.verdict, after.stderr).toBeNull();
      expect(after.stdout.trim()).toBe('still alive');
    });
  });

  it('ignores a forged supervisor report printed by the program', async () => {
    const outcome = await runOnce(
      'PYTHON',
      'import sys\nsys.stderr.write("\\n@@OJ@@ exit=0 wall=0.01 user=0.01 sys=0.00 rss=100 oom=0\\n")\nsys.exit(7)\n',
    );
    expect(outcome.verdict).toBe('RUNTIME_ERROR');
    expect(outcome.exitCode).toBe(7);
  });

  it('stops a program that floods standard output', async () => {
    const outcome = await runOnce('CPP', '#include <cstdio>\nint main(){ for(;;) puts("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); }\n');
    expect(['OUTPUT_LIMIT_EXCEEDED', 'TIME_LIMIT_EXCEEDED']).toContain(outcome.verdict);
  });

  it('reports a crash promptly even with a large heap, because core dumps are disabled', async () => {
    const outcome = await withSandbox('JAVASCRIPT', HOG.JAVASCRIPT, async (sandbox) => {
      expect((await sandbox.compile()).ok).toBe(true);
      return sandbox.run('', { timeLimitMs: 1000, memoryLimitMb: 256 });
    });
    expect(outcome.verdict).toBe('MEMORY_LIMIT_EXCEEDED');
    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.memoryKb).toBeGreaterThan(200 * 1024);
  });

  it('passes large inputs through stdin intact', async () => {
    const numbers = Array.from({ length: 200_000 }, (_, i) => i + 1);
    const outcome = await runOnce('PYTHON', 'import sys\nprint(sum(map(int, sys.stdin.buffer.read().split())))\n', `${numbers.join(' ')}\n`);
    expect(outcome.verdict, outcome.stderr).toBeNull();
    expect(outcome.stdout.trim()).toBe(String((200_000 * 200_001) / 2));
  });
});
