import { lines, type Rng, type SeedProblem } from '../types.js';

const words = (input: string) => input.trim().split(/\s+/);

// ---------------------------------------------------------------------------------------------

const longestIncreasingSubsequence: SeedProblem = {
  slug: 'longest-increasing-subsequence',
  title: 'Longest Increasing Subsequence',
  difficulty: 'MEDIUM',
  tags: ['dp', 'binary-search'],
  statement: `A subsequence is obtained from an array by deleting any number of elements (possibly none) without changing the order of the rest.

Find the length of the longest **strictly increasing** subsequence of the given array.

The classic $O(n^2)$ dynamic programming solution is too slow here. Keep, for every length, the smallest value that can end an increasing subsequence of that length, and update it with binary search for an $O(n \\log n)$ solution.`,
  inputFormat: 'The first line contains $n$. The second line contains $n$ integers $a_1, \\dots, a_n$.',
  outputFormat: 'Print the length of the longest strictly increasing subsequence.',
  constraints: '- $1 \\le n \\le 10^5$\n- $1 \\le a_i \\le 10^9$',
  samples: [
    { input: '8\n10 9 2 5 3 7 101 18\n', explanation: 'One optimal subsequence is $[2, 3, 7, 18]$.' },
    { input: '4\n7 7 7 7\n', explanation: 'Equal elements are not strictly increasing, so the answer is $1$.' },
  ],
  tests: (rng) => {
    const make = (values: number[]) => lines(values.length, values.join(' '));
    const ascending = Array.from({ length: 100000 }, (_, i) => i + 1);
    return [
      '1\n42\n',
      make(rng.array(10, 1, 10)),
      make(rng.array(200, 1, 50)),
      make(rng.array(3000, 1, 1e9)),
      make(ascending),
      make([...ascending].reverse()),
      make(rng.array(100000, 1, 1e9)),
      make(rng.array(100000, 1, 300)),
      make(ascending.map((v) => v + rng.int(0, 40))),
      make(Array.from({ length: 100000 }, (_, i) => (i % 2 === 0 ? i + 1 : 100000 - i))),
    ];
  },
  solve: (input) => {
    const w = words(input).map(Number);
    const n = w[0]!;
    const tails: number[] = [];
    for (let i = 1; i <= n; i++) {
      const x = w[i]!;
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tails[mid]! < x) lo = mid + 1;
        else hi = mid;
      }
      tails[lo] = x;
    }
    return `${tails.length}\n`;
  },
};

// ---------------------------------------------------------------------------------------------

function randomGrid(rng: Rng, rows: number, cols: number, wallChance: number, open: string, wall: string): string[] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (rng.next() < wallChance ? wall : open)).join(''),
  );
}

