import { execSync } from 'node:child_process';

/**
 * Integration tests run against their own PostgreSQL database and Redis logical database,
 * so they can truncate freely without touching development data.
 */
export const TEST_DATABASE_URL = 'postgresql://oj:oj_dev_password@localhost:5432/online_judge_test';
export const TEST_REDIS_URL = 'redis://localhost:6379/1';

export default function setup(): void {
  // Creates the database on first use and applies every migration.
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL },
  });
}
