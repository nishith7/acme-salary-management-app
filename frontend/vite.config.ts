import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // GitHub Pages serves the site from /<repository>/, so the Pages workflow sets
    // VITE_BASE_PATH. Everywhere else the site lives at the root.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Tests run west of Greenwich on purpose, so a calendar date that is read as a moment
      // (and so shifts to the day before) fails here, not on a user's laptop. CI runs in UTC,
      // where that bug would pass unnoticed.
      // VITE_API_URL has no default in the app, so the tests give it one. It is never
      // reached: tests stub the API.
      env: { TZ: 'America/Los_Angeles', VITE_API_URL: 'http://localhost:3000' },
    },
  };
});
