import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { User } from '../src/generated/prisma/client.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
import {
  createTestApp,
  TEST_JWT_SECRET,
  type TestApp,
} from './support/test-app.js';

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

  const setCookieOf = (response: request.Response): string =>
    (response.headers['set-cookie'] as unknown as string[] | undefined)?.join(
      '; ',
    ) ?? '';

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
