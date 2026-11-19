import type { CookieOptions, Request } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Only requests under this path carry the cookie, so the refresh token is not
 * sent with ordinary API calls. If the UI later reaches the API through a proxy
 * that adds a path prefix, this is the one place to change.
 */
export const REFRESH_COOKIE_PATH = '/auth';

/**
 * Settings for the refresh-token cookie: unreadable by scripts (httpOnly), not
 * sent on cross-site requests (sameSite strict), and gone when the token
 * expires. `secure` limits it to HTTPS, which production must use.
 */
export function refreshCookieOptions(options: {
  expiresAt: Date;
  secure: boolean;
}): CookieOptions {
  return { ...cookieScope(options.secure), expires: options.expiresAt };
}

/**
 * The refresh token the browser sent, or undefined if there is none. Needs the
 * cookie-parser middleware (registered in configureApp). Only a string counts:
 * cookie-parser turns a value starting with "j:" into an object, and that is
 * never a token we issued.
 */
export function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Settings to remove the cookie. A browser only deletes a cookie when the
 * clearing header names the same path and flags as the one that set it, which
 * is why both functions build on the same scope.
 */
export function clearRefreshCookieOptions(options: {
  secure: boolean;
}): CookieOptions {
  return cookieScope(options.secure);
}

function cookieScope(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}
