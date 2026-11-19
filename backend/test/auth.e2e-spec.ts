import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { RefreshToken, User } from '../src/generated/prisma/client.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import {
  createTestApp,
  TEST_JWT_SECRET,
  type TestApp,
} from './support/test-app.js';

/** Every Set-Cookie header of a response, joined into one string. Empty when there is none. */
const setCookieOf = (response: request.Response): string =>
  (response.headers['set-cookie'] as unknown as string[] | undefined)?.join(
    '; ',
  ) ?? '';

/** The response tells the browser to delete the refresh cookie. */
const expectCookieCleared = (response: request.Response) => {
  const cookie = setCookieOf(response);
  expect(cookie).toMatch(/^refresh_token=;/);
  expect(cookie).toContain('Path=/auth');
  expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
};

describe('POST /auth/login (e2e)', () => {
  const password = 'correct horse battery staple';
  let testApp: TestApp;
  let user: User;

  beforeAll(async () => {
    testApp = await createTestApp();
    const now = new Date();
    user = {
      id: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
      email: 'hr@acme.test',
      passwordHash: await new PasswordHasher().hash(password),
      name: 'Hana Rao',
      role: 'HR_ADMIN',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    testApp.findUser.mockReset().mockResolvedValue(user);
    testApp.createRefreshToken.mockReset().mockResolvedValue({});
  });

  const login = (body: unknown) =>
    request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send(body as object);

  describe('with the right credentials', () => {
    it('returns 200 with an access token and the user, and nothing secret', async () => {
      const response = await login({ email: 'hr@acme.test', password }).expect(
        200,
      );

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: {
          id: user.id,
          email: 'hr@acme.test',
          name: 'Hana Rao',
          role: 'HR_ADMIN',
        },
      });
      expect(JSON.stringify(response.body)).not.toContain(user.passwordHash);
      expect(JSON.stringify(response.body)).not.toContain('refresh');
    });

    it('returns an access token signed with the configured secret', async () => {
      const response = await login({ email: 'hr@acme.test', password });

      const claims = new JwtService({ secret: TEST_JWT_SECRET }).verify<{
        sub: string;
        role: string;
      }>((response.body as { accessToken: string }).accessToken);
      expect(claims.sub).toBe(user.id);
      expect(claims.role).toBe('HR_ADMIN');
    });

    it('sets the refresh token as an httpOnly, strict, /auth-only cookie', async () => {
      const response = await login({ email: 'hr@acme.test', password });

      const cookie = setCookieOf(response);
      expect(cookie).toMatch(/^refresh_token=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/auth');
      expect(cookie).toContain('Expires=');
    });

    it('stores the hash of the cookie value and never the value itself', async () => {
      const response = await login({ email: 'hr@acme.test', password });

      const value = /refresh_token=([^;]+)/.exec(setCookieOf(response))![1]!;
      const stored = testApp.createRefreshToken.mock.calls[0]![0] as {
        data: { tokenHash: string };
      };
      expect(stored.data.tokenHash).toBe(hashRefreshToken(value));
      expect(JSON.stringify(stored)).not.toContain(value);
    });

    it('treats the email case-insensitively', async () => {
      await login({ email: 'HR@Acme.Test', password }).expect(200);

      expect(testApp.findUser).toHaveBeenCalledWith({
        where: { email: 'hr@acme.test' },
      });
    });
  });

  describe('with bad credentials', () => {
    it('returns 401 for a wrong password, with no cookie', async () => {
      const response = await login({
        email: 'hr@acme.test',
        password: 'wrong',
      }).expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      });
      expect(setCookieOf(response)).toBe('');
      expect(testApp.createRefreshToken).not.toHaveBeenCalled();
    });

    it('returns the identical 401 for an unknown email', async () => {
      testApp.findUser.mockResolvedValue(null);

      const response = await login({
        email: 'nobody@acme.test',
        password,
      }).expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      });
      expect(setCookieOf(response)).toBe('');
    });
  });

  describe('with an invalid request body', () => {
    it.each([
      ['an empty body', {}],
      ['no password', { email: 'hr@acme.test' }],
      ['no email', { password }],
      ['a malformed email', { email: 'not-an-email', password }],
      ['an empty password', { email: 'hr@acme.test', password: '' }],
      [
        'a password over 128 characters',
        { email: 'hr@acme.test', password: 'x'.repeat(129) },
      ],
      ['a non-string password', { email: 'hr@acme.test', password: 12345 }],
    ])(
      'returns 400 for %s, without touching the database',
      async (_label, body) => {
        const response = await login(body).expect(400);

        expect(response.body).toMatchObject({ statusCode: 400 });
        expect(testApp.findUser).not.toHaveBeenCalled();
      },
    );

    it('does not echo the submitted password back in the error', async () => {
      const response = await login({
        email: 'not-an-email',
        password: 'my-very-secret-password',
      }).expect(400);

      expect(JSON.stringify(response.body)).not.toContain(
        'my-very-secret-password',
      );
    });
  });
});

