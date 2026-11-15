import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Markdown } from '../components/Markdown';
import { isPending, SubmissionTable } from '../components/SubmissionTable';
import { useToast } from '../components/Toast';
import { Countdown, DifficultyBadge, Empty, ErrorState, Loading, Pagination, PhaseBadge, StatusMark, usePageTitle } from '../components/ui';
import { api, errorMessage, query } from '../lib/api';
import { formatDateTime, formatSpan } from '../lib/format';
import { useRoom } from '../lib/socket';
import type { ContestBoard, ContestDetail, ContestRow, Paged, SubmissionSummary } from '../types';

type Tab = 'overview' | 'problems' | 'leaderboard' | 'submissions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'problems', label: 'Problems' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'submissions', label: 'My submissions' },
];

function BoardRow({ row, problems, highlight }: { row: ContestRow; problems: ContestBoard['problems']; highlight: boolean }) {
  return (
    <tr className={highlight ? 'highlight' : undefined}>
      <td className={`rank ${row.rank <= 3 && row.solved > 0 ? 'top' : ''}`}>{row.rank}</td>
      <td>
        <Link className="title-link" to={`/users/${row.username}`}>
          {row.username}
        </Link>
      </td>
      <td className="center num">
        <strong>{row.solved}</strong>
      </td>
      <td className="center num muted">{row.penalty}</td>
      {problems.map((p) => {
        const cell = row.problems[String(p.problemId)];
        return (
          <td key={p.problemId} className="problem-col">
            {!cell ? (
              <span className="muted">·</span>
            ) : cell.solved ? (
              <span className="cell solved" title={`Solved at minute ${cell.solvedAtMinutes}`}>
                +{cell.wrongAttempts > 0 ? cell.wrongAttempts : ''}
                <small>{cell.solvedAtMinutes}′</small>
              </span>
            ) : (
              <span className="cell failed" title={`${cell.wrongAttempts} rejected attempts`}>
                −{cell.wrongAttempts}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function Leaderboard({ contest }: { contest: ContestDetail }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  // The server pushes a signal whenever a verdict changes the standings.
  useRoom('contest', contest.id);

  const board = useQuery({
    queryKey: ['contest-board', contest.id, page],
    queryFn: () => api.get<ContestBoard>(`/contests/${contest.slug}/leaderboard${query({ page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: contest.phase === 'RUNNING' ? 20_000 : false,
  });

  if (board.isLoading) return <Loading />;
  if (board.isError) return <ErrorState error={board.error} retry={() => void board.refetch()} />;
  const data = board.data!;
  if (data.total === 0) return <Empty title="Nobody has registered yet">Be the first on the board.</Empty>;

  const meOnPage = data.me && data.items.some((r) => r.userId === data.me!.userId);
  return (
    <>
      <div className="table-wrap">
        <table className="table board">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Rank</th>
              <th>Participant</th>
              <th className="center">Solved</th>
              <th className="center" title={`Minutes to each accepted solution plus ${contest.penaltyMinutes} per rejected attempt`}>
                Penalty
              </th>
              {data.problems.map((p) => (
                <th key={p.problemId} className="problem-col">
                  <Link to={`/contests/${contest.slug}/problems/${p.label}`}>{p.label}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.me && !meOnPage && <BoardRow row={data.me} problems={data.problems} highlight />}
            {data.items.map((row) => (
              <BoardRow key={row.userId} row={row} problems={data.problems} highlight={row.userId === user?.id} />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
    </>
  );
}

function MySubmissions({ contest }: { contest: ContestDetail }) {
  const filters = { mine: true, contestId: contest.id, pageSize: 50 };
  const submissions = useQuery({
    queryKey: ['submissions', filters],
    queryFn: () => api.get<Paged<SubmissionSummary>>(`/submissions${query(filters)}`),
    refetchInterval: (q) => (q.state.data?.items.some(isPending) ? 2500 : false),
  });
  const labelOf = new Map((contest.problems ?? []).map((p) => [p.id, p.label]));

  if (submissions.isLoading) return <Loading />;
  if (submissions.isError) return <ErrorState error={submissions.error} retry={() => void submissions.refetch()} />;
  return (
    <SubmissionTable
      submissions={submissions.data!.items}
      showUser={false}
      emptyTitle="You have not submitted anything in this contest"
      problemHref={(s) => (labelOf.has(s.problem.id) ? `/contests/${contest.slug}/problems/${labelOf.get(s.problem.id)}` : `/problems/${s.problem.slug}`)}
    />
  );
}

export function ContestPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview') as Tab;

  const result = useQuery({
    queryKey: ['contest', slug],
    queryFn: () => api.get<{ contest: ContestDetail }>(`/contests/${slug}`),
    enabled: !!slug,
  });
  usePageTitle(result.data?.contest.title);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['contest', slug] });
    void queryClient.invalidateQueries({ queryKey: ['contests'] });
    void queryClient.invalidateQueries({ queryKey: ['contest-board'] });
  };

  const registration = useMutation({
    mutationFn: (join: boolean) => (join ? api.post(`/contests/${slug}/register`) : api.delete(`/contests/${slug}/register`)),
    onSuccess: (_data, join) => {
      toast.success(join ? 'You are registered' : 'Registration withdrawn');
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (result.isLoading) return <Loading />;
  if (result.isError) return <ErrorState error={result.error} retry={() => void result.refetch()} />;
  const contest = result.data!.contest;

  return (
    <div className="stack">
      <div className="card contest-hero">
        <div>
          <h1 style={{ marginBottom: 8 }}>
            {contest.title} <PhaseBadge phase={contest.phase} />
          </h1>
          <div className="contest-meta">
            <span>Starts {formatDateTime(contest.startTime)}</span>
            <span>Length {formatSpan(contest.startTime, contest.endTime)}</span>
            <span>{contest.problemCount} problems</span>
            <span>{contest.participants} registered</span>
          </div>
          {contest.myStanding && contest.phase !== 'UPCOMING' && (
            <p style={{ margin: '12px 0 0' }}>
              Your rank: <strong>#{contest.myStanding.rank}</strong> · {contest.myStanding.solved} solved · penalty {contest.myStanding.penalty}
            </p>
          )}
        </div>
        <div className="timer-box">
          {contest.phase !== 'ENDED' && (
            <>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {contest.phase === 'RUNNING' ? 'Time remaining' : 'Starts in'}
              </span>
              <Countdown to={contest.phase === 'RUNNING' ? contest.endTime : contest.startTime} onElapsed={refresh} />
            </>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            {contest.phase === 'ENDED' ? (
              <span className="muted">Final results</span>
            ) : !user ? (
              <Link className="btn btn-primary" to="/login" state={{ from: location.pathname }}>
                Sign in to register
              </Link>
            ) : contest.registered ? (
              <>
                <span className="badge ok">Registered</span>
                {contest.phase === 'UPCOMING' && (
                  <button className="btn btn-sm" disabled={registration.isPending} onClick={() => registration.mutate(false)}>
                    Withdraw
                  </button>
                )}
              </>
            ) : (
              <button className="btn btn-primary" disabled={registration.isPending} onClick={() => registration.mutate(true)}>
                {contest.phase === 'RUNNING' ? 'Register and join' : 'Register'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs" role="tablist" style={{ padding: '0 12px' }}>
          {TABS.filter((t) => t.id !== 'submissions' || user).map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} role="tab" aria-selected={tab === t.id} onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="card-body">
            {contest.description ? <Markdown>{contest.description}</Markdown> : <p className="muted">No description.</p>}
            <div className="section-title">Rules</div>
            <div className="prose">
              <ul>
                <li>Participants are ranked by the number of problems solved, then by lower penalty.</li>
                <li>
                  Each solved problem adds the minutes from the start to its accepted submission, plus {contest.penaltyMinutes} minutes for every
                  rejected attempt before it.
                </li>
                <li>Compilation errors and attempts on problems you never solve cost nothing.</li>
                <li>You need to register before your submissions count. Late registration is allowed while the contest runs.</li>
              </ul>
            </div>
          </div>
        )}

        {tab === 'problems' &&
          (contest.problems === null ? (
            <Empty title="Problems are hidden until the contest starts">Come back when the countdown reaches zero.</Empty>
          ) : contest.problems.length === 0 ? (
            <Empty title="This contest has no problems yet" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
                      <span className="sr-only">Status</span>
                    </th>
                    <th style={{ width: 50 }}>#</th>
                    <th>Problem</th>
                    <th>Difficulty</th>
                    <th className="right">Solved by</th>
                  </tr>
                </thead>
                <tbody>
                  {contest.problems.map((problem) => (
                    <tr key={problem.id}>
                      <td>
                        <StatusMark status={problem.status} />
                      </td>
                      <td>
                        <strong>{problem.label}</strong>
                      </td>
                      <td>
                        <Link className="title-link" to={`/contests/${contest.slug}/problems/${problem.label}`}>
                          {problem.title}
                        </Link>
                      </td>
                      <td>
                        <DifficultyBadge difficulty={problem.difficulty} />
                      </td>
                      <td className="right num">{problem.solvers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'leaderboard' && <Leaderboard contest={contest} />}
        {tab === 'submissions' && user && <MySubmissions contest={contest} />}
      </div>
    </div>
  );
}
