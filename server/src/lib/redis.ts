import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export function createRedis(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    connectionName: `oj:${name}`,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on('error', (err) => logger.error({ err: err.message, client: name }, 'redis error'));
  return client;
}

/** Shared connection for commands. Pub/sub subscribers need their own connection. */
export const redis = createRedis('main');

/** BullMQ manages its own connections; workers require maxRetriesPerRequest = null. */
export const bullConnection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

export const keys = {
  refreshToken: (hash: string) => `auth:refresh:${hash}`,
  rateLimit: (scope: string, id: string, window: number) => `rl:${scope}:${id}:${window}`,
  contestBoard: (contestId: number) => `contest:${contestId}:board`,
  contestRows: (contestId: number) => `contest:${contestId}:rows`,
  contestReady: (contestId: number) => `contest:${contestId}:ready`,
  globalBoard: 'board:global',
  globalReady: 'board:global:ready',
  runResult: (runId: string) => `run:${runId}`,
  cache: (name: string) => `cache:${name}`,
};