const gridEscape: SeedProblem = {
  slug: 'grid-escape',
  title: 'Grid Escape',
  difficulty: 'MEDIUM',
  tags: ['graphs', 'bfs'],
  statement: `A robot stands in the top-left cell of a grid with $n$ rows and $m$ columns and wants to reach the bottom-right cell. Each cell is either free (\`.\`) or a wall (\`#\`). In one move the robot steps to a free cell that shares a side with its current cell.

Find the minimum number of moves needed, or report that the exit cannot be reached. If the start or the exit is a wall, the exit is unreachable.`,
  inputFormat: 'The first line contains $n$ and $m$. Each of the next $n$ lines contains a string of $m$ characters describing one row.',
  outputFormat: 'Print the minimum number of moves, or $-1$ if the bottom-right cell cannot be reached.',
  constraints: '- $1 \\le n, m \\le 500$',
  samples: [
    { input: '3 4\n....\n.##.\n....\n', explanation: 'Any shortest route makes $2$ moves down and $3$ moves right, $5$ in total.' },
    { input: '2 2\n.#\n#.\n', explanation: 'Both neighbours of the start are walls.' },
  ],
  tests: (rng) => {
    const make = (rows: string[]) => lines(`${rows.length} ${rows[0]!.length}`, ...rows);
    const clearEnds = (rows: string[]) => {
      rows[0] = `.${rows[0]!.slice(1)}`;
      rows[rows.length - 1] = `${rows[rows.length - 1]!.slice(0, -1)}.`;
      return rows;
    };
    // A serpentine corridor forces a path that visits almost every row end to end.
    const snake = (rows: number, cols: number) =>
      Array.from({ length: rows }, (_, r) => {
        if (r % 2 === 0) return '.'.repeat(cols);
        return (r >> 1) % 2 === 0 ? `${'#'.repeat(cols - 1)}.` : `.${'#'.repeat(cols - 1)}`;
      });
    return [
      '1 1\n.\n',
      '1 1\n#\n',
      make(['.'.repeat(500)]),
      make(clearEnds(randomGrid(rng, 5, 5, 0.2, '.', '#'))),
      make(clearEnds(randomGrid(rng, 30, 40, 0.3, '.', '#'))),
      make(clearEnds(randomGrid(rng, 200, 200, 0.25, '.', '#'))),
      make(clearEnds(randomGrid(rng, 500, 500, 0.2, '.', '#'))),
      make(clearEnds(randomGrid(rng, 500, 500, 0.42, '.', '#'))),
      make(randomGrid(rng, 500, 500, 0, '.', '#')),
      make(snake(499, 500)),
      make([...randomGrid(rng, 499, 500, 0.1, '.', '#'), `${'.'.repeat(499)}#`]),
    ];
  },
  solve: (input) => {
    const rowsText = input.trim().split('\n');
    const [n, m] = rowsText[0]!.trim().split(/\s+/).map(Number) as [number, number];
    const grid = rowsText.slice(1, 1 + n).map((r) => r.trim());
    if (grid[0]![0] === '#' || grid[n - 1]![m - 1] === '#') return '-1\n';
    const dist = new Int32Array(n * m).fill(-1);
    const queue = new Int32Array(n * m);
    let head = 0;
    let tail = 0;
    dist[0] = 0;
    queue[tail++] = 0;
    const dr = [1, -1, 0, 0];
    const dc = [0, 0, 1, -1];
    while (head < tail) {
      const cell = queue[head++]!;
      const r = Math.floor(cell / m);
      const c = cell % m;
      for (let d = 0; d < 4; d++) {
        const nr = r + dr[d]!;
        const nc = c + dc[d]!;
        if (nr < 0 || nc < 0 || nr >= n || nc >= m || grid[nr]![nc] === '#') continue;
        const next = nr * m + nc;
        if (dist[next] !== -1) continue;
        dist[next] = dist[cell]! + 1;
        queue[tail++] = next;
      }
    }
    return `${dist[n * m - 1]}\n`;
  },
};

// ---------------------------------------------------------------------------------------------

const cheapestRoute: SeedProblem = {
  slug: 'cheapest-route',
  title: 'Cheapest Route',
  difficulty: 'MEDIUM',
  tags: ['graphs', 'shortest-paths'],
  timeLimitMs: 2000,
  statement: `A country has $n$ cities numbered $1$ to $n$ and $m$ two-way roads. Travelling along a road costs a fixed toll.

Find the cheapest total toll for a trip from city $1$ to city $n$, or report that city $n$ cannot be reached. There may be several roads between the same pair of cities.

Tolls are non-negative, so Dijkstra's algorithm with a priority queue applies. Note that the answer may not fit in a 32-bit integer.`,
  inputFormat: 'The first line contains $n$ and $m$. Each of the next $m$ lines contains $u$, $v$ and $w$: a road between cities $u$ and $v$ with toll $w$.',
  outputFormat: 'Print the minimum total toll, or $-1$ if there is no route.',
  constraints: '- $1 \\le n \\le 5 \\cdot 10^4$\n- $0 \\le m \\le 10^5$\n- $1 \\le u, v \\le n$, $u \\ne v$\n- $1 \\le w \\le 10^9$',
  samples: [
    { input: '4 5\n1 2 4\n1 3 1\n3 2 2\n2 4 5\n3 4 9\n', explanation: 'The route $1 \\to 3 \\to 2 \\to 4$ costs $1 + 2 + 5 = 8$.' },
    { input: '3 1\n1 2 7\n', explanation: 'No road leads to city $3$.' },
  ],
  tests: (rng) => {
    const edge = (n: number, maxW: number) => {
      const u = rng.int(1, n);
      let v = rng.int(1, n - 1);
      if (v >= u) v += 1;
      return `${u} ${v} ${rng.int(1, maxW)}`;
    };
    const random = (n: number, m: number, maxW: number) => lines(`${n} ${m}`, ...Array.from({ length: m }, () => edge(n, maxW)));
    const chain = (n: number, w: number) => lines(`${n} ${n - 1}`, ...Array.from({ length: n - 1 }, (_, i) => `${i + 1} ${i + 2} ${w}`));
    return [
      '1 0\n',
      '2 0\n',
      '2 1\n1 2 1000000000\n',
      random(10, 15, 10),
      random(100, 300, 100),
      random(1000, 5000, 1e9),
      chain(50000, 1e9),
      random(50000, 100000, 1e9),
      random(50000, 100000, 5),
      random(50000, 30000, 1e9),
      random(300, 100000, 1e9),
    ];
  },
  solve: (input) => {
    const w = words(input).map(Number);
    const n = w[0]!;
    const m = w[1]!;
    const head = new Int32Array(n + 1).fill(-1);
    const next = new Int32Array(2 * m);
    const to = new Int32Array(2 * m);
    const cost = new Float64Array(2 * m);
    for (let i = 0; i < m; i++) {
      const u = w[2 + 3 * i]!;
      const v = w[3 + 3 * i]!;
      const c = w[4 + 3 * i]!;
      to[2 * i] = v; cost[2 * i] = c; next[2 * i] = head[u]!; head[u] = 2 * i;
      to[2 * i + 1] = u; cost[2 * i + 1] = c; next[2 * i + 1] = head[v]!; head[v] = 2 * i + 1;
    }
    const dist = new Float64Array(n + 1).fill(Infinity);
    // binary heap of [distance, node]
    const heap: [number, number][] = [[0, 1]];
    dist[1] = 0;
    const push = (item: [number, number]) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let s = i;
          if (l < heap.length && heap[l]![0] < heap[s]![0]) s = l;
          if (r < heap.length && heap[r]![0] < heap[s]![0]) s = r;
          if (s === i) break;
          [heap[s], heap[i]] = [heap[i]!, heap[s]!];
          i = s;
        }
      }
      return top;
    };
    while (heap.length > 0) {
      const [d, u] = pop();
      if (d > dist[u]!) continue;
      for (let e = head[u]!; e !== -1; e = next[e]!) {
        const nd = d + cost[e]!;
        if (nd < dist[to[e]!]!) {
          dist[to[e]!] = nd;
          push([nd, to[e]!]);
        }
      }
    }
    return `${Number.isFinite(dist[n]!) ? dist[n] : -1}\n`;
  },
};

