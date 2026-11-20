import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers.tsx';
import { router } from './app/router.ts';

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
