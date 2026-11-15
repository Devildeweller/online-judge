import { useQuery } from '@tanstack/react-query';
import { ErrorState, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { languageName, VERDICT_ORDER, VERDICTS } from '../../lib/constants';
import { formatNumber } from '../../lib/format';
import type { AdminStats, Language } from '../../types';

export function AdminDashboard() {
  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats'),
    refetchInterval: 4000,
  });

  if (stats.isLoading) return <Loading />;
  if (stats.isError) return <ErrorState error={stats.error} retry={() => void stats.refetch()} />;
  const { totals, queue, verdicts, languages } = stats.data!;
  const judged = Math.max(1, Object.values(verdicts).reduce((sum, n) => sum + (n ?? 0), 0));
  const languageTotal = Math.max(1, Object.values(languages).reduce((sum, n) => sum + (n ?? 0), 0));

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1>Dashboard</h1>
          <p>Platform totals and the state of the judge queue, refreshed every few seconds.</p>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="stat-value">{formatNumber(totals.users)}</div>
          <div className="stat-label">Users</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{formatNumber(totals.problems)}</div>
          <div className="stat-label">Problems ({totals.publicProblems} published)</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{formatNumber(totals.contests)}</div>
          <div className="stat-label">Contests</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{formatNumber(totals.submissions)}</div>
          <div className="stat-label">Submissions ({formatNumber(totals.submissionsLastDay)} in 24 h)</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Judge queue</h2>
          <span className={`badge ${queue.active > 0 ? 'ok' : ''}`}>
            {queue.active > 0 && <span className="dot pulse" />}
            {queue.active > 0 ? 'Working' : queue.waiting > 0 ? 'Waiting for a worker' : 'Idle'}
          </span>
        </div>
        <div className="grid cols-4 card-body">
          <div>
            <div className="stat-value">{formatNumber(queue.waiting)}</div>
            <div className="stat-label">Waiting</div>
          </div>
          <div>
            <div className="stat-value">{formatNumber(queue.active)}</div>
            <div className="stat-label">Being judged</div>
          </div>
          <div>
            <div className="stat-value">{formatNumber(queue.delayed)}</div>
            <div className="stat-label">Retrying</div>
          </div>
          <div>
            <div className={`stat-value ${queue.failed > 0 ? 'tone-bad' : ''}`}>{formatNumber(queue.failed)}</div>
            <div className="stat-label">Failed jobs</div>
          </div>
        </div>
        {queue.waiting > 0 && queue.active === 0 && (
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div className="alert alert-warn" style={{ margin: 0 }}>
              Submissions are queued but nothing is being judged. Check that a worker is running (<code>npm run dev:worker</code>) and that Docker
              is up.
            </div>
          </div>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card card-body">
          <h2 style={{ marginBottom: 14 }}>Verdicts</h2>
          {VERDICT_ORDER.map((v) => (
            <div className="bar-row" key={v} style={{ gridTemplateColumns: '170px 1fr 64px' }}>
              <span className={`tone-${VERDICTS[v].tone}`}>{VERDICTS[v].label}</span>
              <div className={`progress ${VERDICTS[v].tone === 'ok' ? 'ok' : VERDICTS[v].tone === 'warn' ? 'warn' : VERDICTS[v].tone === 'bad' ? 'bad' : ''}`}>
                <span style={{ width: `${((verdicts[v] ?? 0) / judged) * 100}%` }} />
              </div>
              <span className="right">{formatNumber(verdicts[v] ?? 0)}</span>
            </div>
          ))}
        </div>
        <div className="card card-body">
          <h2 style={{ marginBottom: 14 }}>Languages</h2>
          {(Object.keys(languages) as Language[]).length === 0 && <p className="muted">No submissions yet.</p>}
          {(Object.entries(languages) as [Language, number][]).map(([language, count]) => (
            <div className="bar-row" key={language} style={{ gridTemplateColumns: '170px 1fr 64px' }}>
              <span>{languageName(language, true)}</span>
              <div className="progress">
                <span style={{ width: `${(count / languageTotal) * 100}%` }} />
              </div>
              <span className="right">{formatNumber(count)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