// ---------------------------------------------------------------------------------------------

const knapsack: SeedProblem = {
  slug: 'knapsack',
  title: 'Knapsack',
  difficulty: 'MEDIUM',
  tags: ['dp'],
  timeLimitMs: 2000,
  statement: `There are $n$ items; item $i$ has weight $w_i$ and value $v_i$. Your knapsack holds a total weight of at most $W$. Each item can be taken **at most once**.

Choose items so that their total weight fits in the knapsack and their total value is as large as possible.`,
  inputFormat: 'The first line contains $n$ and $W$. Each of the next $n$ lines contains $w_i$ and $v_i$.',
  outputFormat: 'Print the maximum total value.',
  constraints: '- $1 \\le n \\le 100$\n- $1 \\le W \\le 10^4$\n- $1 \\le w_i \\le W$\n- $1 \\le v_i \\le 10^9$',
  samples: [
    { input: '4 7\n1 1\n3 4\n4 5\n5 7\n', explanation: 'Take the items of weight $3$ and $4$ for a value of $4 + 5 = 9$.' },
    { input: '2 3\n3 10\n3 20\n', explanation: 'Only one of the two items fits.' },
  ],
  tests: (rng) => {
    const make = (n: number, capacity: number, maxW: number, maxV: number) =>
      lines(`${n} ${capacity}`, ...Array.from({ length: n }, () => `${rng.int(1, Math.min(maxW, capacity))} ${rng.int(1, maxV)}`));
    return [
      '1 1\n1 5\n',
      '1 5\n5 1000000000\n',
      make(5, 10, 10, 10),
      make(20, 50, 20, 100),
      make(50, 1000, 100, 1e9),
      make(100, 10000, 10000, 1e9),
      make(100, 10000, 200, 1e9),
      make(100, 10000, 10, 1e9),
      make(100, 9999, 3000, 1000),
      make(100, 100, 100, 1e9),
    ];
  },
  solve: (input) => {
    const w = words(input).map(Number);
    const n = w[0]!;
    const capacity = w[1]!;
    const best = new Float64Array(capacity + 1);
    for (let i = 0; i < n; i++) {
      const weight = w[2 + 2 * i]!;
      const value = w[3 + 2 * i]!;
      for (let c = capacity; c >= weight; c--) {
        const candidate = best[c - weight]! + value;
        if (candidate > best[c]!) best[c] = candidate;
      }
    }
    return `${best[capacity]}\n`;
  },
};

// ---------------------------------------------------------------------------------------------

