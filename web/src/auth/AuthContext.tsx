import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, onSessionChange, refreshSession, setSession } from '../lib/api';
import { startRealtime } from '../lib/socket';
import type { Session, SessionUser } from '../types';

interface AuthState {
  user: SessionUser | null;
  /** False until the first attempt to restore a session from the refresh cookie has finished. */
  ready: boolean;
  isAdmin: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  const userId = useRef<number | null>(null);
  const refreshTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onSessionChange((session) => {
      setUser(session?.user ?? null);
      const nextId = session?.user.id ?? null;
      // Cached responses contain per-user fields (solved marks, own submissions).
      if (nextId !== userId.current) {
        userId.current = nextId;
        void queryClient.invalidateQueries();
      }
      // Renew shortly before the access token expires so requests and the socket never see a stale one.
      window.clearTimeout(refreshTimer.current);
      if (session) {
        const delay = Math.max(30, session.expiresIn - 60) * 1000;
        refreshTimer.current = window.setTimeout(() => void refreshSession(), delay);
      }
    });

    void refreshSession().finally(() => {
      setReady(true);
      startRealtime();
    });

    return () => {
      unsubscribe();
      window.clearTimeout(refreshTimer.current);
    };
  }, [queryClient]);

  const login = useCallback(async (identifier: string, password: string) => {
    setSession(await api.post<Session>('/auth/login', { identifier, password }));
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    setSession(await api.post<Session>('/auth/register', { username, email, password }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, isAdmin: user?.role === 'ADMIN', login, register, logout }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
