export type Role = 'USER' | 'ADMIN';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type Language = 'CPP' | 'PYTHON' | 'JAVA' | 'JAVASCRIPT';
export type CheckerType = 'LINES' | 'TOKENS' | 'FLOAT';
export type SubmissionStatus = 'QUEUED' | 'COMPILING' | 'RUNNING' | 'COMPLETED';
export type Verdict =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'COMPILATION_ERROR'
  | 'INTERNAL_ERROR';
export type ProblemStatus = 'SOLVED' | 'ATTEMPTED' | null;
export type ContestPhase = 'UPCOMING' | 'RUNNING' | 'ENDED';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  solvedCount: number;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

export interface ProblemListItem {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  acceptedCount: number;
  submissionCount: number;
  isPublic: boolean;
  status: ProblemStatus;
}

export interface Sample {
  position: number;
  input: string;
  expectedOutput: string;
  explanation: string | null;
}

export interface ProblemDetail extends Omit<ProblemListItem, 'status'> {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  checker: CheckerType;
  author: { username: string };
  samples: Sample[];
  status: ProblemStatus;
}

export interface SubmissionSummary {
  id: number;
  language: Language;
  status: SubmissionStatus;
  verdict: Verdict | null;
  timeMs: number | null;
  memoryKb: number | null;
  passedTests: number;
  totalTests: number;
  contestId: number | null;
  createdAt: string;
  user: { id: number; username: string };
  problem: { id: number; slug: string; title: string };
}

export interface TestResult {
  position: number;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
}

export interface SubmissionDetail extends SubmissionSummary {
  failedTest: number | null;
  judgedAt: string | null;
  canViewSource: boolean;
  sourceCode: string | null;
  compileOutput: string | null;
  errorMessage: string | null;
  results: TestResult[];
}

/** Pushed over the socket while a submission is being judged. */
export interface SubmissionUpdate {
  id: number;
  userId: number;
  problemId: number;
  contestId: number | null;
  status: SubmissionStatus;
  verdict: Verdict | null;
  passedTests: number;
  totalTests: number;
  timeMs: number | null;
  memoryKb: number | null;
}

export interface RunResult {
  runId: string;
  status: 'OK' | Verdict;
  stdout: string;
  stderr: string;
  compileOutput: string | null;
  timeMs: number | null;
  memoryKb: number | null;
  exitCode: number | null;
}

export interface ContestListItem {
  id: number;
  slug: string;
  title: string;
  startTime: string;
  endTime: string;
  isPublic: boolean;
  phase: ContestPhase;
  participants: number;
  problemCount: number;
  registered: boolean;
}

export interface ContestProblem {
  label: string;
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  solvers: number;
  status: ProblemStatus;
}

export interface ProblemCell {
  wrongAttempts: number;
  solved: boolean;
  solvedAtMinutes: number | null;
}

export interface ContestRow {
  rank: number;
  userId: number;
  username: string;
  solved: number;
  penalty: number;
  problems: Record<string, ProblemCell>;
}

export interface ContestDetail extends Omit<ContestListItem, 'problemCount'> {
  description: string;
  penaltyMinutes: number;
  problemCount: number;
  myStanding: ContestRow | null;
  problems: ContestProblem[] | null;
}

export interface ContestBoard extends Paged<ContestRow> {
  problems: { label: string; problemId: number; slug: string }[];
  me: ContestRow | null;
  phase: ContestPhase;
}

export interface GlobalRow {
  rank: number;
  userId: number;
  username: string;
  solved: number;
  submissions: number;
  accepted: number;
  joinedAt: string;
}

export interface UserProfile {
  id: number;
  username: string;
  bio: string | null;
  role: Role;
  solvedCount: number;
  createdAt: string;
  rank: number | null;
  contests: number;
  stats: {
    submissions: number;
    accepted: number;
    difficulty: Record<Difficulty, { solved: number; total: number }>;
    verdicts: Partial<Record<Verdict, number>>;
    languages: Partial<Record<Language, number>>;
  };
  solvedProblems: { id: number; slug: string; title: string; difficulty: Difficulty }[];
  activity: { day: string; count: number }[];
}

export interface LanguageInfo {
  id: Language;
  name: string;
  timeFactor: number;
  memoryOverheadMb: number;
}

export interface Meta {
  languages: LanguageInfo[];
  limits: { maxSourceBytes: number; runTimeLimitMs: number; runMemoryLimitMb: number };
}

// --- admin -------------------------------------------------------------------------------------

export interface AdminTestCase {
  position?: number;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  explanation: string | null;
}

export interface AdminProblem {
  id: number;
  slug: string;
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  checker: CheckerType;
  isPublic: boolean;
  testCases: AdminTestCase[];
}

export interface AdminContest {
  id: number;
  slug: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  penaltyMinutes: number;
  isPublic: boolean;
  problems: { label: string; problem: { id: number; slug: string; title: string; difficulty: Difficulty; isPublic: boolean } }[];
}

export interface AdminStats {
  totals: { users: number; problems: number; publicProblems: number; contests: number; submissions: number; submissionsLastDay: number };
  verdicts: Partial<Record<Verdict, number>>;
  languages: Partial<Record<Language, number>>;
  queue: { waiting: number; active: number; delayed: number; failed: number; completed: number };
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  solvedCount: number;
  createdAt: string;
  submissions: number;
}
