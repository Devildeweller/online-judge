import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DifficultyBadge, Empty, ErrorState, Loading, Pagination, StatusMark, usePageTitle } from '../components/ui';
import { api, query } from '../lib/api';
import { formatNumber, percent } from '../lib/format';
import type { Paged, ProblemListItem } from '../types';

/** Filters live in the URL so a filtered list can be bookmarked and shared. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { params, set, page: Math.max(1, Number(params.get('page')) || 1) };
}

export function ProblemsPage() {
  usePageTitle('Problems');
  const { user } = useAuth();
  const { params, set, page } = useUrlFilters();
  const search = params.get('search') ?? '';
  const difficulty = params.get('difficulty') ?? '';
  const tag = params.get('tag') ?? '';
  const status = user ? (params.get('status') ?? '') : '';

  const [searchText, setSearchText] = useState(search);
  useEffect(() => setSearchText(search), [search]);
  useEffect(() => {
    if (searchText === search) return;
    const timer = window.setTimeout(() => set({ search: searchText.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const filters = { page, pageSize: 25, search, difficulty, tag, status };
  const problems = useQuery({
    queryKey: ['problems', filters],
    queryFn: () => api.get<Paged<ProblemListItem>>(`/problems${query(filters)}`),
    placeholderData: keepPreviousData,
  });
  const tags = useQuery({ queryKey: ['problems', 'tags'], queryFn: () => api.get<{ tags: { tag: string; count: number }[] }>('/problems/tags'), staleTime: 300_000 });

  const filtered = Boolean(search || difficulty || tag || status);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Problems</h1>
          <p>Pick a problem, write a solution and submit it to the judge.</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="input grow" type="search" placeholder="Search by title" aria-label="Search problems" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        <select className="select" aria-label="Difficulty" value={difficulty} onChange={(e) => set({ difficulty: e.target.value || null })}>
          <option value="">Any difficulty</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <select className="select" aria-label="Tag" value={tag} onChange={(e) => set({ tag: e.target.value || null })}>
          <option value="">Any topic</option>
          {tags.data?.tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag} ({t.count})
            </option>
          ))}
        </select>
        {user && (
          <select className="select" aria-label="Progress" value={status} onChange={(e) => set({ status: e.target.value || null })}>
            <option value="">Any progress</option>
            <option value="todo">Not attempted</option>
            <option value="attempted">Attempted</option>
            <option value="solved">Solved</option>
          </select>
        )}
        {filtered && (
          <button className="btn btn-ghost" onClick={() => set({ search: null, difficulty: null, tag: null, status: null })}>
            Clear
          </button>
        )}
      </div>

      <div className="card">
        {problems.isLoading ? (
          <Loading />
        ) : problems.isError ? (
          <ErrorState error={problems.error} retry={() => void problems.refetch()} />
        ) : problems.data!.items.length === 0 ? (
          <Empty title={filtered ? 'No problems match these filters' : 'No problems have been published yet'}>
            {filtered && 'Try removing a filter.'}
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
                      <span className="sr-only">Status</span>
                    </th>
                    <th>Title</th>
                    <th className="hide-sm">Topics</th>
                    <th>Difficulty</th>
                    <th className="right">Acceptance</th>
                    <th className="right hide-sm">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.data!.items.map((problem) => (
                    <tr key={problem.id}>
                      <td>
                        <StatusMark status={problem.status} />
                      </td>
                      <td>
                        <Link className="title-link" to={`/problems/${problem.slug}`}>
                          {problem.title}
                        </Link>
                      </td>
                      <td className="hide-sm">
                        {problem.tags.map((t) => (
                          <button key={t} className="tag" style={{ border: 'none', cursor: 'pointer' }} onClick={() => set({ tag: t })}>
                            {t}
                          </button>
                        ))}
                      </td>
                      <td>
                        <DifficultyBadge difficulty={problem.difficulty} />
                      </td>
                      <td className="right num">{percent(problem.acceptedCount, problem.submissionCount)}</td>
                      <td className="right num muted hide-sm">{formatNumber(problem.acceptedCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={problems.data!.page} totalPages={problems.data!.totalPages} total={problems.data!.total} onChange={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}
