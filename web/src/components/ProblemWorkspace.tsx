import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage, query } from '../lib/api';
import { LANGUAGES, languageName, TEMPLATES, TIME_FACTORS, VERDICTS } from '../lib/constants';
import { formatMemory, formatTime, percent } from '../lib/format';
import type { Language, Paged, ProblemDetail, RunResult, SubmissionDetail, SubmissionSummary } from '../types';
import { CodeEditor } from './CodeEditor';
import { Markdown } from './Markdown';
import { SubmissionResult } from './SubmissionResult';
import { isPending, SubmissionTable } from './SubmissionTable';
import { useToast } from './Toast';
import { CopyButton, DifficultyBadge, Loading, StatusMark } from './ui';

export interface ContestContext {
  id: number;
  slug: string;
  title: string;
  label: string;
  running: boolean;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or disabled: drafts just are not kept.
  }
};

const isLanguage = (value: string | null): value is Language => LANGUAGES.some((l) => l.id === value);

function Statement({ problem }: { problem: ProblemDetail }) {
  return (
    <>
      <div className="problem-title">
        <h1>{problem.title}</h1>
        <DifficultyBadge difficulty={problem.difficulty} />
        <StatusMark status={problem.status} />
        {!problem.isPublic && <span className="badge">Unpublished</span>}
      </div>
      <div className="limits">
        <span>
          Time limit <strong>{formatTime(problem.timeLimitMs)}</strong>
        </span>
        <span>
          Memory limit <strong>{problem.memoryLimitMb} MB</strong>
        </span>
        <span>
          {problem.submissionCount === 0 ? (
            'No submissions yet'
          ) : (
            <>
              Accepted <strong>{percent(problem.acceptedCount, problem.submissionCount)}</strong> of {problem.submissionCount} submissions
            </>
          )}
        </span>
      </div>

      <Markdown>{problem.statement}</Markdown>

      {problem.inputFormat && (
        <>
          <div className="section-title">Input</div>
          <Markdown>{problem.inputFormat}</Markdown>
        </>
      )}
      {problem.outputFormat && (
        <>
          <div className="section-title">Output</div>
          <Markdown>{problem.outputFormat}</Markdown>
        </>
      )}
      {problem.constraints && (
        <>
          <div className="section-title">Constraints</div>
          <Markdown>{problem.constraints}</Markdown>
        </>
      )}

      {problem.samples.map((sample, index) => (
        <div key={sample.position}>
          <div className="section-title">Example {problem.samples.length > 1 ? index + 1 : ''}</div>
          <div className="sample">
            <div className="sample-box">
              <div className="sample-head">
                Input <CopyButton text={sample.input} />
              </div>
              <pre>{sample.input}</pre>
            </div>
            <div className="sample-box">
              <div className="sample-head">
                Output <CopyButton text={sample.expectedOutput} />
              </div>
              <pre>{sample.expectedOutput}</pre>
            </div>
          </div>
          {sample.explanation && <Markdown>{sample.explanation}</Markdown>}
        </div>
      ))}

      <div className="section-title">Notes</div>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Read from standard input and write to standard output. The time limit is scaled per language: ×{TIME_FACTORS.JAVA} for Java and
        JavaScript, ×{TIME_FACTORS.PYTHON} for Python.
        {problem.checker === 'FLOAT' && ' Answers are compared with an absolute or relative tolerance of 1e-6.'}
        {problem.checker === 'TOKENS' && ' Whitespace and line breaks in your output are ignored.'}
      </p>
      {problem.tags.length > 0 && (
        <p>
          {problem.tags.map((tag) => (
            <Link key={tag} className="tag" to={`/problems?tag=${encodeURIComponent(tag)}`}>
              {tag}
            </Link>
          ))}
        </p>
      )}
    </>
  );
}

