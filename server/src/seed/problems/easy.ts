import { lines, type Rng, type SeedProblem } from '../types.js';

const words = (input: string) => input.trim().split(/\s+/);

// ---------------------------------------------------------------------------------------------

const sumOfTwo: SeedProblem = {
  slug: 'sum-of-two',
  title: 'Sum of Two',
  difficulty: 'EASY',
  tags: ['math', 'implementation'],
  statement: `You are given two integers $a$ and $b$. Print their sum.

This is the traditional warm-up problem: use it to check that you can read input and write output in your language of choice. Mind the size of the numbers, a 32-bit integer is not enough.`,
  inputFormat: 'A single line with two integers $a$ and $b$ separated by a space.',
  outputFormat: 'Print one integer: $a + b$.',
  constraints: '- $-10^{18} \\le a, b \\le 10^{18}$',
  samples: [
    { input: '3 5\n', explanation: '$3 + 5 = 8$.' },
    { input: '-7 2\n' },
  ],
  tests: (rng: Rng) => {
    const big = 10n ** 18n;
    const random = () => BigInt(rng.int(-1e9, 1e9)) * BigInt(rng.int(0, 1e9));
    return [
      '0 0\n',
      '1 -1\n',
      `${big} ${big}\n`,
      `${-big} ${-big}\n`,
      `${big} ${-big}\n`,
      '2147483647 1\n',
      '-2147483648 -1\n',
      '4294967296 4294967296\n',
      ...Array.from({ length: 6 }, () => `${random()} ${random()}\n`),
    ];
  },
  solve: (input) => {
    const [a, b] = words(input).map(BigInt);
    return `${a! + b!}\n`;
  },
  solutions: {
    CPP: `#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
    return 0;
}
`,
    PYTHON: `a, b = map(int, input().split())
print(a + b)
`,
    JAVA: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        long a = in.nextLong();
        long b = in.nextLong();
        System.out.println(a + b);
    }
}
`,
    JAVASCRIPT: `const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(BigInt);
console.log(String(a + b));
`,
  },
};

// ---------------------------------------------------------------------------------------------

const maximumSubarray: SeedProblem = {
  slug: 'maximum-subarray',
  title: 'Maximum Subarray',
  difficulty: 'EASY',
  tags: ['arrays', 'dp', 'greedy'],
  statement: `Given an array of $n$ integers, find the largest possible sum of a **non-empty contiguous** subarray.

A subarray is a run of consecutive elements. Because it must be non-empty, the answer for an array of only negative numbers is its largest element.`,
  inputFormat: 'The first line contains $n$. The second line contains $n$ integers $a_1, a_2, \\dots, a_n$.',
  outputFormat: 'Print the maximum subarray sum.',
  constraints: '- $1 \\le n \\le 10^5$\n- $-10^9 \\le a_i \\le 10^9$',
  samples: [
    { input: '9\n-2 1 -3 4 -1 2 1 -5 4\n', explanation: 'The subarray $[4, -1, 2, 1]$ has sum $6$.' },
    { input: '3\n-4 -1 -7\n', explanation: 'Every element is negative, so the best choice is the single element $-1$.' },
  ],
  tests: (rng) => {
    const make = (n: number, lo: number, hi: number) => lines(n, rng.array(n, lo, hi).join(' '));
    return [
      '1\n5\n',
      '1\n-5\n',
      make(10, -10, 10),
      make(100, -100, 100),
      make(1000, -1000, 1),
      make(5000, 1, 1e9),
      make(5000, -1e9, -1),
      make(20000, -1e9, 1e9),
      make(60000, -1e9, 1e9),
      make(100000, -1e9, 1e9),
      make(100000, 1e9 - 5, 1e9),
      make(100000, -3, 3),
    ];
  },
  solve: (input) => {
    const w = words(input);
    const n = Number(w[0]);
    let best = -Infinity;
    let current = 0;
    for (let i = 1; i <= n; i++) {
      const x = Number(w[i]);
      current = Math.max(x, current + x);
      best = Math.max(best, current);
    }
    return `${best}\n`;
  },
  solutions: {
    CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    long long best = LLONG_MIN, current = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        current = max(x, current + x);
        best = max(best, current);
    }
    cout << best << "\\n";
    return 0;
}
`,
    PYTHON: `import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    best = None
    current = 0
    for i in range(1, n + 1):
        x = int(data[i])
        current = x if current < 0 else current + x
        if best is None or current > best:
            best = current
    print(best)

main()
`,
    JAVA: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(reader.readLine().trim());
        StringTokenizer tokens = new StringTokenizer(reader.readLine());
        long best = Long.MIN_VALUE, current = 0;
        for (int i = 0; i < n; i++) {
            long x = Long.parseLong(tokens.nextToken());
            current = Math.max(x, current + x);
            best = Math.max(best, current);
        }
        System.out.println(best);
    }
}
`,
    JAVASCRIPT: `const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean).map(Number);
