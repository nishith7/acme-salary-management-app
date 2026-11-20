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
    server: {
      proxy: {
        // In development the browser talks only to Vite, so the refresh cookie the API
        // sets is first-party, as it must be behind a production proxy too.
        '/api': {
          target: env.DEV_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // The API scopes the refresh cookie to Path=/auth, but the browser calls
          // /api/auth/refresh, so without this rewrite it would never send the cookie.
          cookiePathRewrite: { '/auth': '/api/auth' },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
