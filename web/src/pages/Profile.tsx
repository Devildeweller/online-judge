import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SubmissionTable } from '../components/SubmissionTable';
import { useToast } from '../components/Toast';
import { ErrorState, Loading, usePageTitle } from '../components/ui';
import { api, errorMessage, query } from '../lib/api';
import { DIFFICULTIES, languageName, VERDICT_ORDER, VERDICTS } from '../lib/constants';
import { formatDate, percent } from '../lib/format';
import type { Difficulty, Language, Paged, SubmissionSummary, UserProfile } from '../types';

const WEEKS = 26;

/** Submissions per day for the last 26 weeks, GitHub-style: one column per week, Sunday on top. */
function Heatmap({ activity }: { activity: UserProfile['activity'] }) {
  const cells = useMemo(() => {
    const counts = new Map(activity.map((a) => [a.day, a.count]));
    const today = new Date();
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (WEEKS * 7 - 1) - end.getUTCDay());
    const days: { day: string; count: number }[] = [];
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      days.push({ day: key, count: counts.get(key) ?? 0 });
    }
    return days;
  }, [activity]);

  const level = (count: number) => (count === 0 ? '' : count < 3 ? 'l1' : count < 6 ? 'l2' : count < 10 ? 'l3' : 'l4');
  return (
    <div className="heatmap" role="img" aria-label={`Submission activity over the last ${WEEKS} weeks`}>
      {cells.map((cell) => (
        <span key={cell.day} className={level(cell.count)} title={`${cell.day}: ${cell.count} submission${cell.count === 1 ? '' : 's'}`} />
      ))}
    </div>
  );
}

function BioEditor({ profile }: { profile: UserProfile }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(profile.bio ?? '');
  const toast = useToast();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.patch('/users/me', { bio: bio.trim() || null }),
    onSuccess: () => {
      setEditing(false);
      toast.success('Profile updated');
      void queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!editing) {
    return (
      <button className="btn btn-sm" onClick={() => setEditing(true)}>
        Edit bio
      </button>
    );
  }
  return (
    <div style={{ width: '100%', marginTop: 12 }}>
      <label className="sr-only" htmlFor="bio">
        Bio
      </label>
      <textarea id="bio" className="textarea" maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A sentence or two about you" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
          Save
        </button>
        <button className="btn btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          {bio.length}/280
        </span>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { username } = useParams();
  const { user: me } = useAuth();
  usePageTitle(username);

  const result = useQuery({
    queryKey: ['user', username],
    queryFn: () => api.get<{ user: UserProfile }>(`/users/${username}`),
    enabled: !!username,
  });
  const recent = useQuery({
    queryKey: ['submissions', { username, pageSize: 10 }],
    queryFn: () => api.get<Paged<SubmissionSummary>>(`/submissions${query({ username, pageSize: 10 })}`),
    enabled: !!username,
  });

  if (result.isLoading) return <Loading />;
  if (result.isError) return <ErrorState error={result.error} retry={() => void result.refetch()} />;
  const profile = result.data!.user;
  const { stats } = profile;
  const isMe = me?.id === profile.id;
  const verdictTotal = Math.max(1, stats.submissions);

  return (
    <div className="stack">
      <div className="card card-body">
        <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
          <div className="avatar">{profile.username[0]}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1>
              {profile.username} {profile.role === 'ADMIN' && <span className="badge accent">Admin</span>}
            </h1>
            <p className="muted" style={{ margin: '4px 0 8px' }}>
              Joined {formatDate(profile.createdAt)}
              {profile.rank !== null && ` · Global rank #${profile.rank}`}
            </p>
            {profile.bio ? <p style={{ margin: 0 }}>{profile.bio}</p> : isMe && <p className="muted" style={{ margin: 0 }}>Add a short bio so others know who you are.</p>}
          </div>
          {isMe && <BioEditor profile={profile} />}
        </div>
      </div>

      <div className="grid cols-4">
        <div className="card stat">
          <div className="stat-value">{profile.solvedCount}</div>
          <div className="stat-label">Problems solved</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{stats.submissions}</div>
          <div className="stat-label">Submissions</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{percent(stats.accepted, stats.submissions)}</div>
          <div className="stat-label">Acceptance rate</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{profile.contests}</div>
          <div className="stat-label">Contests entered</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card card-body">
          <h2 style={{ marginBottom: 14 }}>Solved by difficulty</h2>
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
            const { solved, total } = stats.difficulty[d];
            return (
              <div className="bar-row" key={d}>
                <span>{DIFFICULTIES[d].label}</span>
                <div className={`progress ${DIFFICULTIES[d].tone}`}>
                  <span style={{ width: `${total === 0 ? 0 : (solved / total) * 100}%` }} />
                </div>
                <span className="right">
                  {solved} / {total}
                </span>
              </div>
            );
          })}
          <h2 style={{ margin: '22px 0 12px' }}>Languages</h2>
          {Object.keys(stats.languages).length === 0 ? (
            <p className="muted">No submissions yet.</p>
          ) : (
            <div className="chip-list">
              {(Object.entries(stats.languages) as [Language, number][]).map(([language, count]) => (
                <span className="chip" key={language}>
                  {languageName(language, true)} <strong className="num">{count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card card-body">
          <h2 style={{ marginBottom: 14 }}>Verdicts</h2>
          {stats.submissions === 0 ? (
            <p className="muted">No judged submissions yet.</p>
          ) : (
            VERDICT_ORDER.filter((v) => stats.verdicts[v]).map((v) => (
              <div className="bar-row" key={v}>
                <span className={`tone-${VERDICTS[v].tone}`} title={VERDICTS[v].label}>
                  {VERDICTS[v].short}
                </span>
                <div className={`progress ${VERDICTS[v].tone === 'ok' ? 'ok' : VERDICTS[v].tone === 'warn' ? 'warn' : VERDICTS[v].tone === 'bad' ? 'bad' : ''}`}>
                  <span style={{ width: `${((stats.verdicts[v] ?? 0) / verdictTotal) * 100}%` }} />
                </div>
                <span className="right">{stats.verdicts[v]}</span>
              </div>
            ))
          )}
          <h2 style={{ margin: '22px 0 12px' }}>Activity</h2>
          <Heatmap activity={profile.activity} />
        </div>
      </div>

      <div className="card card-body">
        <h2 style={{ marginBottom: 12 }}>Solved problems</h2>
        {profile.solvedProblems.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing solved yet. <Link to="/problems">Find a problem to start with.</Link>
          </p>
        ) : (
          <div className="chip-list">
            {profile.solvedProblems.map((problem) => (
              <Link key={problem.id} className="chip" to={`/problems/${problem.slug}`}>
                <i className={`tone-${DIFFICULTIES[problem.difficulty].tone}`} />
                {problem.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Recent submissions</h2>
          <Link to={`/submissions?username=${encodeURIComponent(profile.username)}`}>View all →</Link>
        </div>
        {recent.isLoading ? <Loading /> : <SubmissionTable submissions={recent.data?.items ?? []} showUser={false} />}
      </div>
    </div>
  );
}
