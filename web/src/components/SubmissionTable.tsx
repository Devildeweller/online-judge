import { Link } from 'react-router-dom';
import { languageName } from '../lib/constants';
import { formatDateTime, formatMemory, formatTime, timeAgo } from '../lib/format';
import type { SubmissionSummary } from '../types';
import { Empty, VerdictBadge } from './ui';

interface Props {
  submissions: SubmissionSummary[];
  showUser?: boolean;
  showProblem?: boolean;
  emptyTitle?: string;
  /** Maps a problem to its link; contest pages point at the contest's own problem view. */
  problemHref?: (submission: SubmissionSummary) => string;
}

export const isPending = (submission: { status: string }) => submission.status !== 'COMPLETED';

export function SubmissionTable({ submissions, showUser = true, showProblem = true, emptyTitle = 'No submissions yet', problemHref }: Props) {
  if (submissions.length === 0) return <Empty title={emptyTitle} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>When</th>
            {showUser && <th>User</th>}
            {showProblem && <th>Problem</th>}
            <th>Language</th>
            <th>Verdict</th>
            <th className="right">Time</th>
            <th className="right hide-sm">Memory</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id}>
              <td className="num">
                <Link to={`/submissions/${s.id}`}>{s.id}</Link>
              </td>
              <td className="nowrap muted" title={formatDateTime(s.createdAt)}>
                {timeAgo(s.createdAt)}
              </td>
              {showUser && (
                <td>
                  <Link to={`/users/${s.user.username}`}>{s.user.username}</Link>
                </td>
              )}
              {showProblem && (
                <td>
                  <Link className="title-link" to={problemHref ? problemHref(s) : `/problems/${s.problem.slug}`}>
                    {s.problem.title}
                  </Link>
                </td>
              )}
              <td className="nowrap">{languageName(s.language, true)}</td>
              <td className="nowrap">
                <Link to={`/submissions/${s.id}`} style={{ textDecoration: 'none' }}>
                  <VerdictBadge status={s.status} verdict={s.verdict} />
                </Link>
                {s.status === 'RUNNING' && (
                  <span className="muted num" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                    {s.passedTests}/{s.totalTests}
                  </span>
                )}
              </td>
              <td className="right num nowrap">{formatTime(s.timeMs)}</td>
              <td className="right num nowrap hide-sm">{formatMemory(s.memoryKb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
