import { Link } from 'react-router-dom';
import { STATUS_LABEL, VERDICTS } from '../lib/constants';
import { formatMemory, formatTime } from '../lib/format';
import type { SubmissionDetail, TestResult } from '../types';

export function TestGrid({ results }: { results: TestResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="test-grid">
      {results.map((r) => {
        const info = VERDICTS[r.verdict];
        return (
          <div key={r.position} className={`test-cell ${info.tone}`} title={`Test ${r.position}: ${info.label}`}>
            <b>
              #{r.position} <span className={`tone-${info.tone}`}>{info.short}</span>
            </b>
            <span className="muted num">
              {formatTime(r.timeMs)} · {formatMemory(r.memoryKb)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Live view of one submission: progress while it is judged, then the verdict and diagnostics. */
export function SubmissionResult({ submission, compact = false }: { submission: SubmissionDetail; compact?: boolean }) {
  const done = submission.status === 'COMPLETED' && submission.verdict !== null;
  const total = Math.max(1, submission.totalTests);
  const progress = Math.round((submission.passedTests / total) * 100);

  if (!done) {
    return (
      <div>
        <div className="verdict-hero">
          <span className="verdict-name">
            <span className="spinner" aria-hidden="true" style={{ marginRight: 10, verticalAlign: '-3px' }} />
            {STATUS_LABEL[submission.status]}
            {submission.status === 'RUNNING' && ` test ${Math.min(submission.passedTests + 1, submission.totalTests)} of ${submission.totalTests}`}
          </span>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${submission.status === 'RUNNING' ? progress : 0}%` }} />
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          {submission.status === 'QUEUED'
            ? 'Waiting for a free judge worker.'
            : submission.status === 'COMPILING'
              ? 'Compiling your code inside the sandbox.'
              : 'Running your program against the test cases.'}
        </p>
      </div>
    );
  }

  const info = VERDICTS[submission.verdict!];
  const accepted = submission.verdict === 'ACCEPTED';
  return (
    <div>
      <div className="verdict-hero">
        <span className={`verdict-name tone-${info.tone}`}>{info.label}</span>
        {submission.verdict !== 'COMPILATION_ERROR' && submission.verdict !== 'INTERNAL_ERROR' && (
          <span className="muted num">
            {submission.passedTests}/{submission.totalTests} tests · {formatTime(submission.timeMs)} · {formatMemory(submission.memoryKb)}
          </span>
        )}
        {compact && <Link to={`/submissions/${submission.id}`}>Submission #{submission.id}</Link>}
      </div>
      <div className={`progress ${accepted ? 'ok' : info.tone === 'warn' ? 'warn' : 'bad'}`}>
        <span style={{ width: `${accepted ? 100 : Math.max(progress, 2)}%` }} />
      </div>

      {submission.failedTest !== null && !accepted && (
        <p style={{ fontSize: '0.92rem' }}>
          Failed on test <strong>#{submission.failedTest}</strong>. Judging stops at the first failing test.
        </p>
      )}

      {submission.compileOutput && (
        <>
          <div className="section-title">{submission.verdict === 'COMPILATION_ERROR' ? 'Compiler output' : 'Compiler warnings'}</div>
          <pre className={`codeblock wrap ${submission.verdict === 'COMPILATION_ERROR' ? 'error' : ''}`}>{submission.compileOutput}</pre>
        </>
      )}
      {submission.errorMessage && (
        <>
          <div className="section-title">Error output</div>
          <pre className="codeblock wrap error">{submission.errorMessage}</pre>
        </>
      )}
      {!compact && submission.results.length > 0 && (
        <>
          <div className="section-title">Test results</div>
          <TestGrid results={submission.results} />
        </>
      )}
    </div>
  );
}