function RunOutput({ result }: { result: RunResult }) {
  const failed = result.status !== 'OK';
  return (
    <div>
      <div className="verdict-hero">
        <span className={`verdict-name ${failed ? `tone-${VERDICTS[result.status as keyof typeof VERDICTS].tone}` : 'tone-ok'}`}>
          {failed ? VERDICTS[result.status as keyof typeof VERDICTS].label : 'Finished'}
        </span>
        {result.timeMs !== null && (
          <span className="muted num">
            {formatTime(result.timeMs)} · {formatMemory(result.memoryKb)}
            {result.exitCode ? ` · exit code ${result.exitCode}` : ''}
          </span>
        )}
      </div>
      {result.compileOutput && (
        <>
          <div className="section-title">Compiler output</div>
          <pre className={`codeblock wrap ${result.status === 'COMPILATION_ERROR' ? 'error' : ''}`}>{result.compileOutput}</pre>
        </>
      )}
      {result.status !== 'COMPILATION_ERROR' && (
        <>
          <div className="section-title">Output</div>
          <pre className="codeblock">{result.stdout || <span className="muted">(no output)</span>}</pre>
        </>
      )}
      {result.stderr && (
        <>
          <div className="section-title">Error output</div>
          <pre className="codeblock wrap error">{result.stderr}</pre>
        </>
      )}
    </div>
  );
}

