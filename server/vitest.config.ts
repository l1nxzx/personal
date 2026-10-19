import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-1234',
      JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-123',
      CLIENT_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      ALLOW_REGISTRATION: 'true',
    },
  },
});
