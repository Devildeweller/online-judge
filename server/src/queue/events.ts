import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

/**
 * Workers have no socket connections of their own. They publish events on a Redis channel and
 * every API instance relays them to the Socket.IO rooms it hosts.
 *
 * Pub/sub channels ignore Redis logical databases, so the channel carries the queue name to keep
 * separate environments (for example the test suite) apart on a shared Redis.
 */
export const EVENTS_CHANNEL = `oj:events:${env.JUDGE_QUEUE}`;

export interface RealtimeEvent {
  rooms: string[];
  event: string;
  payload: unknown;
}

export const rooms = {
  user: (userId: number) => `user:${userId}`,
  contest: (contestId: number) => `contest:${contestId}`,
};

export async function publishEvent(event: RealtimeEvent): Promise<void> {
  await redis.publish(EVENTS_CHANNEL, JSON.stringify(event));
}
