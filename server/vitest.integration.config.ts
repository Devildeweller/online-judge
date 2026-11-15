import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './tests/integration/globalSetup.js';

/**
 * Integration tests: need PostgreSQL and Redis (npm run infra:up) and, for the judge suites,
 * a running Docker daemon with the sandbox image built (npm run sandbox:build).
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? TEST_DATABASE_URL,
      REDIS_URL: process.env.TEST_REDIS_URL ?? TEST_REDIS_URL,
      JWT_SECRET: 'integration-test-secret-integration-test-0123456789',
      JUDGE_QUEUE: 'judge-test',
      // Rate limits would get in the way of rapid-fire test requests.
      SUBMIT_RATE_LIMIT: '100000',
      RUN_RATE_LIMIT: '100000',
    },
  },
});
