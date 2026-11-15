import { defineConfig } from 'vitest/config';

/** Unit tests: pure logic only, no PostgreSQL, Redis or Docker required. */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'unit-test-secret-unit-test-secret-0123456789',
    },
  },
});
