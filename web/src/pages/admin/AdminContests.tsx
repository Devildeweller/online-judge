import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { Empty, ErrorState, Loading, PhaseBadge } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, formatSpan } from '../../lib/format';
import type { ContestListItem, Paged } from '../../types';

export function AdminContests() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const contests = useQuery({ queryKey: ['contests', 'admin'], queryFn: () => api.get<Paged<ContestListItem>>('/contests?pageSize=100') });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/contests/${id}`),
    onSuccess: () => {
      toast.success('Contest deleted');
      void queryClient.invalidateQueries({ queryKey: ['contests'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rebuild = useMutation({
    mutationFn: (id: number) => api.post(`/admin/contests/${id}/rebuild-leaderboard`),
    onSuccess: () => {
      toast.success('Leaderboard rebuilt from submissions');
      void queryClient.invalidateQueries({ queryKey: ['contest-board'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Contests</h1>
          <p>Schedule rounds and choose their problem sets.</p>
        </div>
        <Link className="btn btn-primary" to="/admin/contests/new">
          New contest
        </Link>
      </div>

      <div className="card">
        {contests.isLoading ? (
          <Loading />
        ) : contests.isError ? (
          <ErrorState error={contests.error} retry={() => void contests.refetch()} />
        ) : contests.data!.items.length === 0 ? (
          <Empty title="No contests yet">Create the first one.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contest</th>
                  <th>Status</th>
                  <th>Starts</th>
                  <th>Length</th>
                  <th className="right">Problems</th>
                  <th className="right">Registered</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contests.data!.items.map((contest) => (
                  <tr key={contest.id}>
                    <td>
                      <Link className="title-link" to={`/admin/contests/${contest.id}`}>
                        {contest.title}
                      </Link>
                      {!contest.isPublic && <span className="badge" style={{ marginLeft: 8 }}>Hidden</span>}
                    </td>
                    <td>
                      <PhaseBadge phase={contest.phase} />
                    </td>
                    <td className="nowrap">{formatDateTime(contest.startTime)}</td>
                    <td className="nowrap">{formatSpan(contest.startTime, contest.endTime)}</td>
                    <td className="right num">{contest.problemCount}</td>
                    <td className="right num">{contest.participants}</td>
                    <td className="right nowrap">
                      <Link className="btn btn-sm btn-ghost" to={`/contests/${contest.slug}`}>
                        View
                      </Link>
                      <button className="btn btn-sm btn-ghost" disabled={rebuild.isPending} onClick={() => rebuild.mutate(contest.id)} title="Recompute standings from the submissions table">
                        Rebuild board
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete "${contest.title}" and its registrations? Submissions are kept as practice submissions. This cannot be undone.`)) {
                            remove.mutate(contest.id);
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
        )}
      </div>
    </>
  );
}