const n = data[0];
let best = -Infinity;
let current = 0;
for (let i = 1; i <= n; i++) {
  current = Math.max(data[i], current + data[i]);
  best = Math.max(best, current);
}
console.log(String(best));
`,
  },
};

// ---------------------------------------------------------------------------------------------

const balancedBrackets: SeedProblem = {
  slug: 'balanced-brackets',
  title: 'Balanced Brackets',
  difficulty: 'EASY',
  tags: ['stack', 'strings'],
  statement: `A string made only of the characters \`(\`, \`)\`, \`[\`, \`]\`, \`{\` and \`}\` is **balanced** when every opening bracket is closed by a bracket of the same type, and brackets are closed in the correct order.

For example \`{[()]}\` and \`()[]\` are balanced, while \`(]\` and \`((\` are not.

Decide whether the given string is balanced.`,
  inputFormat: 'A single line containing the string $s$.',
  outputFormat: 'Print `YES` if the string is balanced, otherwise print `NO`.',
  constraints: '- $1 \\le |s| \\le 10^5$\n- $s$ contains only the characters `()[]{}`',
  samples: [{ input: '{[()]}\n' }, { input: '([)]\n', explanation: 'The `[` is closed by `)`, which is the wrong type.' }, { input: '((\n' }],
  tests: (rng) => {
    const pairs = ['()', '[]', '{}'];
    const balanced = (length: number): string => {
      const out: string[] = [];
      const stack: string[] = [];
      while (out.length + stack.length < length) {
        if (stack.length > 0 && rng.next() < 0.45) out.push(stack.pop()!);
        else {
          const pair = rng.pick(pairs);
          out.push(pair[0]!);
          stack.push(pair[1]!);
        }
      }
      while (stack.length > 0) out.push(stack.pop()!);
      return out.join('');
    };
    const broken = (length: number): string => {
      const chars = balanced(length).split('');
      const i = rng.int(0, chars.length - 1);
      chars[i] = rng.pick('()[]{}'.split('').filter((c) => c !== chars[i]));
      return chars.join('');
    };
    return [
      '()\n',
      ')(\n',
      '(\n',
      '}\n',
      '()[]{}\n',
      `${balanced(50)}\n`,
      `${broken(50)}\n`,
      `${balanced(2000)}\n`,
      `${broken(2000)}\n`,
      `${'('.repeat(50000)}${')'.repeat(50000)}\n`,
      `${'('.repeat(50000)}${')'.repeat(49999)}]\n`,
      `${balanced(100000)}\n`,
      `${broken(100000)}\n`,
      `${'[]'.repeat(50000)}\n`,
    ];
  },
  solve: (input) => {
    const s = input.trim();
    const close: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const stack: string[] = [];
    for (const c of s) {
      if (c in close) {
        if (stack.pop() !== close[c]) return 'NO\n';
      } else stack.push(c);
    }
    return stack.length === 0 ? 'YES\n' : 'NO\n';
  },
  solutions: {
    CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    cin >> s;
    vector<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            st.push_back(c);
        } else {
            char open = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (st.empty() || st.back() != open) {
                cout << "NO\\n";
                return 0;
            }
            st.pop_back();
        }
    }
    cout << (st.empty() ? "YES" : "NO") << "\\n";
    return 0;
}
`,
    PYTHON: `import sys

def main():
    s = sys.stdin.readline().strip()
    match = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in match:
            if not stack or stack.pop() != match[c]:
                print("NO")
                return
        else:
            stack.append(c)
    print("YES" if not stack else "NO")

main()
`,
    JAVA: `import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        String s = new BufferedReader(new InputStreamReader(System.in)).readLine().trim();
        char[] stack = new char[s.length() + 1];
        int top = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(' || c == '[' || c == '{') {
                stack[top++] = c;
            } else {
                char open = c == ')' ? '(' : c == ']' ? '[' : '{';
                if (top == 0 || stack[--top] != open) {
                    System.out.println("NO");
                    return;
                }
            }
        }
        System.out.println(top == 0 ? "YES" : "NO");
    }
}
`,
    JAVASCRIPT: `const s = require('fs').readFileSync(0, 'utf8').trim();