const rangeSumUpdates: SeedProblem = {
  slug: 'range-sum-updates',
  title: 'Range Sum with Updates',
  difficulty: 'HARD',
  tags: ['data-structures', 'fenwick-tree', 'segment-tree'],
  timeLimitMs: 2000,
  statement: `You maintain an array of $n$ integers and must process $q$ operations of two kinds:

- \`1 i x\` — assign the value $x$ to position $i$;
- \`2 l r\` — report the sum $a_l + a_{l+1} + \\dots + a_r$.

Positions are numbered from $1$. Prefix sums alone are not enough because of the updates; a Fenwick tree or a segment tree handles both operations in $O(\\log n)$.`,
  inputFormat:
    'The first line contains $n$ and $q$. The second line contains the initial array. Each of the next $q$ lines describes an operation in the format above.',
  outputFormat: 'For every operation of the second kind print the requested sum on its own line.',
  constraints: '- $1 \\le n, q \\le 10^5$\n- $-10^9 \\le a_i, x \\le 10^9$\n- $1 \\le i \\le n$, $1 \\le l \\le r \\le n$\n- there is at least one operation of the second kind',
  samples: [
    {
      input: '5 4\n1 2 3 4 5\n2 1 5\n1 3 10\n2 2 4\n2 3 3\n',
      explanation: 'The total is $15$. After setting $a_3 = 10$, the sum of positions $2..4$ is $2 + 10 + 4 = 16$ and position $3$ alone is $10$.',
    },
  ],
  tests: (rng) => {
    const make = (n: number, q: number, limit: number, updateChance: number) => {
      const ops = Array.from({ length: q }, () => {
        if (rng.next() < updateChance) return `1 ${rng.int(1, n)} ${rng.int(-limit, limit)}`;
        const l = rng.int(1, n);
        return `2 ${l} ${rng.int(l, n)}`;
      });
      ops[q - 1] = `2 1 ${n}`;
      return lines(`${n} ${q}`, rng.array(n, -limit, limit).join(' '), ...ops);
    };
    return [
      '1 1\n7\n2 1 1\n',
      make(5, 10, 10, 0.5),
      make(100, 200, 100, 0.5),
      make(2000, 2000, 1e9, 0.3),
      make(100000, 100000, 1e9, 0.5),
      make(100000, 100000, 1e9, 0.05),
      make(100000, 100000, 1e9, 0.95),
      make(100000, 100000, 1, 0.5),
      make(1, 100000, 1e9, 0.5),
    ];
  },
  solve: (input) => {
    const w = words(input).map(Number);
    const n = w[0]!;
    const q = w[1]!;
    const values = new Float64Array(n + 1);
    const tree = new Float64Array(n + 1);
    const add = (i: number, delta: number) => {
      for (; i <= n; i += i & -i) tree[i] = tree[i]! + delta;
    };
    const prefix = (i: number) => {
      let sum = 0;
      for (; i > 0; i -= i & -i) sum += tree[i]!;
      return sum;
    };
    for (let i = 1; i <= n; i++) {
      values[i] = w[1 + i]!;
      add(i, values[i]!);
    }
    const out: number[] = [];
    let at = 2 + n;
    for (let k = 0; k < q; k++) {
      const type = w[at]!;
      const a = w[at + 1]!;
      const b = w[at + 2]!;
      at += 3;
      if (type === 1) {
        add(a, b - values[a]!);
        values[a] = b;
      } else {
        out.push(prefix(b) - prefix(a - 1));
      }
    }
    return `${out.join('\n')}\n`;
  },
};

// ---------------------------------------------------------------------------------------------
// The next two stay unpublished: they are the problem set of the seeded upcoming contest.
// ---------------------------------------------------------------------------------------------

