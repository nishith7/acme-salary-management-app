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
    },
  },
});