const match = { ')': '(', ']': '[', '}': '{' };
const stack = [];
let ok = true;
for (const c of s) {
  if (c in match) {
    if (stack.pop() !== match[c]) {
      ok = false;
      break;
    }
  } else {
    stack.push(c);
  }
}
console.log(ok && stack.length === 0 ? 'YES' : 'NO');
`,
  },
};

// ---------------------------------------------------------------------------------------------

const countPrimes: SeedProblem = {
  slug: 'count-primes',
  title: 'Count Primes',
  difficulty: 'EASY',
  tags: ['math', 'number-theory', 'sieve'],
  statement: `Given an integer $n$, count the prime numbers $p$ with $2 \\le p \\le n$.

Testing every number separately is too slow for the largest inputs; the sieve of Eratosthenes is the intended approach.`,
  inputFormat: 'A single integer $n$.',
  outputFormat: 'Print the number of primes not greater than $n$.',
  constraints: '- $1 \\le n \\le 2 \\cdot 10^6$',
  samples: [
    { input: '10\n', explanation: 'The primes are $2, 3, 5, 7$.' },
    { input: '1\n', explanation: 'There are no primes below $2$.' },
  ],
  tests: (rng) => [1, 2, 3, 4, 100, 1000, 7919, 65536, 999983, 1000000, rng.int(1e6, 2e6), 1999993, 2000000].map((n) => `${n}\n`),
  solve: (input) => {
    const n = Number(input.trim());
    if (n < 2) return '0\n';
    const composite = new Uint8Array(n + 1);
    let count = 0;
    for (let i = 2; i <= n; i++) {
      if (composite[i]) continue;
      count++;
      for (let j = i * i; j <= n; j += i) composite[j] = 1;
    }
    return `${count}\n`;
  },
  solutions: {
    CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<bool> composite(n + 1, false);
    int count = 0;
    for (long long i = 2; i <= n; i++) {
        if (composite[i]) continue;
        count++;
        for (long long j = i * i; j <= n; j += i) composite[j] = true;
    }
    cout << count << "\\n";
    return 0;
}
`,
    PYTHON: `n = int(input())
if n < 2:
    print(0)
else:
    sieve = bytearray([1]) * (n + 1)
    sieve[0] = sieve[1] = 0
    i = 2
    while i * i <= n:
        if sieve[i]:
            sieve[i * i::i] = bytearray(len(range(i * i, n + 1, i)))
        i += 1
    print(sum(sieve))
`,
    JAVA: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        boolean[] composite = new boolean[n + 1];
        int count = 0;
        for (int i = 2; i <= n; i++) {
            if (composite[i]) continue;
            count++;
            for (long j = (long) i * i; j <= n; j += i) composite[(int) j] = true;
        }
        System.out.println(count);
    }
}
`,
    JAVASCRIPT: `const n = Number(require('fs').readFileSync(0, 'utf8').trim());
const composite = new Uint8Array(n + 1);
let count = 0;
for (let i = 2; i <= n; i++) {
  if (composite[i]) continue;
  count++;
  for (let j = i * i; j <= n; j += i) composite[j] = 1;
}
console.log(String(count));
`,
  },
};

// ---------------------------------------------------------------------------------------------

const pairSumCount: SeedProblem = {
  slug: 'pair-sum-count',
  title: 'Pair Sum Count',
  difficulty: 'EASY',
  tags: ['hashing', 'arrays'],
  statement: `You are given an array of $n$ integers and a target value $k$. Count the pairs of positions $(i, j)$ with $i < j$ such that $a_i + a_j = k$.

