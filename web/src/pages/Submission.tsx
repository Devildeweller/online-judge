import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CodeEditor } from '../components/CodeEditor';
import { SubmissionResult } from '../components/SubmissionResult';
import { isPending } from '../components/SubmissionTable';
import { useToast } from '../components/Toast';
import { CopyButton, ErrorState, Loading, usePageTitle, VerdictBadge } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { languageName } from '../lib/constants';
import { formatDateTime, formatMemory, formatTime } from '../lib/format';
import type { SubmissionDetail } from '../types';

export function SubmissionPage() {
  const id = Number(useParams().id);
  const { isAdmin } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  usePageTitle(`Submission #${id}`);

  const result = useQuery({
    queryKey: ['submission', id],
    queryFn: () => api.get<{ submission: SubmissionDetail }>(`/submissions/${id}`),
    enabled: Number.isInteger(id) && id > 0,
    refetchInterval: (q) => (q.state.data && !isPending(q.state.data.submission) ? false : 2000),
  });
  const pending = result.data ? isPending(result.data.submission) : false;

  const rejudge = useMutation({
    mutationFn: () => api.post(`/admin/submissions/${id}/rejudge`),
    onSuccess: () => {
      toast.success('Queued for rejudging');
      void queryClient.invalidateQueries({ queryKey: ['submission', id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (result.isLoading) return <Loading />;
  if (result.isError) return <ErrorState error={result.error} retry={() => void result.refetch()} />;
  const s = result.data!.submission;

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1>
            Submission #{s.id} <VerdictBadge status={s.status} verdict={s.verdict} />
          </h1>
          <p>
            <Link to={`/problems/${s.problem.slug}`}>{s.problem.title}</Link> · by <Link to={`/users/${s.user.username}`}>{s.user.username}</Link> ·{' '}
            {formatDateTime(s.createdAt)}
          </p>
        </div>
        {isAdmin && (
          <button className="btn" disabled={rejudge.isPending || pending} onClick={() => rejudge.mutate()}>
            Rejudge
          </button>
        )}
      </div>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="stat-label">Language</div>
          <div style={{ fontWeight: 650 }}>{languageName(s.language)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Time</div>
          <div className="num" style={{ fontWeight: 650 }}>{formatTime(s.timeMs)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Memory</div>
          <div className="num" style={{ fontWeight: 650 }}>{formatMemory(s.memoryKb)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Tests passed</div>
          <div className="num" style={{ fontWeight: 650 }}>
            {s.passedTests} / {s.totalTests}
          </div>
        </div>
      </div>

      <div className="card card-body">
        <SubmissionResult submission={s} />
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Source code</h2>
          {s.sourceCode !== null && <CopyButton text={s.sourceCode} label="Copy code" />}
        </div>
        {s.sourceCode !== null ? (
          <CodeEditor language={s.language} value={s.sourceCode} readOnly height="auto" />
        ) : (
          <div className="empty">
            <strong>Source code is private</strong>
            Only the author and administrators can read a submission's code.
          </div>
        )}
      </div>
    </div>
  );
}
