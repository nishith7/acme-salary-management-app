import { createContext, useContext } from 'react';
import type { LoginCredentials } from '../../api/auth.ts';
import type { AuthUser } from '../../api/types.ts';

/**
 * Who is using the app. `loading` lasts only until the refresh cookie has been tried once
 * at start-up; until then the app must not guess, or a signed-in user would see a flash of
 * the login page, and a signed-out one a flash of protected content.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | {
      status: 'unauthenticated';
      /** True when the user had a session that the server then refused to renew. */
      sessionExpired: boolean;
    };

export interface AuthActions {
  /** Rejects with an ApiError (401 for a wrong password, 429 when rate limited). */
  login(credentials: LoginCredentials): Promise<void>;
  /**
   * Ends the session. Rejects, and leaves the user signed in, if the server could not be
   * told: with the refresh cookie still valid, pretending to be signed out would be untrue.
   */
  logout(): Promise<void>;
}

export type AuthContextValue = AuthState & AuthActions;

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}