Pairs are counted by position, so equal values at different positions form different pairs.`,
  inputFormat: 'The first line contains $n$ and $k$. The second line contains $n$ integers $a_1, \\dots, a_n$.',
  outputFormat: 'Print the number of pairs.',
  constraints: '- $1 \\le n \\le 10^5$\n- $-10^9 \\le a_i \\le 10^9$\n- $-2 \\cdot 10^9 \\le k \\le 2 \\cdot 10^9$',
  samples: [
    { input: '5 6\n1 5 3 3 7\n', explanation: 'The pairs are $(1, 5)$ at positions 1 and 2, and $(3, 3)$ at positions 3 and 4.' },
    { input: '4 2\n1 1 1 1\n', explanation: 'Every one of the $\\binom{4}{2} = 6$ pairs sums to $2$.' },
  ],
  tests: (rng) => {
    const make = (n: number, k: number, lo: number, hi: number) => lines(`${n} ${k}`, rng.array(n, lo, hi).join(' '));
    return [
      '1 5\n5\n',
      '2 0\n-3 3\n',
      make(10, 10, 0, 10),
      make(100, 0, -20, 20),
      make(1000, 100, 0, 100),
      make(5000, 7, -1e9, 1e9),
      lines('100000 2', Array(100000).fill(1).join(' ')),
      make(100000, 1000, 0, 1000),
      make(100000, 0, -50, 50),
      make(100000, 2000000000, 999999990, 1000000000),
      make(100000, -5, -1e9, 1e9),
    ];
  },
  solve: (input) => {
    const w = words(input).map(Number);
    const n = w[0]!;
    const k = w[1]!;
    const seen = new Map<number, number>();
    let pairs = 0;
    for (let i = 0; i < n; i++) {
      const x = w[2 + i]!;
      pairs += seen.get(k - x) ?? 0;
      seen.set(x, (seen.get(x) ?? 0) + 1);
    }
    return `${pairs}\n`;
  },
  solutions: {
    CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long k;
    cin >> n >> k;
    map<long long, long long> seen;
    long long pairs = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        auto it = seen.find(k - x);
        if (it != seen.end()) pairs += it->second;
        seen[x]++;
    }
    cout << pairs << "\\n";
    return 0;
}
`,
    PYTHON: `import sys

def main():
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    seen = {}
    pairs = 0
    for i in range(2, 2 + n):
        x = int(data[i])
        pairs += seen.get(k - x, 0)
        seen[x] = seen.get(x, 0) + 1
    print(pairs)

main()
`,
    JAVA: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer first = new StringTokenizer(reader.readLine());
        int n = Integer.parseInt(first.nextToken());
        long k = Long.parseLong(first.nextToken());
        StringTokenizer tokens = new StringTokenizer(reader.readLine());
        HashMap<Long, Long> seen = new HashMap<>();
        long pairs = 0;
        for (int i = 0; i < n; i++) {
            long x = Long.parseLong(tokens.nextToken());
            pairs += seen.getOrDefault(k - x, 0L);
            seen.merge(x, 1L, Long::sum);
        }
        System.out.println(pairs);
    }
}
`,
    JAVASCRIPT: `const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean).map(Number);
const n = data[0];
const k = data[1];
const seen = new Map();
let pairs = 0;
for (let i = 0; i < n; i++) {
  const x = data[2 + i];
  pairs += seen.get(k - x) || 0;
  seen.set(x, (seen.get(x) || 0) + 1);
}
console.log(String(pairs));
`,
  },
};

// ---------------------------------------------------------------------------------------------

const countNotGreater: SeedProblem = {
  slug: 'count-not-greater',
  title: 'Count Not Greater',
  difficulty: 'EASY',
  tags: ['binary-search', 'sorting'],
  statement: `You are given an array of $n$ integers and $q$ queries. For each query value $x$, report how many elements of the array are **less than or equal to** $x$.

Scanning the whole array for every query is too slow. Sort the array once and answer each query with binary search.`,
  inputFormat:
    'The first line contains $n$ and $q$. The second line contains the $n$ array elements. Each of the next $q$ lines contains one query value $x$.',
  outputFormat: 'For each query print the answer on its own line.',
  constraints: '- $1 \\le n, q \\le 10^5$\n- $-10^9 \\le a_i, x \\le 10^9$',
  samples: [{ input: '5 4\n4 1 7 4 9\n4\n0\n9\n8\n', explanation: 'Sorted, the array is $[1, 4, 4, 7, 9]$. Three elements are $\\le 4$, none are $\\le 0$, all five are $\\le 9$ and four are $\\le 8$.' }],
  tests: (rng) => {
    const make = (n: number, q: number, lo: number, hi: number) =>
      lines(`${n} ${q}`, rng.array(n, lo, hi).join(' '), rng.array(q, lo - 2, hi + 2).join('\n'));
    return [
      '1 3\n5\n4\n5\n6\n',
      make(10, 10, 0, 10),
      make(100, 100, -50, 50),
      make(2000, 2000, -1e9 + 2, 1e9 - 2),
      make(50000, 50000, 0, 100),
      make(100000, 100000, -1e9 + 2, 1e9 - 2),
      make(100000, 100000, 7, 7),
      make(100000, 100000, -1000, 1000),
    ];
  },
  solve: (input) => {
    const w = words(input).map(Number);
    const n = w[0]!;
    const q = w[1]!;
    const a = Float64Array.from(w.slice(2, 2 + n)).sort();
    const out: number[] = [];
    for (let i = 0; i < q; i++) {
      const x = w[2 + n + i]!;
      let lo = 0;
      let hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (a[mid]! <= x) lo = mid + 1;
        else hi = mid;
      }
      out.push(lo);
    }
    return `${out.join('\n')}\n`;
  },
};

// ---------------------------------------------------------------------------------------------

const modularPower: SeedProblem = {
  slug: 'modular-power',
  title: 'Modular Power',
  difficulty: 'EASY',
  tags: ['math', 'number-theory'],
  statement: `Answer $t$ independent queries. Each query gives three integers $a$, $b$ and $m$; compute $a^b \\bmod m$.

