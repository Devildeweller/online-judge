import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Empty, ErrorState, Loading, Pagination } from '../../components/ui';
import { api, errorMessage, query } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { AdminUser, Paged, Role } from '../../types';

export function AdminUsers() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const filters = { page, pageSize: 25, search };
  const users = useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => api.get<Paged<AdminUser>>(`/admin/users${query(filters)}`),
    placeholderData: keepPreviousData,
  });

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) => api.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: (_data, { role }) => {
      toast.success(role === 'ADMIN' ? 'Administrator access granted' : 'Administrator access removed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>Accounts and administrator access. A role change applies the next time that user's session refreshes.</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          type="search"
          placeholder="Search by username or email"
          aria-label="Search users"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card">
        {users.isLoading ? (
          <Loading />
        ) : users.isError ? (
          <ErrorState error={users.error} retry={() => void users.refetch()} />
        ) : users.data!.items.length === 0 ? (
          <Empty title="No users match" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th className="right">Solved</th>
                    <th className="right">Submissions</th>
                    <th>Joined</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data!.items.map((user) => (
                    <tr key={user.id}>
                      <td className="num muted">{user.id}</td>
                      <td>
                        <Link className="title-link" to={`/users/${user.username}`}>
                          {user.username}
                        </Link>
                      </td>
                      <td className="muted">{user.email}</td>
                      <td>{user.role === 'ADMIN' ? <span className="badge accent">Admin</span> : <span className="badge">User</span>}</td>
                      <td className="right num">{user.solvedCount}</td>
                      <td className="right num">{user.submissions}</td>
                      <td className="nowrap muted">{formatDate(user.createdAt)}</td>
                      <td className="right">
                        {user.id === me?.id ? (
                          <span className="muted">You</span>
                        ) : (
                          <button
                            className="btn btn-sm"
                            disabled={setRole.isPending}
                            onClick={() => {
                              const role: Role = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
                              const question = role === 'ADMIN' ? `Give ${user.username} full administrator access?` : `Remove administrator access from ${user.username}?`;
                              if (window.confirm(question)) setRole.mutate({ id: user.id, role });
                            }}
                          >
                            {user.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={users.data!.page} totalPages={users.data!.totalPages} total={users.data!.total} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
