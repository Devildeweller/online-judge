import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Markdown } from '../../components/Markdown';
import { useToast } from '../../components/Toast';
import { ErrorState, Loading } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import type { AdminProblem, AdminTestCase, CheckerType, Difficulty } from '../../types';

/** Above this size a test is not rendered into a textarea; it is replaced from a file instead. */
const INLINE_EDIT_LIMIT = 200_000;

type Draft = Omit<AdminProblem, 'id' | 'tags'> & { tags: string };

const EMPTY: Draft = {
  slug: '',
  title: '',
  statement: '',
  inputFormat: '',
  outputFormat: '',
  constraints: '',
  difficulty: 'EASY',
  tags: '',
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  checker: 'LINES',
  isPublic: false,
  testCases: [],
};

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

function FileButton({ label, onText }: { label: string; onText: (text: string) => void }) {
  return (
    <label className="btn btn-sm">
      {label}
      <input
        type="file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void file.text().then((text) => onText(text.replace(/\r\n/g, '\n')));
        }}
      />
    </label>
  );
}

function TestData({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const tooLarge = value.length > INLINE_EDIT_LIMIT;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
        <span className="label">
          {label} <span className="muted">({formatBytes(value.length)})</span>
        </span>
        <FileButton label="Load file" onText={onChange} />
      </div>
      {tooLarge ? (
        <pre className="codeblock" style={{ maxHeight: 120 }}>
          {value.slice(0, 400)}
          {'\n… too large to edit here; load a file to replace it'}
        </pre>
      ) : (
        <textarea className="textarea mono" rows={5} spellCheck={false} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function AdminProblemEdit() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(editing);
  const [testsDirty, setTestsDirty] = useState(!editing);
  const [open, setOpen] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ['admin', 'problem', id],
    queryFn: () => api.get<{ problem: AdminProblem }>(`/admin/problems/${id}`),
    enabled: editing,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    if (!existing.data) return;
    const { id: _id, tags, ...rest } = existing.data.problem;
    setDraft({ ...rest, tags: tags.join(', ') });
    setTestsDirty(false);
  }, [existing.data]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updateTests = (change: (tests: AdminTestCase[]) => AdminTestCase[]) => {
    setTestsDirty(true);
    setDraft((d) => ({ ...d, testCases: change(d.testCases) }));
  };
  const patchTest = (index: number, patch: Partial<AdminTestCase>) => updateTests((tests) => tests.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const move = (index: number, delta: number) =>
    updateTests((tests) => {
      const next = [...tests];
      const target = index + delta;
      if (target < 0 || target >= next.length) return tests;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const save = useMutation({
    mutationFn: () => {
      const { testCases, tags, ...fields } = draft;
      const body = {
        ...fields,
        tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        // Test data can be megabytes; it is only sent when it actually changed.
        ...(testsDirty ? { testCases: testCases.map(({ input, expectedOutput, isSample, explanation }) => ({ input, expectedOutput, isSample, explanation })) } : {}),
      };
      return editing ? api.put<{ problem: AdminProblem }>(`/admin/problems/${id}`, body) : api.post<{ problem: AdminProblem }>('/admin/problems', body);
    },
    onSuccess: ({ problem }) => {
      toast.success(editing ? 'Problem saved' : 'Problem created');
      setTestsDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['problems'] });
      void queryClient.invalidateQueries({ queryKey: ['problem'] });
      if (!editing) navigate(`/admin/problems/${problem.id}`, { replace: true });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.isError) return <ErrorState error={existing.error} />;

  const samples = draft.testCases.filter((t) => t.isSample).length;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (draft.isPublic && draft.testCases.length === 0) {
      setError('Add at least one test case before publishing; a problem without tests cannot be judged.');
      return;
    }
    save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <div className="page-header">
        <div>
          <h1>{editing ? `Edit: ${draft.title || 'problem'}` : 'New problem'}</h1>
          <p>
            <Link to="/admin/problems">← All problems</Link>
          </p>
        </div>
        <div className="row">
          {editing && draft.slug && (
            <Link className="btn" to={`/problems/${draft.slug}`}>
              View problem
            </Link>
          )}
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create problem'}
          </button>
        </div>
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
              <span className="hint">Used in the URL: /problems/{draft.slug || 'your-slug'}</span>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="difficulty">Difficulty</label>
              <select id="difficulty" className="select" value={draft.difficulty} onChange={(e) => update('difficulty', e.target.value as Difficulty)}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="time">Time limit (ms)</label>
              <input id="time" className="input" type="number" min={100} max={10000} step={100} value={draft.timeLimitMs} onChange={(e) => update('timeLimitMs', Number(e.target.value))} />
              <span className="hint">For C++. Java and JavaScript get ×2, Python ×3.</span>
            </div>
            <div className="field">
              <label htmlFor="memory">Memory limit (MB)</label>
              <input id="memory" className="input" type="number" min={16} max={1024} value={draft.memoryLimitMb} onChange={(e) => update('memoryLimitMb', Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="checker">Output checker</label>
              <select id="checker" className="select" value={draft.checker} onChange={(e) => update('checker', e.target.value as CheckerType)}>
                <option value="LINES">Lines (ignore trailing whitespace)</option>
                <option value="TOKENS">Tokens (ignore all whitespace)</option>
                <option value="FLOAT">Floating point (1e-6 tolerance)</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="tags">Topics</label>
            <input id="tags" className="input" placeholder="dp, graphs, binary-search" value={draft.tags} onChange={(e) => update('tags', e.target.value)} />
            <span className="hint">Comma separated, up to 10.</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={draft.isPublic} onChange={(e) => update('isPublic', e.target.checked)} />
            Published: listed for everyone. Leave off for problems reserved for an upcoming contest.
          </label>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Statement</h2>
            <button type="button" className="btn btn-sm" onClick={() => setPreview((v) => !v)}>
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          <div className="card-body">
            {preview ? (
              <>
                <Markdown>{draft.statement || '*Nothing to preview yet.*'}</Markdown>
                <div className="section-title">Input</div>
                <Markdown>{draft.inputFormat}</Markdown>
                <div className="section-title">Output</div>
                <Markdown>{draft.outputFormat}</Markdown>
                <div className="section-title">Constraints</div>
                <Markdown>{draft.constraints}</Markdown>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="statement">Description</label>
                  <textarea id="statement" className="textarea" rows={10} required value={draft.statement} onChange={(e) => update('statement', e.target.value)} />
                  <span className="hint">Markdown with LaTeX: $n \le 10^5$ renders as math.</span>
                </div>
                <div className="field">
                  <label htmlFor="input-format">Input format</label>
                  <textarea id="input-format" className="textarea" rows={3} value={draft.inputFormat} onChange={(e) => update('inputFormat', e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="output-format">Output format</label>
                  <textarea id="output-format" className="textarea" rows={3} value={draft.outputFormat} onChange={(e) => update('outputFormat', e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="constraints">Constraints</label>
                  <textarea id="constraints" className="textarea" rows={3} value={draft.constraints} onChange={(e) => update('constraints', e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2>Test cases</h2>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {draft.testCases.length} total · {samples} shown as examples · judged in this order, stopping at the first failure
                {testsDirty && editing && ' · unsaved changes'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                updateTests((tests) => [...tests, { input: '', expectedOutput: '', isSample: tests.length === 0, explanation: null }]);
                setOpen(draft.testCases.length);
              }}
            >
              Add test case
            </button>
          </div>
          <div className="card-body">
            {draft.testCases.length === 0 && <p className="muted" style={{ margin: 0 }}>No test cases yet. Add at least one sample and several hidden tests.</p>}
            {draft.testCases.map((test, index) => (
              <div className="test-case" key={index}>
                <div className="test-case-head">
                  <strong>#{index + 1}</strong>
                  {test.isSample ? <span className="badge accent">Example</span> : <span className="badge">Hidden</span>}
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    in {formatBytes(test.input.length)} · out {formatBytes(test.expectedOutput.length)}
                  </span>
                  <span className="spacer" />
                  <button type="button" className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move test ${index + 1} up`}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={index === draft.testCases.length - 1} onClick={() => move(index, 1)} aria-label={`Move test ${index + 1} down`}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setOpen(open === index ? null : index)}>
                    {open === index ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-danger"
                    onClick={() => {
                      updateTests((tests) => tests.filter((_, i) => i !== index));
                      setOpen(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
                {open === index && (
                  <div className="test-case-body">
                    <TestData label="Input" value={test.input} onChange={(input) => patchTest(index, { input })} />
                    <TestData label="Expected output" value={test.expectedOutput} onChange={(expectedOutput) => patchTest(index, { expectedOutput })} />
                    <label className="check full">
                      <input type="checkbox" checked={test.isSample} onChange={(e) => patchTest(index, { isSample: e.target.checked })} />
                      Show as an example in the statement
                    </label>
                    {test.isSample && (
                      <div className="field full" style={{ marginBottom: 0 }}>
                        <label htmlFor={`explanation-${index}`}>Explanation (optional, Markdown)</label>
                        <textarea
                          id={`explanation-${index}`}
                          className="textarea"
                          rows={2}
                          value={test.explanation ?? ''}
                          onChange={(e) => patchTest(index, { explanation: e.target.value || null })}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
