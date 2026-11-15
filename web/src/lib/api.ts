import type { Session } from '../types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type SessionListener = (session: Session | null) => void;

// The access token lives in memory only. The refresh token is an httpOnly cookie the page cannot read.
let accessToken: string | null = null;
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<SessionListener>();

export const getAccessToken = () => accessToken;

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Remembers (without storing any secret) that this browser has signed in before, so guests do
 * not fire a refresh request that is bound to fail on every page load.
 */
const SESSION_HINT = 'oj:session';

export function mayHaveSession(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return true;
  }
}

function rememberSession(active: boolean): void {
  try {
    if (active) localStorage.setItem(SESSION_HINT, '1');
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    // Storage unavailable: fall back to always trying the refresh cookie.
  }
}

export function setSession(session: Session | null): void {
  accessToken = session?.accessToken ?? null;
  rememberSession(session !== null);
  for (const listener of listeners) listener(session);
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toError(response: Response, body: unknown): ApiError {
  const error = (body as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
  const fallback = response.status >= 500 ? 'The server is not responding. Is the API running?' : `Request failed (${response.status})`;
  return new ApiError(response.status, error?.code ?? 'UNKNOWN', error?.message ?? fallback, error?.details);
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<Session | null> {
  if (!mayHaveSession()) return Promise.resolve(null);
  refreshing ??= (async () => {
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      const session = response.ok ? ((await parseBody(response)) as Session) : null;
      setSession(session);
      return session;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, allowRefresh = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and that the API is running.');
  }

  // An expired access token is renewed once, transparently, and the request is replayed.
  if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
    const hadToken = accessToken !== null;
    const session = await refreshSession();
    if (session || hadToken) return request<T>(method, path, body, false);
  }

  const data = await parseBody(response);
  if (!response.ok) throw toError(response, data);
  return data as T;
}

export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, value === true ? '1' : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
