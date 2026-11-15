import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1).default('postgresql://oj:oj_dev_password@localhost:5432/online_judge'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  SANDBOX_IMAGE: z.string().default('oj-sandbox:latest'),
  DOCKER_BIN: z.string().default('docker'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
  /** Queue name; the integration tests use their own so they never compete with a running worker. */
  JUDGE_QUEUE: z.string().min(1).default('judge'),

  SUBMIT_RATE_LIMIT: z.coerce.number().int().positive().default(12),
  RUN_RATE_LIMIT: z.coerce.number().int().positive().default(20),

  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_EMAIL: z.string().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().default('admin12345'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}\nCopy server/.env.example to server/.env to get started.`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
