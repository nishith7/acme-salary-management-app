import type { CookieOptions } from 'express';

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
  return {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    expires: options.expiresAt,
  };
}
