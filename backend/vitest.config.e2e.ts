import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Set before any test file is imported, because the config module validates
    // the environment as soon as app.module.ts loads. These are placeholders:
    // e2e tests replace the database client, and they must pass on a clean
    // machine with no .env file. Values set here win over a local .env.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'e2e-only-secret-that-is-at-least-32-characters-long',
      // Pinned so a developer's local .env cannot change what the tests see.
      // The limit is high so the many login requests in other specs are not
      // throttled; the rate-limit specs set their own small values.
      TRUST_PROXY: '0',
      LOGIN_RATE_LIMIT: '1000',
      LOGIN_RATE_WINDOW_SECONDS: '60',
      // No site is allowed by default; the CORS spec sets its own list.
      CORS_ORIGINS: '',
    },
  },
});
