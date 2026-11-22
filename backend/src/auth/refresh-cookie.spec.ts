import type { Request } from 'express';
import {
  clearRefreshCookieOptions,
  readRefreshCookie,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  refreshCookieOptions,
} from './refresh-cookie.js';

describe('refresh cookie', () => {
  const expiresAt = new Date('2026-11-26T10:00:00.000Z');

  it('is named refresh_token and limited to the /auth path', () => {
    expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
    expect(REFRESH_COOKIE_PATH).toBe('/auth');
  });

  it('cannot be read by scripts and is not sent on cross-site requests', () => {
    const options = refreshCookieOptions({ expiresAt, secure: false });

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('strict');
    expect(options.path).toBe('/auth');
  });

  it('can be allowed on cross-site requests, which is what a site on another host needs', () => {
    const options = refreshCookieOptions({
      expiresAt,
      secure: true,
      sameSite: 'none',
    });

    expect(options.sameSite).toBe('none');
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/auth');
  });

  it('is always HTTPS-only when cross-site, because a browser refuses SameSite=None without Secure', () => {
    expect(
      refreshCookieOptions({ expiresAt, secure: false, sameSite: 'none' })
        .secure,
    ).toBe(true);
    expect(
      clearRefreshCookieOptions({ secure: false, sameSite: 'none' }).secure,
    ).toBe(true);
    // And the clearing header uses the same flags as the one that set it, or the browser keeps the cookie.
    expect(
      clearRefreshCookieOptions({ secure: true, sameSite: 'none' }),
    ).toEqual(expect.objectContaining({ sameSite: 'none', path: '/auth' }));
  });

  it('expires when the refresh token does', () => {
    const options = refreshCookieOptions({ expiresAt, secure: false });

    expect(options.expires).toEqual(expiresAt);
  });

  it('is only sent over HTTPS when secure is on', () => {
    expect(refreshCookieOptions({ expiresAt, secure: true }).secure).toBe(true);
    expect(refreshCookieOptions({ expiresAt, secure: false }).secure).toBe(
      false,
    );
  });

  describe('reading', () => {
    const requestWith = (cookies: unknown) => ({ cookies }) as Request;

    it('returns the token from the refresh_token cookie', () => {
      expect(
        readRefreshCookie(requestWith({ refresh_token: 'abc', other: 'x' })),
      ).toBe('abc');
    });

    it('returns undefined when the cookie is missing', () => {
      expect(readRefreshCookie(requestWith({ other: 'x' }))).toBeUndefined();
    });

    it('returns undefined when no cookies were parsed at all', () => {
      expect(readRefreshCookie(requestWith(undefined))).toBeUndefined();
    });

    // cookie-parser turns a value starting with "j:" into an object.
    it('ignores a cookie value that is not a string: an object, an array or a number', () => {
      for (const value of [{ a: 1 }, ['abc'], 42]) {
        expect(
          readRefreshCookie(requestWith({ refresh_token: value })),
        ).toBeUndefined();
      }
    });
  });

  describe('clearing', () => {
    // A browser only removes a cookie when the clearing header names the same
    // path (and the same flags) as the one that set it.
    it('uses the same path and flags as the cookie it removes', () => {
      const set = refreshCookieOptions({ expiresAt, secure: true });
      const clear = clearRefreshCookieOptions({ secure: true });

      expect(clear.path).toBe(set.path);
      expect(clear.httpOnly).toBe(set.httpOnly);
      expect(clear.sameSite).toBe(set.sameSite);
      expect(clear.secure).toBe(set.secure);
    });

    it('sets no expiry of its own, because clearing always expires the cookie', () => {
      const clear = clearRefreshCookieOptions({ secure: false });

      expect(clear.expires).toBeUndefined();
      expect(clear.maxAge).toBeUndefined();
    });
  });
});
