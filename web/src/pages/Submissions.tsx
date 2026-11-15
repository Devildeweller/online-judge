import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { isPending, SubmissionTable } from '../components/SubmissionTable';
import { ErrorState, Loading, Pagination, usePageTitle } from '../components/ui';
import { api, query } from '../lib/api';
import { LANGUAGES, VERDICT_ORDER, VERDICTS } from '../lib/constants';
import type { Paged, SubmissionSummary } from '../types';
import { useUrlFilters } from './Problems';

export function SubmissionsPage() {
  usePageTitle('Submissions');
  const { user } = useAuth();
  const { params, set, page } = useUrlFilters();
  const mine = !!user && params.get('mine') === '1';
  const verdict = params.get('verdict') ?? '';
  const language = params.get('language') ?? '';
  const username = params.get('username') ?? '';
  const problem = params.get('problem') ?? '';

  const filters = { page, pageSize: 25, mine, verdict, language, username, problem };
  const submissions = useQuery({
    queryKey: ['submissions', filters],
    queryFn: () => api.get<Paged<SubmissionSummary>>(`/submissions${query(filters)}`),
    placeholderData: keepPreviousData,
    // Own submissions update over the socket; this keeps other people's in-flight rows moving too.
    refetchInterval: (q) => (q.state.data?.items.some(isPending) ? 2500 : 15_000),
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Submissions</h1>
          <p>
            {username ? `Submissions by ${username}` : problem ? `Submissions for ${problem}` : 'The most recent submissions, updated live.'}
          </p>
        </div>
      </div>

      <div className="toolbar">
        {user && (
          <label className="check">
            <input type="checkbox" checked={mine} onChange={(e) => set({ mine: e.target.checked ? '1' : null })} />
            Only mine
          </label>
        )}
        <select className="select" aria-label="Verdict" value={verdict} onChange={(e) => set({ verdict: e.target.value || null })}>
          <option value="">Any verdict</option>
          {VERDICT_ORDER.map((v) => (
            <option key={v} value={v}>
              {VERDICTS[v].label}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Language" value={language} onChange={(e) => set({ language: e.target.value || null })}>
          <option value="">Any language</option>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.short}
            </option>
          ))}
        </select>
        {(username || problem || verdict || language) && (
          <button className="btn btn-ghost" onClick={() => set({ verdict: null, language: null, username: null, problem: null })}>
            Clear filters
          </button>
        )}
      </div>

      <div className="card">
        {submissions.isLoading ? (
          <Loading />
        ) : submissions.isError ? (
          <ErrorState error={submissions.error} retry={() => void submissions.refetch()} />
        ) : (
          <>
            <SubmissionTable submissions={submissions.data!.items} emptyTitle="No submissions match" />
            <Pagination page={submissions.data!.page} totalPages={submissions.data!.totalPages} total={submissions.data!.total} onChange={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}
