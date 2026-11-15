import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { DifficultyBadge, ErrorState, Loading } from '../../components/ui';
import { api, errorMessage, query } from '../../lib/api';
import { formatSpan, toLocalInput } from '../../lib/format';
import type { AdminContest, Difficulty, Paged, ProblemListItem } from '../../types';

interface Picked {
  id: number;
  title: string;
  slug: string;
  difficulty: Difficulty;
  isPublic: boolean;
}

interface Draft {
  slug: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  penaltyMinutes: number;
  isPublic: boolean;
  problems: Picked[];
}

const HOUR = 60 * 60 * 1000;

function emptyDraft(): Draft {
  // Default: tomorrow at the next full hour, two hours long.
  const start = new Date(Date.now() + 24 * HOUR);
  start.setMinutes(0, 0, 0);
  return {
    slug: '',
    title: '',
    description: '',
    startTime: toLocalInput(start),
    endTime: toLocalInput(new Date(start.getTime() + 2 * HOUR)),
    penaltyMinutes: 20,
    isPublic: true,
    problems: [],
  };
}

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const labelFor = (index: number) => String.fromCharCode(65 + index);

export function AdminContestEdit() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [slugTouched, setSlugTouched] = useState(editing);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ['admin', 'contest', id],
    queryFn: () => api.get<{ contest: AdminContest }>(`/admin/contests/${id}`),
    enabled: editing,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    if (!existing.data) return;
    const c = existing.data.contest;
    setDraft({
      slug: c.slug,
      title: c.title,
      description: c.description,
      startTime: toLocalInput(c.startTime),
      endTime: toLocalInput(c.endTime),
      penaltyMinutes: c.penaltyMinutes,
      isPublic: c.isPublic,
      problems: c.problems.map((p) => p.problem),
    });
  }, [existing.data]);

  const candidates = useQuery({
    queryKey: ['problems', 'picker', search],
    queryFn: () => api.get<Paged<ProblemListItem>>(`/problems${query({ scope: 'all', pageSize: 30, search })}`),
  });

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const move = (index: number, delta: number) =>
    setDraft((d) => {
      const problems = [...d.problems];
      const target = index + delta;
      if (target < 0 || target >= problems.length) return d;
      [problems[index], problems[target]] = [problems[target]!, problems[index]!];
      return { ...d, problems };
    });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        slug: draft.slug,
        title: draft.title,
        description: draft.description,
        // datetime-local values are in the browser's zone; send them as absolute instants.
        startTime: new Date(draft.startTime).toISOString(),
        endTime: new Date(draft.endTime).toISOString(),
        penaltyMinutes: draft.penaltyMinutes,
        isPublic: draft.isPublic,
        problemIds: draft.problems.map((p) => p.id),
      };
      return editing ? api.put<{ contest: AdminContest }>(`/admin/contests/${id}`, body) : api.post<{ contest: AdminContest }>('/admin/contests', body);
    },
    onSuccess: ({ contest }) => {
      toast.success(editing ? 'Contest saved' : 'Contest created');
      void queryClient.invalidateQueries({ queryKey: ['contests'] });
      void queryClient.invalidateQueries({ queryKey: ['contest'] });
      void queryClient.invalidateQueries({ queryKey: ['contest-board'] });
      if (!editing) navigate(`/admin/contests/${contest.id}`, { replace: true });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.isError) return <ErrorState error={existing.error} />;

  const validTimes = draft.startTime && draft.endTime && new Date(draft.endTime) > new Date(draft.startTime);
  const picked = new Set(draft.problems.map((p) => p.id));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!validTimes) {
      setError('The end time must be after the start time.');
      return;
    }
    save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="page-header">
        <div>
          <h1>{editing ? `Edit: ${draft.title || 'contest'}` : 'New contest'}</h1>
          <p>
            <Link to="/admin/contests">← All contests</Link>
          </p>
        </div>
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create contest'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="stack">
        <div className="card card-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                className="input"
                required
                maxLength={120}
                value={draft.title}
                onChange={(e) => {
                  update('title', e.target.value);
                  if (!slugTouched) update('slug', slugify(e.target.value));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="slug">Slug</label>
              <input
                id="slug"
                className="input mono"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  update('slug', e.target.value);
                }}
              />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="start">Starts</label>
              <input id="start" className="input" type="datetime-local" required value={draft.startTime} onChange={(e) => update('startTime', e.target.value)} />
              <span className="hint">Your local time.</span>
            </div>
            <div className="field">
              <label htmlFor="end">Ends</label>
              <input id="end" className="input" type="datetime-local" required value={draft.endTime} onChange={(e) => update('endTime', e.target.value)} />
              <span className="hint">{validTimes ? `Length: ${formatSpan(new Date(draft.startTime).toISOString(), new Date(draft.endTime).toISOString())}` : 'Must be after the start.'}</span>
            </div>
            <div className="field">
              <label htmlFor="penalty">Penalty per rejected attempt (minutes)</label>
              <input id="penalty" className="input" type="number" min={0} max={240} value={draft.penaltyMinutes} onChange={(e) => update('penaltyMinutes', Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="description">Description (Markdown)</label>
            <textarea id="description" className="textarea" rows={6} value={draft.description} onChange={(e) => update('description', e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={draft.isPublic} onChange={(e) => update('isPublic', e.target.checked)} />
            Listed publicly. Hidden contests are only visible to administrators.
          </label>
        </div>

        <div className="grid cols-2">
          <div className="card">
            <div className="card-header">
              <h2>Problem set</h2>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {draft.problems.length} selected
              </span>
            </div>
            <div className="card-body">
              {draft.problems.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Add problems from the list. They are labelled A, B, C in this order.</p>
              ) : (
                <div className="picker-list" style={{ maxHeight: 'none' }}>
                  {draft.problems.map((problem, index) => (
                    <div className="picker-item" key={problem.id}>
                      <span>
                        <strong>{labelFor(index)}.</strong> {problem.title} {!problem.isPublic && <span className="badge">Hidden</span>}
                      </span>
                      <span className="nowrap">
                        <button type="button" className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${problem.title} up`}>
                          ↑
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" disabled={index === draft.problems.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${problem.title} down`}>
                          ↓
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => update('problems', draft.problems.filter((p) => p.id !== problem.id))}>
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted" style={{ fontSize: '0.84rem', margin: '12px 0 0' }}>
                Hidden problems stay secret until the contest starts, then become visible to everyone through the contest.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Add problems</h2>
            </div>
            <div className="card-body">
              <input className="input" type="search" placeholder="Search problems" aria-label="Search problems to add" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
              {candidates.isLoading ? (
                <Loading />
              ) : (
                <div className="picker-list">
                  {(candidates.data?.items ?? []).map((problem) => (
                    <div className="picker-item" key={problem.id}>
                      <span>
                        {problem.title} <DifficultyBadge difficulty={problem.difficulty} /> {!problem.isPublic && <span className="badge">Hidden</span>}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={picked.has(problem.id) || draft.problems.length >= 26}
                        onClick={() => update('problems', [...draft.problems, { id: problem.id, title: problem.title, slug: problem.slug, difficulty: problem.difficulty, isPublic: problem.isPublic }])}
                      >
                        {picked.has(problem.id) ? 'Added' : 'Add'}
                      </button>
                    </div>
                  ))}
                  {candidates.data?.items.length === 0 && <div className="picker-item muted">No problems match.</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
