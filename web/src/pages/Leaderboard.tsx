import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Empty, ErrorState, Loading, Pagination, usePageTitle } from '../components/ui';
import { api, query } from '../lib/api';
import { formatDate, percent } from '../lib/format';
import type { GlobalRow, Paged } from '../types';
import { useUrlFilters } from './Problems';

export function LeaderboardPage() {
  usePageTitle('Leaderboard');
  const { user } = useAuth();
  const { set, page } = useUrlFilters();
  const board = useQuery({
    queryKey: ['leaderboard', page],
    queryFn: () => api.get<Paged<GlobalRow>>(`/leaderboard${query({ page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Leaderboard</h1>
          <p>Everyone ranked by the number of distinct problems solved.</p>
        </div>
      </div>
      <div className="card">
        {board.isLoading ? (
          <Loading />
        ) : board.isError ? (
          <ErrorState error={board.error} retry={() => void board.refetch()} />
        ) : board.data!.items.length === 0 ? (
          <Empty title="No one is ranked yet" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Rank</th>
                    <th>User</th>
                    <th className="right">Solved</th>
                    <th className="right">Submissions</th>
                    <th className="right hide-sm">Acceptance</th>
                    <th className="right hide-sm">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {board.data!.items.map((row) => (
                    <tr key={row.userId} className={row.userId === user?.id ? 'highlight' : undefined}>
                      <td className={`rank ${row.rank <= 3 && row.solved > 0 ? 'top' : ''}`}>{row.rank}</td>
                      <td>
                        <Link className="title-link" to={`/users/${row.username}`}>
                          {row.username}
                        </Link>
                      </td>
                      <td className="right num">
                        <strong>{row.solved}</strong>
                      </td>
                      <td className="right num">{row.submissions}</td>
                      <td className="right num muted hide-sm">{percent(row.accepted, row.submissions)}</td>
                      <td className="right muted nowrap hide-sm">{formatDate(row.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={board.data!.page} totalPages={board.data!.totalPages} total={board.data!.total} onChange={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}
