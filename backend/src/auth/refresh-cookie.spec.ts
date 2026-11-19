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
    it.each([
      ['an object', { a: 1 }],
      ['an array', ['abc']],
      ['a number', 42],
    ])('ignores a cookie value that is %s, not a string', (_label, value) => {
      expect(
        readRefreshCookie(requestWith({ refresh_token: value })),
      ).toBeUndefined();
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
