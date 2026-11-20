import { Navigate, Outlet, useLocation } from 'react-router';
import { paths } from '../../app/paths.ts';
import { FullPageLoader } from '../../components/FullPageLoader.tsx';
import { useAuth } from './auth-context.ts';
import { readReturnPath } from './location-state.ts';

/**
 * A layout route for pages that only make sense signed out (the login page). A signed-in
 * user is sent on to where they were going, or to the app's home. Signing in needs no
 * navigation of its own: the state change lands here and this does the redirect.
 */
export function PublicOnly() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return <FullPageLoader />;
  }
  if (auth.status === 'authenticated') {
    return (
      <Navigate
        to={readReturnPath(location.state) ?? paths.employees}
        replace
      />
    );
  }
  return <Outlet />;
}
