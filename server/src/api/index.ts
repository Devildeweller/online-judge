import { createServer } from 'node:http';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { closeJudgeQueue } from '../queue/judgeQueue.js';
import { attachRealtime } from '../realtime/socket.js';
import { createApp } from './app.js';

const app = createApp();
const server = createServer(app);
const realtime = attachRealtime(server);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'api shutting down');
  await realtime.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeJudgeQueue();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
