import type { Server as HttpServer } from 'node:http';
import type { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { type AuthUser, verifyAccessToken } from '../lib/tokens.js';
import { EVENTS_CHANNEL, type RealtimeEvent, rooms } from '../queue/events.js';

const idSchema = z.number().int().positive();

interface SocketData {
  user?: AuthUser;
}

export interface Realtime {
  io: Server;
  close: () => Promise<void>;
}

/**
 * Socket.IO server plus a Redis subscriber. Judge workers publish events to Redis; this relays
 * them to rooms, so real-time updates keep working with any number of API and worker processes.
 *
 * Rooms: user:<id> (joined automatically when authenticated; carries that user's own judge events)
 * and contest:<id> (anyone may join; it only signals that the leaderboard changed).
 */
export function attachRealtime(httpServer: HttpServer): Realtime {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(httpServer, {
    path: '/socket.io',
    cors: { origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token === 'string' && token.length > 0) {
      const user = verifyAccessToken(token);
      if (!user) return next(new Error('TOKEN_INVALID'));
      socket.data.user = user;
    }
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user) void socket.join(rooms.user(user.id));

    const subscribe = (event: string, room: (id: number) => string) => {
      socket.on(`${event}:subscribe` as never, (id: unknown) => {
        const parsed = idSchema.safeParse(id);
        if (parsed.success) void socket.join(room(parsed.data));
      });
      socket.on(`${event}:unsubscribe` as never, (id: unknown) => {
        const parsed = idSchema.safeParse(id);
        if (parsed.success) void socket.leave(room(parsed.data));
      });
    };
    subscribe('contest', rooms.contest);
  });

  const subscriber: Redis = createRedis('events-subscriber');
  subscriber.subscribe(EVENTS_CHANNEL).catch((err: unknown) => logger.error({ err }, 'could not subscribe to realtime events'));
  subscriber.on('message', (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as RealtimeEvent;
      if (!Array.isArray(event.rooms) || event.rooms.length === 0) return;
      // Chaining rooms emits once per socket even if it sits in several of them.
      (io.to(event.rooms) as unknown as { emit: (name: string, payload: unknown) => void }).emit(event.event, event.payload);
    } catch (err) {
      logger.warn({ err }, 'dropped malformed realtime event');
    }
  });

  return {
    io,
    close: async () => {
      subscriber.disconnect();
      await io.close();
    },
  };
}
