import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { DifficultyBadge, Empty, ErrorState, Loading, Pagination } from '../../components/ui';
import { api, errorMessage, query } from '../../lib/api';
import type { Paged, ProblemListItem } from '../../types';

export function AdminProblems() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const filters = { scope: 'all', page, pageSize: 25, search };
  const problems = useQuery({
    queryKey: ['problems', 'admin', filters],
    queryFn: () => api.get<Paged<ProblemListItem>>(`/problems${query(filters)}`),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/problems/${id}`),
    onSuccess: () => {
      toast.success('Problem deleted');
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rejudge = useMutation({
    mutationFn: (id: number) => api.post<{ queued: number }>(`/admin/problems/${id}/rejudge`),
    onSuccess: ({ queued }) => toast.success(queued === 0 ? 'No submissions to rejudge' : `${queued} submission${queued === 1 ? '' : 's'} queued for rejudging`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Problems</h1>
          <p>Create problems, manage test data and control what is published.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/problems/new">
          New problem
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          type="search"
          placeholder="Search by title or slug"
          aria-label="Search problems"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card">
        {problems.isLoading ? (
          <Loading />
        ) : problems.isError ? (
          <ErrorState error={problems.error} retry={() => void problems.refetch()} />
        ) : problems.data!.items.length === 0 ? (
          <Empty title="No problems found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Difficulty</th>
                    <th>Visibility</th>
                    <th className="right">Submissions</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.data!.items.map((problem) => (
                    <tr key={problem.id}>
                      <td className="num muted">{problem.id}</td>
                      <td>
                        <Link className="title-link" to={`/admin/problems/${problem.id}`}>
                          {problem.title}
                        </Link>
                        <div className="muted mono" style={{ fontSize: '0.78rem' }}>
                          {problem.slug}
                        </div>
                      </td>
                      <td>
                        <DifficultyBadge difficulty={problem.difficulty} />
                      </td>
                      <td>{problem.isPublic ? <span className="badge ok">Published</span> : <span className="badge">Hidden</span>}</td>
                      <td className="right num">{problem.submissionCount}</td>
                      <td className="right nowrap">
                        <Link className="btn btn-sm btn-ghost" to={`/problems/${problem.slug}`}>
                          View
                        </Link>
                        <button
                          className="btn btn-sm btn-ghost"
                          disabled={rejudge.isPending}
                          onClick={() => {
                            if (window.confirm(`Rejudge every submission to "${problem.title}"? Verdicts and leaderboards will be recomputed.`)) rejudge.mutate(problem.id);
                          }}
                        >
                          Rejudge
                        </button>
                        <button
                          className="btn btn-sm btn-ghost btn-danger"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete "${problem.title}" together with its test cases and all ${problem.submissionCount} submissions? This cannot be undone.`)) {
                              remove.mutate(problem.id);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={problems.data!.page} totalPages={problems.data!.totalPages} total={problems.data!.total} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
