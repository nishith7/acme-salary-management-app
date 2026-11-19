import {
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
});