describe('POST /auth/refresh (e2e)', () => {
  const presented = 'Zm9yLXRlc3RzLW9ubHktbm90LWEtcmVhbC10b2tlbi0xMjM';
  const DAY_MS = 24 * 60 * 60 * 1000;
  let testApp: TestApp;
  let user: User;
  let stored: RefreshToken;

  beforeAll(async () => {
    testApp = await createTestApp();
    const now = new Date();
    user = {
      id: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
      email: 'hr@acme.test',
      passwordHash: 'not-used-by-refresh',
      name: 'Hana Rao',
      role: 'HR_ADMIN',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    stored = {
      id: '5d0c6f7e-3b1a-4c55-8f0e-2a9d4b6c7e10',
      userId: user.id,
      familyId: '9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f',
      tokenHash: hashRefreshToken(presented),
      expiresAt: new Date(Date.now() + 3 * DAY_MS),
      revokedAt: null,
      createdAt: new Date(Date.now() - DAY_MS),
    };
    testApp.findUser.mockReset().mockResolvedValue(user);
    testApp.findRefreshToken.mockReset().mockResolvedValue(stored);
    testApp.updateRefreshTokens.mockReset().mockResolvedValue({ count: 1 });
    testApp.createRefreshToken.mockReset().mockResolvedValue({});
  });

  const refreshWith = (token: string) =>
    request(testApp.app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${token}`);

  describe('with an active refresh token cookie', () => {
    it('returns 200 with a new access token and the user, and nothing secret', async () => {
      const response = await refreshWith(presented).expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: {
          id: user.id,
          email: 'hr@acme.test',
          name: 'Hana Rao',
          role: 'HR_ADMIN',
        },
      });
      expect(JSON.stringify(response.body)).not.toContain(user.passwordHash);
      expect(JSON.stringify(response.body)).not.toContain('refresh');
    });

    it('returns an access token signed with the configured secret', async () => {
      const response = await refreshWith(presented);

      const claims = new JwtService({ secret: TEST_JWT_SECRET }).verify<{
        sub: string;
        role: string;
      }>((response.body as { accessToken: string }).accessToken);
      expect(claims.sub).toBe(user.id);
      expect(claims.role).toBe('HR_ADMIN');
    });

    it('looks the token up by its hash', async () => {
      await refreshWith(presented);

      expect(testApp.findRefreshToken).toHaveBeenCalledWith({
        where: { tokenHash: hashRefreshToken(presented) },
      });
    });

    it('sets a different refresh token as an httpOnly, strict, /auth-only cookie', async () => {
      const response = await refreshWith(presented);

      const cookie = setCookieOf(response);
      expect(cookie).toMatch(/^refresh_token=[A-Za-z0-9_-]{43};/);
      expect(cookie).not.toContain(presented);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/auth');
      expect(cookie).toContain('Expires=');
    });

    it('retires the presented token and stores only the hash of its replacement, in the same family', async () => {
      const response = await refreshWith(presented);

      const value = /refresh_token=([^;]+)/.exec(setCookieOf(response))![1]!;
      expect(testApp.updateRefreshTokens).toHaveBeenCalledExactlyOnceWith({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(testApp.createRefreshToken).toHaveBeenCalledExactlyOnceWith({
        data: {
          userId: user.id,
          familyId: stored.familyId,
          tokenHash: hashRefreshToken(value),
          expiresAt: expect.any(Date),
        },
      });
      expect(
        JSON.stringify(testApp.createRefreshToken.mock.calls),
      ).not.toContain(value);
    });
  });

  describe('without a usable refresh token', () => {
    it('returns 401 and clears the cookie when none is sent, without touching the database', async () => {
      const response = await request(testApp.app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Your session has expired. Please log in again.',
      });
      expectCookieCleared(response);
      expect(testApp.findRefreshToken).not.toHaveBeenCalled();
    });

    it('does not accept the token from the request body', async () => {
      await request(testApp.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: presented })
        .expect(401);

      expect(testApp.findRefreshToken).not.toHaveBeenCalled();
    });

    it('returns 401 and clears the cookie for an unknown token', async () => {
      testApp.findRefreshToken.mockResolvedValue(null);

      const response = await refreshWith(presented).expect(401);

      expectCookieCleared(response);
      expect(testApp.createRefreshToken).not.toHaveBeenCalled();
      expect(testApp.updateRefreshTokens).not.toHaveBeenCalled();
    });

    it('returns 401 and clears the cookie for an expired token', async () => {
      testApp.findRefreshToken.mockResolvedValue({
        ...stored,
        expiresAt: new Date(Date.now() - 1000),
      });

      const response = await refreshWith(presented).expect(401);

      expectCookieCleared(response);
      expect(testApp.createRefreshToken).not.toHaveBeenCalled();
      expect(testApp.updateRefreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('when a token that was already used is presented again', () => {
    it('returns 401, clears the cookie and revokes every token in the family', async () => {
      testApp.findRefreshToken.mockResolvedValue({
        ...stored,
        revokedAt: new Date(Date.now() - 60_000),
      });

      const response = await refreshWith(presented).expect(401);

      expectCookieCleared(response);
      expect(testApp.updateRefreshTokens).toHaveBeenCalledExactlyOnceWith({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(testApp.createRefreshToken).not.toHaveBeenCalled();
    });

    it('returns 401 and revokes the family when a parallel request used the token first', async () => {
      // The conditional "retire the token" update finds it already revoked.
      testApp.updateRefreshTokens.mockResolvedValueOnce({ count: 0 });

      const response = await refreshWith(presented).expect(401);

      expectCookieCleared(response);
      expect(testApp.createRefreshToken).not.toHaveBeenCalled();
      expect(testApp.updateRefreshTokens).toHaveBeenCalledTimes(2);
      expect(testApp.updateRefreshTokens).toHaveBeenLastCalledWith({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});

describe('POST /auth/logout (e2e)', () => {
  const presented = 'Zm9yLXRlc3RzLW9ubHktbm90LWEtcmVhbC10b2tlbi0xMjM';
  const DAY_MS = 24 * 60 * 60 * 1000;
  let testApp: TestApp;
  let stored: RefreshToken;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    stored = {
      id: '5d0c6f7e-3b1a-4c55-8f0e-2a9d4b6c7e10',
      userId: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
      familyId: '9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f',
      tokenHash: hashRefreshToken(presented),
      expiresAt: new Date(Date.now() + 3 * DAY_MS),
      revokedAt: null,
      createdAt: new Date(Date.now() - DAY_MS),
    };
    testApp.findRefreshToken.mockReset().mockResolvedValue(stored);
    testApp.updateRefreshTokens.mockReset().mockResolvedValue({ count: 2 });
  });

  const logoutWith = (token: string) =>
    request(testApp.app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', `refresh_token=${token}`);

  const expectFamilyRevoked = () =>
    expect(testApp.updateRefreshTokens).toHaveBeenCalledExactlyOnceWith({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

  describe('with a refresh token cookie', () => {
    it('returns 204 with no body and clears the cookie', async () => {
      const response = await logoutWith(presented).expect(204);

      expect(response.text).toBe('');
      expectCookieCleared(response);
    });

    it('looks the token up by its hash', async () => {
      await logoutWith(presented);

      expect(testApp.findRefreshToken).toHaveBeenCalledWith({
        where: { tokenHash: hashRefreshToken(presented) },
      });
    });

    it('revokes every active token in the token’s family', async () => {
      await logoutWith(presented).expect(204);

      expectFamilyRevoked();
    });

    it('still revokes the family when the cookie holds a token that was already used', async () => {
      testApp.findRefreshToken.mockResolvedValue({
        ...stored,
        revokedAt: new Date(Date.now() - 60_000),
      });

      await logoutWith(presented).expect(204);

      expectFamilyRevoked();
    });

    it('needs no access token, so it still works after the access token has expired', async () => {
      await logoutWith(presented)
        .set('Authorization', 'Bearer not-a-valid-or-expired-token')
        .expect(204);

      expectFamilyRevoked();
    });
  });

  describe('without a usable refresh token cookie', () => {
    it('returns 204 and clears the cookie when none is sent, without touching the database', async () => {
      const response = await request(testApp.app.getHttpServer())
        .post('/auth/logout')
        .expect(204);

      expectCookieCleared(response);
      expect(testApp.findRefreshToken).not.toHaveBeenCalled();
      expect(testApp.updateRefreshTokens).not.toHaveBeenCalled();
    });

    it('returns 204 and revokes nothing for an unknown token', async () => {
      testApp.findRefreshToken.mockResolvedValue(null);

      const response = await logoutWith(presented).expect(204);

      expectCookieCleared(response);
      expect(testApp.updateRefreshTokens).not.toHaveBeenCalled();
    });

    it('does not accept the token from the request body', async () => {
      await request(testApp.app.getHttpServer())
        .post('/auth/logout')
        .send({ refresh_token: presented })
        .expect(204);

      expect(testApp.findRefreshToken).not.toHaveBeenCalled();
    });
  });
});