const editDistance: SeedProblem = {
  slug: 'edit-distance',
  title: 'Edit Distance',
  difficulty: 'MEDIUM',
  tags: ['dp', 'strings'],
  timeLimitMs: 2000,
  isPublic: false,
  statement: `You are given two strings $s$ and $t$ of lowercase English letters. In one operation you may

- insert a character anywhere in the string,
- delete a character, or
- replace a character with another one.

Find the minimum number of operations that turn $s$ into $t$.`,
  inputFormat: 'The first line contains $s$ and the second line contains $t$.',
  outputFormat: 'Print the minimum number of operations.',
  constraints: '- $1 \\le |s|, |t| \\le 1000$\n- both strings consist of lowercase English letters',
  samples: [
    { input: 'kitten\nsitting\n', explanation: 'Replace `k` with `s`, replace `e` with `i`, and append `g`.' },
    { input: 'abc\nabc\n' },
  ],
  tests: (rng) => {
    const word = (length: number, alphabet: string) => Array.from({ length }, () => rng.pick(alphabet.split(''))).join('');
    const abc = 'abcdefghijklmnopqrstuvwxyz';
    const mutated = (base: string) =>
      base
        .split('')
        .flatMap((c) => (rng.next() < 0.1 ? [] : rng.next() < 0.1 ? [c, rng.pick(abc.split(''))] : [c]))
        .join('')
        .slice(0, 1000) || 'a';
    const long = word(1000, abc);
    return [
      'a\na\n',
      'a\nb\n',
      `a\n${'a'.repeat(1000)}\n`,
      `${word(10, 'ab')}\n${word(12, 'ab')}\n`,
      `${word(100, abc)}\n${word(80, abc)}\n`,
      `${word(1000, 'ab')}\n${word(1000, 'ab')}\n`,
      `${long}\n${mutated(long)}\n`,
      `${word(1000, abc)}\n${word(1000, abc)}\n`,
      `${'a'.repeat(1000)}\n${'b'.repeat(1000)}\n`,
      `${word(1000, 'abc')}\n${word(700, 'abc')}\n`,
    ];
  },
  solve: (input) => {
    const [s, t] = input.trim().split('\n').map((l) => l.trim()) as [string, string];
    let previous = Array.from({ length: t.length + 1 }, (_, j) => j);
    for (let i = 1; i <= s.length; i++) {
      const current = [i];
      for (let j = 1; j <= t.length; j++) {
        current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (s[i - 1] === t[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return `${previous[t.length]}\n`;
  },
};

const islands: SeedProblem = {
  slug: 'count-islands',
  title: 'Count Islands',
  difficulty: 'MEDIUM',
  tags: ['graphs', 'dfs', 'union-find'],
  isPublic: false,
  statement: `A map is drawn on a grid of $n$ rows and $m$ columns. Each cell is either land (\`#\`) or water (\`.\`). Two land cells belong to the same island when you can walk from one to the other through land cells that share a side.

Count the islands on the map.

A recursive depth-first search can overflow the call stack on a large island; an explicit stack, breadth-first search or union-find avoids that.`,
  inputFormat: 'The first line contains $n$ and $m$. Each of the next $n$ lines contains a string of $m$ characters.',
  outputFormat: 'Print the number of islands.',
  constraints: '- $1 \\le n, m \\le 500$',
  samples: [
    { input: '4 5\n##..#\n#...#\n..#..\n.....\n', explanation: 'There are three islands: the top-left group, the right-hand column of two cells, and the single cell in the middle.' },
    { input: '2 2\n..\n..\n' },
  ],
  tests: (rng) => {
    const make = (rows: string[]) => lines(`${rows.length} ${rows[0]!.length}`, ...rows);
    const checker = Array.from({ length: 500 }, (_, r) => Array.from({ length: 500 }, (_, c) => ((r + c) % 2 === 0 ? '#' : '.')).join(''));
    return [
      '1 1\n#\n',
      '1 1\n.\n',
      make(randomGrid(rng, 6, 8, 0.4, '.', '#')),
      make(randomGrid(rng, 50, 50, 0.5, '.', '#')),
      make(randomGrid(rng, 500, 500, 0.3, '.', '#')),
      make(randomGrid(rng, 500, 500, 0.6, '.', '#')),
      make(randomGrid(rng, 500, 500, 1, '.', '#')),
      make(randomGrid(rng, 500, 500, 0, '.', '#')),
      make(checker),
      make(randomGrid(rng, 1, 500, 0.5, '.', '#')),
    ];
  },
  solve: (input) => {
    const rowsText = input.trim().split('\n');
    const [n, m] = rowsText[0]!.trim().split(/\s+/).map(Number) as [number, number];
    const grid = rowsText.slice(1, 1 + n).map((r) => r.trim());
    const seen = new Uint8Array(n * m);
    const stack = new Int32Array(n * m);
    let count = 0;
    for (let start = 0; start < n * m; start++) {
      if (seen[start] || grid[Math.floor(start / m)]![start % m] !== '#') continue;
      count++;
      let top = 0;
      stack[top++] = start;
      seen[start] = 1;
      while (top > 0) {
        const cell = stack[--top]!;
        const r = Math.floor(cell / m);
        const c = cell % m;
        const neighbours = [r > 0 ? cell - m : -1, r < n - 1 ? cell + m : -1, c > 0 ? cell - 1 : -1, c < m - 1 ? cell + 1 : -1];
        for (const next of neighbours) {
          if (next < 0 || seen[next] || grid[Math.floor(next / m)]![next % m] !== '#') continue;
          seen[next] = 1;
          stack[top++] = next;
        }
      }
    }
    return `${count}\n`;
  },
};

export const advancedProblems: SeedProblem[] = [
  longestIncreasingSubsequence,
  gridEscape,
  cheapestRoute,
  knapsack,
  rangeSumUpdates,
  editDistance,
  islands,
];
