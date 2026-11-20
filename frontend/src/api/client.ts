import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
import { toApiError } from './errors.ts';
import type { LoginResponse } from './types.ts';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Set on login and logout, where a 401 is the answer itself ("wrong password")
     * and not an expired token, so it must not start a refresh.
     */
    skipAuthRefresh?: boolean;
    /** Set by the client when it re-sends a request after a refresh, so it never retries twice. */
    retried?: boolean;
  }
}

export interface ApiClientOptions {
  /** Where the API lives: `/api` behind a proxy, or a full URL when the site is on another host. */
  baseURL: string;
  /** Replaces axios's network layer. For tests only. */
  adapter?: AxiosAdapter;
  /** Milliseconds before a request is given up on. */
  timeout?: number;
}

export interface ApiClient {
  /** The axios instance every call goes through. It adds the token and handles a 401. */
  http: AxiosInstance;
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  /**
   * Exchanges the refresh cookie for a new access token. Callers that ask while a
   * refresh is under way share it, because a refresh token works once and using it
   * a second time ends the whole login.
   */
  refreshSession(): Promise<LoginResponse>;
  /**
   * Called once when the server refuses to renew a session the user had, so the app
   * can send them to the login page. Returns a function that removes the handler.
   */
  onSessionExpired(handler: () => void): () => void;
}

export function createApiClient({
  baseURL,
  adapter,
  timeout = 60_000,
}: ApiClientOptions): ApiClient {
  // withCredentials lets the refresh cookie travel when the API is on another origin.
  // Behind a same-origin proxy it changes nothing.
  const settings = { baseURL, adapter, timeout, withCredentials: true };
  const http = axios.create(settings);
  // No interceptors: this one only refreshes, and a 401 from it must not start a refresh.
  const refresher = axios.create(settings);

  // The access token lives here and nowhere else: not in storage, so a script that
  // reads storage cannot take it, and a reload simply refreshes from the cookie.
  let accessToken: string | null = null;
  let refreshing: Promise<LoginResponse> | null = null;
  const expiredHandlers = new Set<() => void>();

  async function requestRefresh(): Promise<LoginResponse> {
    const hadSession = accessToken !== null;
    try {
      const { data } = await refresher.post<LoginResponse>('/auth/refresh');
      accessToken = data.accessToken;
      return data;
    } catch (error) {
      const failure = toApiError(error);
      // Only a 401 means the server refused the cookie, so the session is over. A network
      // error or a 5xx says nothing about the session, so it stays and can be retried.
      if (failure.status === 401) {
        accessToken = null;
        if (hadSession) {
          for (const handler of expiredHandlers) {
            handler();
          }
        }
      }
      throw failure;
    }
  }

  function refreshSession(): Promise<LoginResponse> {
    refreshing ??= requestRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  http.interceptors.request.use((config) => {
    if (accessToken !== null) {
      config.headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return config;
  });

  http.interceptors.response.use(undefined, async (error: unknown) => {
    if (axios.isCancel(error)) {
      throw error; // a request the caller cancelled is not a failure
    }
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config &&
      !error.config.skipAuthRefresh &&
      !error.config.retried
    ) {
      await refreshSession();
      return http.request({ ...error.config, retried: true });
    }
    throw toApiError(error);
  });

  return {
    http,
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    refreshSession,
    onSessionExpired: (handler) => {
      expiredHandlers.add(handler);
      return () => {
        expiredHandlers.delete(handler);
      };
    },
  };
}
