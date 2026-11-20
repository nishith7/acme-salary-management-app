import { Navigate, Outlet, useLocation } from 'react-router';
import { paths } from '../../app/paths.ts';
import type { Role } from '../../api/types.ts';
import { FullPageLoader } from '../../components/FullPageLoader.tsx';
import { ForbiddenPage } from '../../pages/ForbiddenPage.tsx';
import { useAuth } from './auth-context.ts';
import type { LoginRedirectState } from './location-state.ts';

/**
 * A layout route that guards the routes inside it. Wait for the session check, then:
 * signed out goes to the login page (remembering where they were going), a signed-in user
 * without a listed role sees a no-access page, anyone else gets the page.
 *
 * The browser guard is a courtesy, not security: every API call is checked again by the
 * server, which is what actually protects the data.
 */
export function RequireAuth({ roles }: { roles?: readonly Role[] }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return <FullPageLoader />;
  }
  if (auth.status === 'unauthenticated') {
    const state: LoginRedirectState = {
      from: location.pathname + location.search + location.hash,
    };
    return <Navigate to={paths.login} replace state={state} />;
  }
  if (roles && !roles.includes(auth.user.role)) {
    return <ForbiddenPage />;
  }
  return <Outlet />;
}
