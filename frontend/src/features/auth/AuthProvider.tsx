import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient, authApi } from '../../api/index.ts';
import type { LoginCredentials } from '../../api/auth.ts';
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from './auth-context.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let current = true;

    // The access token lives only in memory, so every page load starts here: try the
    // httpOnly refresh cookie. React StrictMode runs this effect twice in development; the
    // API client shares one refresh between the two calls, so the cookie is used once.
    authApi.restoreSession().then(
      ({ user }) => {
        if (current) setState({ status: 'authenticated', user });
      },
      () => {
        // No valid cookie just means nobody is signed in. Not an error to show.
        if (current)
          setState({ status: 'unauthenticated', sessionExpired: false });
      },
    );

    const stopListening = apiClient.onSessionExpired(() => {
      queryClient.clear(); // the next person on this browser must not see this one's data
      setState({ status: 'unauthenticated', sessionExpired: true });
    });

    return () => {
      current = false;
      stopListening();
    };
  }, [queryClient]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { user } = await authApi.login(credentials);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.clear();
    setState({ status: 'unauthenticated', sessionExpired: false });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