export function ProblemWorkspace({ problem, contest }: { problem: ProblemDetail; contest?: ContestContext }) {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [language, setLanguage] = useState<Language>(() => {
    const saved = read('oj:language');
    return isLanguage(saved) ? saved : 'CPP';
  });
  const draftKey = `oj:code:${problem.id}:${language}`;
  const [code, setCode] = useState(() => read(draftKey) ?? TEMPLATES[language]);
  const [leftTab, setLeftTab] = useState<'statement' | 'submissions'>('statement');
  const [consoleTab, setConsoleTab] = useState<'input' | 'result'>('input');
  const [stdin, setStdin] = useState(problem.samples[0]?.input ?? '');
  const [runId, setRunId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [showing, setShowing] = useState<'run' | 'submission' | null>(null);

  // Each language keeps its own draft per problem.
  useEffect(() => {
    setCode(read(draftKey) ?? TEMPLATES[language]);
  }, [draftKey, language]);

  useEffect(() => {
    const timer = window.setTimeout(() => write(draftKey, code), 400);
    return () => window.clearTimeout(timer);
  }, [draftKey, code]);

  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.get<{ pending: boolean; result?: RunResult }>(`/run/${runId}`),
    enabled: runId !== null,
    // The result normally arrives over the socket; polling covers a dropped connection.
    refetchInterval: (q) => (q.state.data?.pending === false ? false : 1500),
    staleTime: Infinity,
  });

  const submission = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => api.get<{ submission: SubmissionDetail }>(`/submissions/${submissionId}`),
    enabled: submissionId !== null,
    refetchInterval: (q) => (q.state.data && !isPending(q.state.data.submission) ? false : 2000),
  });

  const mySubmissions = useQuery({
    queryKey: ['submissions', { mine: true, problem: problem.slug, pageSize: 20 }],
    queryFn: () => api.get<Paged<SubmissionSummary>>(`/submissions${query({ mine: true, problem: problem.slug, pageSize: 20 })}`),
    enabled: !!user && leftTab === 'submissions',
    refetchInterval: (q) => (q.state.data?.items.some(isPending) ? 2500 : false),
  });

  const runMutation = useMutation({
    mutationFn: () => api.post<{ runId: string }>('/run', { language, sourceCode: code, stdin }),
    onSuccess: ({ runId: id }) => {
      setRunId(id);
      setShowing('run');
      setConsoleTab('result');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post<{ submission: SubmissionSummary }>('/submissions', {
        problemId: problem.id,
        language,
        sourceCode: code,
        contestId: contest?.running ? contest.id : null,
      }),
    onSuccess: ({ submission: created }) => {
      setSubmissionId(created.id);
      setShowing('submission');
      setConsoleTab('result');
      void queryClient.invalidateQueries({ queryKey: ['submissions'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const runPending = runMutation.isPending || (showing === 'run' && runId !== null && run.data?.pending !== false);
  const judging = submitMutation.isPending || (submission.data ? isPending(submission.data.submission) : submissionId !== null && submission.isLoading);
  const effectiveLimit = useMemo(() => formatTime(problem.timeLimitMs * TIME_FACTORS[language]), [problem.timeLimitMs, language]);
  const problemPath = contest ? `/contests/${contest.slug}/problems/${contest.label}` : `/problems/${problem.slug}`;

  return (
    <div className="workspace">
      <section className="pane" aria-label="Problem">
        <div className="pane-head">
          {contest && (
            <Link to={`/contests/${contest.slug}?tab=problems`} className="badge accent" title={contest.title}>
              ← {contest.title} · {contest.label}
            </Link>
          )}
          <div className="tabs" role="tablist">
            <button className={`tab ${leftTab === 'statement' ? 'active' : ''}`} role="tab" aria-selected={leftTab === 'statement'} onClick={() => setLeftTab('statement')}>
              Description
            </button>
            <button className={`tab ${leftTab === 'submissions' ? 'active' : ''}`} role="tab" aria-selected={leftTab === 'submissions'} onClick={() => setLeftTab('submissions')}>
              My submissions
            </button>
          </div>
        </div>
        <div className="pane-scroll">
          {leftTab === 'statement' ? (
            <Statement problem={problem} />
          ) : !user ? (
            <div className="empty">
              <strong>Sign in to see your submissions</strong>
              <Link className="btn btn-primary btn-sm" to="/login" state={{ from: location.pathname }}>
                Sign in
              </Link>
            </div>
          ) : mySubmissions.isLoading ? (
            <Loading />
          ) : (
            <SubmissionTable
              submissions={mySubmissions.data?.items ?? []}
              showUser={false}
              showProblem={false}
              emptyTitle="You have not submitted a solution to this problem yet"
            />
          )}
        </div>
      </section>

      <section className="pane" aria-label="Editor">
        <div className="pane-head">
          <label className="sr-only" htmlFor="language">
            Language
          </label>
          <select
            id="language"
            className="select"
            style={{ width: 'auto' }}
            value={language}
            onChange={(e) => {
              const next = e.target.value as Language;
              write(draftKey, code);
              write('oj:language', next);
              setLanguage(next);
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <span className="muted hide-sm" style={{ fontSize: '0.82rem' }}>
            Limit for {languageName(language, true)}: {effectiveLimit}
          </span>
          <span style={{ flex: 1 }} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (code === TEMPLATES[language] || window.confirm('Replace your code with the starter template?')) setCode(TEMPLATES[language]);
            }}
          >
            Reset
          </button>
        </div>

        <div className="editor-host">
          <CodeEditor language={language} value={code} onChange={setCode} />
        </div>

        <div className="console">
          <div className="pane-head" style={{ minHeight: 40 }}>
            <div className="tabs" role="tablist">
              <button className={`tab ${consoleTab === 'input' ? 'active' : ''}`} role="tab" aria-selected={consoleTab === 'input'} onClick={() => setConsoleTab('input')}>
                Custom input
              </button>
              <button className={`tab ${consoleTab === 'result' ? 'active' : ''}`} role="tab" aria-selected={consoleTab === 'result'} onClick={() => setConsoleTab('result')}>
                Result
              </button>
            </div>
          </div>
          <div className="console-body">
            {consoleTab === 'input' ? (
              <>
                <label className="sr-only" htmlFor="stdin">
                  Custom input
                </label>
                <textarea
                  id="stdin"
                  className="textarea mono"
                  style={{ height: '100%', minHeight: 90, resize: 'none' }}
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  placeholder="Input passed to your program when you press Run"
                  spellCheck={false}
                />
              </>
            ) : showing === 'run' ? (
              run.data?.pending === false && run.data.result ? (
                <RunOutput result={run.data.result} />
              ) : (
                <Loading label="Running your code" />
              )
            ) : showing === 'submission' ? (
              submission.data ? (
                <SubmissionResult submission={submission.data.submission} compact />
              ) : submission.isError ? (
                <div className="alert alert-error">{errorMessage(submission.error)}</div>
              ) : (
                <Loading label="Submitting" />
              )
            ) : (
              <p className="muted">Run your code against the custom input, or submit it to be judged on the full test set.</p>
            )}
          </div>
          <div className="console-actions">
            {user ? (
              <>
                {contest && !contest.running && <span className="muted" style={{ fontSize: '0.82rem' }}>Practice mode: the contest is over</span>}
                <span style={{ flex: 1 }} />
                <button className="btn" disabled={runPending || code.trim().length === 0} onClick={() => runMutation.mutate()}>
                  {runPending ? 'Running…' : 'Run'}
                </button>
                <button className="btn btn-success" disabled={judging || code.trim().length === 0} onClick={() => submitMutation.mutate()}>
                  {judging ? 'Judging…' : 'Submit'}
                </button>
              </>
            ) : (
              <>
                <span className="muted" style={{ fontSize: '0.88rem' }}>
                  Sign in to run and submit code.
                </span>
                <span style={{ flex: 1 }} />
                <Link className="btn btn-primary" to="/login" state={{ from: problemPath }}>
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
