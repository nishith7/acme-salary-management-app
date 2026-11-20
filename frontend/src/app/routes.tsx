import { Navigate, type RouteObject } from 'react-router';
import { PublicOnly } from '../features/auth/PublicOnly.tsx';
import { RequireAuth } from '../features/auth/RequireAuth.tsx';
import { LoginPage } from '../features/auth/pages/LoginPage.tsx';
import { DirectoryPage } from '../features/directory/pages/DirectoryPage.tsx';
import { AppShell } from '../layouts/AppShell.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
import { paths } from './paths.ts';

/**
 * The route table. Three kinds of route:
 *  - public-only: the login page, which a signed-in user is sent away from;
 *  - protected: everything inside RequireAuth, which sends a visitor to the login page and
 *    shows a no-access page to anyone who is not an HR admin;
 *  - neither: the not-found page.
 * A new screen goes inside the protected group unless it has a reason not to.
 */
export const routes: RouteObject[] = [
  {
    element: <PublicOnly />,
    children: [{ path: paths.login, element: <LoginPage /> }],
  },
  {
    element: <RequireAuth roles={['HR_ADMIN']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to={paths.employees} replace /> },
          { path: paths.employees, element: <DirectoryPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
