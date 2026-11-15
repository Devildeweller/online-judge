import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, errorMessage } from '../lib/api';
import { DIFFICULTIES, STATUS_LABEL, VERDICTS } from '../lib/constants';
import { formatDuration } from '../lib/format';
import type { ContestPhase, Difficulty, ProblemStatus, SubmissionStatus, Verdict } from '../types';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="empty">
      <strong>{notFound ? 'Not found' : 'Could not load this'}</strong>
      <p>{errorMessage(error)}</p>
      {retry && !notFound && (
        <button className="btn btn-sm" onClick={retry}>
          Try again
        </button>
      )}
      {notFound && (
        <Link className="btn btn-sm" to="/">
          Back to home
        </Link>
      )}
    </div>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const info = DIFFICULTIES[difficulty];
  return <span className={`badge ${info.tone}`}>{info.label}</span>;
}

export function VerdictBadge({ status, verdict }: { status: SubmissionStatus; verdict: Verdict | null }) {
  if (status !== 'COMPLETED' || !verdict) {
    return (
      <span className="badge accent">
        <span className="dot pulse" />
        {STATUS_LABEL[status]}
      </span>
    );
  }
  const info = VERDICTS[verdict];
  return <span className={`badge ${info.tone === 'muted' ? '' : info.tone}`}>{info.label}</span>;
}

export function StatusMark({ status }: { status: ProblemStatus }) {
  if (status === 'SOLVED') {
    return (
      <span className="status-mark solved" title="Solved" aria-label="Solved">
        ✓
      </span>
    );
  }
  if (status === 'ATTEMPTED') {
    return (
      <span className="status-mark attempted" title="Attempted" aria-label="Attempted">
        ~
      </span>
    );
  }
  return <span className="status-mark" aria-hidden="true" />;
}

export function PhaseBadge({ phase }: { phase: ContestPhase }) {
  if (phase === 'RUNNING') {
    return (
      <span className="badge ok">
        <span className="dot pulse" />
        Live
      </span>
    );
  }
  return <span className={`badge ${phase === 'UPCOMING' ? 'accent' : ''}`}>{phase === 'UPCOMING' ? 'Upcoming' : 'Ended'}</span>;
}

export function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (page: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="pagination">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="row">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Re-renders once a second. Returns the current time in milliseconds. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function Countdown({ to, onElapsed }: { to: string; onElapsed?: () => void }) {
  const now = useNow();
  const remaining = new Date(to).getTime() - now;
  const elapsed = remaining <= 0;
  useEffect(() => {
    if (elapsed) onElapsed?.();
    // Only fire on the transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);
  return <span className="countdown">{formatDuration(remaining)}</span>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · CodeJudge` : 'CodeJudge';
  }, [title]);
}
