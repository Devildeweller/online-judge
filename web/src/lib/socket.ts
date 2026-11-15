import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, onSessionChange, refreshSession } from './api';

/** One shared connection for the whole app. Anonymous visitors connect too, for public rooms. */
export const socket: Socket = io({
  path: '/socket.io',
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: (callback) => callback({ token: getAccessToken() ?? undefined }),
});

// Rooms asked for by mounted components; re-joined after every reconnect.
const wanted = new Map<string, { event: string; id: number; count: number }>();

socket.on('connect', () => {
  for (const { event, id } of wanted.values()) socket.emit(`${event}:subscribe`, id);
});

socket.on('connect_error', (error) => {
  // The token expired while the tab was idle: renew it, then let the socket retry.
  if (error.message === 'TOKEN_INVALID') {
    void refreshSession().then(() => {
      socket.connect();
    });
  }
});

let lastToken: string | null = null;
let started = false;

/** Called once at startup, after the first session restore attempt. */
export function startRealtime(): void {
  if (started) return;
  started = true;
  lastToken = getAccessToken();
  socket.connect();
  // Identity is fixed at handshake time, so a login, logout or token change needs a new handshake.
  onSessionChange((session) => {
    const token = session?.accessToken ?? null;
    const identityChanged = (token === null) !== (lastToken === null);
    lastToken = token;
    if (identityChanged) {
      socket.disconnect();
      socket.connect();
    }
  });
}

function subscribe(event: 'contest', id: number): () => void {
  const key = `${event}:${id}`;
  const entry = wanted.get(key);
  if (entry) entry.count += 1;
  else {
    wanted.set(key, { event, id, count: 1 });
    if (socket.connected) socket.emit(`${event}:subscribe`, id);
  }
  return () => {
    const current = wanted.get(key);
    if (!current) return;
    current.count -= 1;
    if (current.count <= 0) {
      wanted.delete(key);
      if (socket.connected) socket.emit(`${event}:unsubscribe`, id);
    }
  };
}

/** Joins a server room while the component is mounted. */
export function useRoom(event: 'contest', id: number | null | undefined): void {
  useEffect(() => {
    if (!id) return;
    return subscribe(event, id);
  }, [event, id]);
}

export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (payload: T) => latest.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
