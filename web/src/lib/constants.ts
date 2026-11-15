import type { Difficulty, Language, SubmissionStatus, Verdict } from '../types';

export const APP_NAME = 'CodeJudge';

export const LANGUAGES: { id: Language; name: string; short: string }[] = [
  { id: 'CPP', name: 'C++20 (GCC)', short: 'C++' },
  { id: 'PYTHON', name: 'Python 3', short: 'Python' },
  { id: 'JAVA', name: 'Java 21', short: 'Java' },
  { id: 'JAVASCRIPT', name: 'JavaScript (Node.js)', short: 'JavaScript' },
];

export const languageName = (id: Language, short = false): string => {
  const language = LANGUAGES.find((l) => l.id === id);
  return language ? (short ? language.short : language.name) : id;
};

/** CPU time multipliers applied by the judge on top of a problem's base limit. */
export const TIME_FACTORS: Record<Language, number> = { CPP: 1, PYTHON: 3, JAVA: 2, JAVASCRIPT: 2 };

export const VERDICTS: Record<Verdict, { label: string; short: string; tone: 'ok' | 'bad' | 'warn' | 'info' | 'muted' }> = {
  ACCEPTED: { label: 'Accepted', short: 'AC', tone: 'ok' },
  WRONG_ANSWER: { label: 'Wrong Answer', short: 'WA', tone: 'bad' },
  TIME_LIMIT_EXCEEDED: { label: 'Time Limit Exceeded', short: 'TLE', tone: 'warn' },
  MEMORY_LIMIT_EXCEEDED: { label: 'Memory Limit Exceeded', short: 'MLE', tone: 'warn' },
  OUTPUT_LIMIT_EXCEEDED: { label: 'Output Limit Exceeded', short: 'OLE', tone: 'warn' },
  RUNTIME_ERROR: { label: 'Runtime Error', short: 'RE', tone: 'bad' },
  COMPILATION_ERROR: { label: 'Compilation Error', short: 'CE', tone: 'info' },
  INTERNAL_ERROR: { label: 'Judge Error', short: 'IE', tone: 'muted' },
};

export const VERDICT_ORDER = Object.keys(VERDICTS) as Verdict[];

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  QUEUED: 'In queue',
  COMPILING: 'Compiling',
  RUNNING: 'Running',
  COMPLETED: 'Judged',
};

export const DIFFICULTIES: Record<Difficulty, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  EASY: { label: 'Easy', tone: 'ok' },
  MEDIUM: { label: 'Medium', tone: 'warn' },
  HARD: { label: 'Hard', tone: 'bad' },
};

export const TEMPLATES: Record<Language, string> = {
  CPP: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);


    return 0;
}
`,
  PYTHON: `import sys
input = sys.stdin.readline

def main():
    pass

main()
`,
  JAVA: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));

    }
}
`,
  JAVASCRIPT: `const lines = require('fs').readFileSync(0, 'utf8').split('\\n');

`,
};