Multiplying $a$ by itself $b$ times is hopeless when $b$ is around $10^{18}$. Use binary exponentiation, which needs only about $\\log_2 b$ multiplications. We define $0^0 = 1$.`,
  inputFormat: 'The first line contains $t$. Each of the next $t$ lines contains $a$, $b$ and $m$.',
  outputFormat: 'For each query print $a^b \\bmod m$ on its own line.',
  constraints: '- $1 \\le t \\le 10^4$\n- $0 \\le a, b \\le 10^{18}$\n- $1 \\le m \\le 10^9$',
  samples: [{ input: '3\n2 10 1000\n3 0 7\n5 3 1\n', explanation: '$2^{10} = 1024$, and $1024 \\bmod 1000 = 24$. Anything to the power $0$ is $1$. Everything is $0$ modulo $1$.' }],
  tests: (rng) => {
    const big = () => BigInt(rng.int(0, 1e9)) * BigInt(rng.int(0, 1e9));
    const make = (t: number) => lines(t, ...Array.from({ length: t }, () => `${big()} ${big()} ${rng.int(1, 1e9)}`));
    return [
      '4\n0 0 5\n0 5 5\n1 1000000000000000000 2\n7 1 7\n',
      lines(3, `${10n ** 18n} ${10n ** 18n} 1000000000`, `${10n ** 18n} ${10n ** 18n} 999999937`, '2 62 1000000007'),
      make(10),
      make(100),
      make(1000),
      make(10000),
      lines(10000, ...Array.from({ length: 10000 }, () => `${rng.int(0, 50)} ${rng.int(0, 50)} ${rng.int(1, 50)}`)),
    ];
  },
  solve: (input) => {
    const w = words(input);
    const t = Number(w[0]);
    const out: string[] = [];
    for (let i = 0; i < t; i++) {
      let base = BigInt(w[1 + 3 * i]!);
      let exponent = BigInt(w[2 + 3 * i]!);
      const mod = BigInt(w[3 + 3 * i]!);
      let result = 1n % mod;
      base %= mod;
      while (exponent > 0n) {
        if (exponent & 1n) result = (result * base) % mod;
        base = (base * base) % mod;
        exponent >>= 1n;
      }
      out.push(String(result));
    }
    return `${out.join('\n')}\n`;
  },
};

// ---------------------------------------------------------------------------------------------

const triangleArea: SeedProblem = {
  slug: 'triangle-area',
  title: 'Triangle Area',
  difficulty: 'EASY',
  tags: ['geometry', 'math'],
  checker: 'FLOAT',
  statement: `Three points with integer coordinates are the vertices of a triangle. Compute its area.

The points may lie on one line, in which case the area is $0$.

Your answer is accepted if its absolute or relative error does not exceed $10^{-6}$.`,
  inputFormat: 'Three lines, each with two integers $x_i$ and $y_i$: the coordinates of a vertex.',
  outputFormat: 'Print the area of the triangle as a decimal number.',
  constraints: '- $-10^6 \\le x_i, y_i \\le 10^6$',
  samples: [
    { input: '0 0\n4 0\n0 3\n', explanation: 'A right triangle with legs $4$ and $3$ has area $6$.' },
    { input: '0 0\n1 1\n2 2\n', explanation: 'The points are collinear.' },
  ],
  tests: (rng) => {
    const point = (limit: number) => `${rng.int(-limit, limit)} ${rng.int(-limit, limit)}`;
    const make = (limit: number) => lines(point(limit), point(limit), point(limit));
    return [
      '0 0\n1 0\n0 1\n',
      '5 5\n5 5\n5 5\n',
      '-1000000 -1000000\n1000000 -1000000\n0 1000000\n',
      '-1000000 -1000000\n1000000 1000000\n-1000000 1000000\n',
      make(5),
      make(10),
      make(1000),
      make(1000),
      make(1e6),
      make(1e6),
      make(1e6),
    ];
  },
  solve: (input) => {
    const [x1, y1, x2, y2, x3, y3] = words(input).map(Number) as [number, number, number, number, number, number];
    const cross = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
    return `${(Math.abs(cross) / 2).toFixed(1)}\n`;
  },
};

export const easyProblems: SeedProblem[] = [
  sumOfTwo,
  maximumSubarray,
  balancedBrackets,
  countPrimes,
  pairSumCount,
  countNotGreater,
  modularPower,
  triangleArea,
];
