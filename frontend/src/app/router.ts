import { createBrowserRouter } from 'react-router';
import { routes } from './routes.tsx';

// BASE_URL is "/" normally and "/<repository>/" on GitHub Pages (see vite.config.ts), so the
// same build of the routes works under either.
export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL,
});
