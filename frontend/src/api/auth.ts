import type { ApiClient } from './client.ts';
import type { AuthUser, LoginResponse } from './types.ts';

export interface LoginCredentials {
  email: string;
  password: string;
}

/** The auth endpoints, over a given client (the app's own, or a test's). */
export function createAuthApi(client: ApiClient) {
  return {
    /** Logs in and keeps the access token for the calls that follow. */
    async login(credentials: LoginCredentials): Promise<LoginResponse> {
      const { data } = await client.http.post<LoginResponse>(
        '/auth/login',
        credentials,
        { skipAuthRefresh: true }, // a 401 here means a wrong password, not an expired token
      );
      client.setAccessToken(data.accessToken);
      return data;
    },

    /**
     * Gets the session back after a page load, from the refresh cookie. The answer has
     * the user in it, so nothing else needs to be asked. Rejects with a 401 ApiError
     * when there is no valid cookie, which just means nobody is logged in.
     */
    restoreSession(): Promise<LoginResponse> {
      return client.refreshSession();
    },

    /** Ends the session on the server and forgets the token here, even if the call fails. */
    async logout(): Promise<void> {
      try {
        await client.http.post('/auth/logout', undefined, {
          skipAuthRefresh: true,
        });
      } finally {
        client.setAccessToken(null);
      }
    },

    /** The signed-in user as stored now (the role in the token can be up to 15 minutes old). */
    async me(): Promise<AuthUser> {
      const { data } = await client.http.get<AuthUser>('/auth/me');
      return data;
    },
  };
}
