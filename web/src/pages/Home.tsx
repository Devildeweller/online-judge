import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Countdown, DifficultyBadge, PhaseBadge, StatusMark, usePageTitle } from '../components/ui';
import { api } from '../lib/api';
import { LANGUAGES } from '../lib/constants';
import { formatDateTime, formatSpan, percent } from '../lib/format';
import type { ContestListItem, Paged, ProblemListItem } from '../types';

export function HomePage() {
  usePageTitle(undefined);
  const { user } = useAuth();
  const contests = useQuery({ queryKey: ['contests', 'home'], queryFn: () => api.get<Paged<ContestListItem>>('/contests?pageSize=20') });
  const problems = useQuery({ queryKey: ['problems', 'home'], queryFn: () => api.get<Paged<ProblemListItem>>('/problems?pageSize=6') });

  const open = (contests.data?.items ?? [])
    .filter((c) => c.phase !== 'ENDED')
    .sort((a, b) => (a.phase === b.phase ? a.startTime.localeCompare(b.startTime) : a.phase === 'RUNNING' ? -1 : 1))
    .slice(0, 3);

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="hero">
        <h1>
          Write code. Get a <span className="accent">verdict</span> in seconds.
        </h1>
        <p>
          Practise algorithmic problems, compete in timed contests and watch every submission move through the judge live. Your code runs in an
          isolated sandbox against hidden tests.
        </p>
        <div className="row">
          <Link className="btn btn-primary btn-lg" to="/problems">
            Browse problems
          </Link>
          {user ? (
            <Link className="btn btn-lg" to="/contests">
              View contests
            </Link>
          ) : (
            <Link className="btn btn-lg" to="/register">
              Create an account
            </Link>
          )}
        </div>
      </section>

      <section className="grid cols-4">
        <div className="card stat">
          <div className="stat-value">{problems.data?.total ?? '–'}</div>
          <div className="stat-label">Problems to solve</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{LANGUAGES.length}</div>
          <div className="stat-label">Languages: {LANGUAGES.map((l) => l.short).join(', ')}</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{contests.data ? contests.data.items.filter((c) => c.phase === 'RUNNING').length : '–'}</div>
          <div className="stat-label">Contests running now</div>
        </div>
        <div className="card stat">
          <div className="stat-value">ICPC</div>
          <div className="stat-label">Scoring with live leaderboards</div>
        </div>
      </section>

      {open.length > 0 && (
        <section>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h2>Contests</h2>
            <Link to="/contests">All contests →</Link>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            {open.map((contest) => (
              <div key={contest.id} className="card contest-card">
                <div>
                  <h3>
                    <Link to={`/contests/${contest.slug}`}>{contest.title}</Link> <PhaseBadge phase={contest.phase} />
                  </h3>
                  <div className="contest-meta">
                    <span>{formatDateTime(contest.startTime)}</span>
                    <span>{formatSpan(contest.startTime, contest.endTime)}</span>
                    <span>{contest.participants} registered</span>
                  </div>
                </div>
                <div className="row">
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {contest.phase === 'RUNNING' ? 'Ends in' : 'Starts in'}
                  </span>
                  <Countdown to={contest.phase === 'RUNNING' ? contest.endTime : contest.startTime} onElapsed={() => void contests.refetch()} />
                  <Link className="btn btn-primary btn-sm" to={`/contests/${contest.slug}`}>
                    {contest.phase === 'RUNNING' ? 'Enter' : 'Details'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid cols-2">
        <div className="card">
          <div className="card-header">
            <h2>Start here</h2>
            <Link to="/problems">All problems →</Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {(problems.data?.items ?? []).map((problem) => (
                  <tr key={problem.id}>
                    <td style={{ width: 36 }}>
                      <StatusMark status={problem.status} />
                    </td>
                    <td>
                      <Link className="title-link" to={`/problems/${problem.slug}`}>
                        {problem.title}
                      </Link>
                    </td>
                    <td>
                      <DifficultyBadge difficulty={problem.difficulty} />
                    </td>
                    <td className="right muted num hide-sm">{percent(problem.acceptedCount, problem.submissionCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-body">
          <h2 style={{ marginBottom: 16 }}>How judging works</h2>
          <div className="stack steps">
            <div className="step">
              <strong>Submit</strong>
              <p>Your code is stored and placed on a Redis-backed queue. The page updates over a WebSocket, no refreshing.</p>
            </div>
            <div className="step">
              <strong>Sandbox</strong>
              <p>A worker compiles and runs it in a throwaway Docker container with no network, a read-only filesystem and strict CPU, memory and process limits.</p>
            </div>
            <div className="step">
              <strong>Verdict</strong>
              <p>Output is checked test by test. You see progress as it happens, then the verdict, time and memory. Contest standings update at once.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
