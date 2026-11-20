import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { createQueryClient } from '../app/queryClient.ts';
import { AppProviders } from '../app/providers.tsx';
import { routes } from '../app/routes.tsx';

/**
 * Mounts the real app (the same providers and route table as production) in a memory
 * router that starts at `path`, so tests drive it the way a user would.
 */
export function renderApp(path: string) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { queryClient, router };
}
