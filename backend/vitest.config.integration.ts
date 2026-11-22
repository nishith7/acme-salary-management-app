import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    // These talk to a real database over the network.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
