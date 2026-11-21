import request from 'supertest';
import type { User } from '../src/generated/prisma/client.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// Runs before the imports above, because the environment is validated when app.module.ts
// loads. This file runs the app the way it is deployed when the site and the API are on
// different hosts: the refresh cookie allowed cross-site, and one site allowed to call it.
vi.hoisted(() => {
  process.env['REFRESH_COOKIE_SAMESITE'] = 'none';
  process.env['CORS_ORIGINS'] = 'https://app.example.test';
});

describe('the refresh cookie when the site is on another host (e2e)', () => {
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
    testApp.findRefreshToken.mockReset().mockResolvedValue(null);
    testApp.updateRefreshTokens.mockReset().mockResolvedValue({ count: 0 });
  });

  const server = () => testApp.app.getHttpServer();

  it('is sent cross-site and only over HTTPS, even though the tests are not in production', async () => {
    const response = await request(server())
      .post('/auth/login')
      .send({ email: 'hr@acme.test', password })
      .expect(200);

    const cookie = (response.headers['set-cookie'] as unknown as string[]).join(
      '; ',
    );
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/auth');
  });

  it('is cleared with the same flags, so the browser really deletes it', async () => {
    const response = await request(server()).post('/auth/logout').expect(204);

    const cookie = (response.headers['set-cookie'] as unknown as string[]).join(
      '; ',
    );
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
  });

  it('is only used for a refresh asked for by the allowed site, or by something that is not a browser page', async () => {
    const fromEvil = await request(server())
      .post('/auth/refresh')
      .set('Origin', 'https://evil.example');
    const fromApp = await request(server())
      .post('/auth/refresh')
      .set('Origin', 'https://app.example.test');
    const fromCurl = await request(server()).post('/auth/refresh');

    // The other site is refused outright and never reaches the database.
    expect(fromEvil.status).toBe(403);
    expect(testApp.findRefreshToken).toHaveBeenCalledTimes(0);
    // The allowed site and a plain client get as far as the (empty) cookie: unauthorised, not forbidden.
    expect(fromApp.status).toBe(401);
    expect(fromCurl.status).toBe(401);
  });

  it('cannot be used by another site to sign someone out', async () => {
    const fromEvil = await request(server())
      .post('/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', 'refresh_token=anything');

    expect(fromEvil.status).toBe(403);
    expect(testApp.updateRefreshTokens).not.toHaveBeenCalled();
    expect(testApp.findRefreshToken).not.toHaveBeenCalled();
  });
});
