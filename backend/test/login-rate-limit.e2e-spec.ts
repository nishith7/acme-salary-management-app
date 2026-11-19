import request from 'supertest';
import type { User } from '../src/generated/prisma/client.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// Runs before the imports above: the environment is validated as soon as
// app.module.ts loads. Each test file runs in its own worker, so this does not
// leak into other specs. One proxy is trusted here, as it would be behind a
// single load balancer; the untrusted case is in login-rate-limit-untrusted.
vi.hoisted(() => {
  process.env['LOGIN_RATE_LIMIT'] = '3';
  process.env['TRUST_PROXY'] = '1';
});

describe('Login rate limit (e2e), one trusted proxy', () => {
  const LIMIT = 3;
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

  // The counters live for the whole app, so every test uses addresses of its own.
  let nextHost = 1;
  const newClient = () => `198.51.100.${nextHost++}`;

  const wrong = { email: 'hr@acme.test', password: 'a wrong password' };
  const right = { email: 'hr@acme.test', password };

  /** One login request that reaches the app through a proxy reporting `forwardedFor`. */
  const attempt = (forwardedFor: string, body: object = wrong) =>
    request(testApp.app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send(body);

  const exhaust = async (client: string, body: object = wrong) => {
    for (let i = 0; i < LIMIT; i++) {
      await attempt(client, body);
    }
  };

  it('answers the first 3 attempts normally and the 4th with 429 and a message', async () => {
    const client = newClient();
    for (let i = 0; i < LIMIT; i++) {
      await attempt(client).expect(401);
    }

    const blocked = await attempt(client).expect(429);

    expect(blocked.body).toEqual({
      statusCode: 429,
      message: 'Too many login attempts. Try again later.',
    });
  });

  it('tells the client how long to wait, in whole seconds within the 60 second window', async () => {
    const client = newClient();
    await exhaust(client);

    const blocked = await attempt(client).expect(429);

    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('refuses even the correct password once the limit is reached, and never reaches the database', async () => {
    const client = newClient();
    await exhaust(client);
    expect(testApp.findUser).toHaveBeenCalledTimes(LIMIT);

    const response = await attempt(client, right).expect(429);

    expect(testApp.findUser).toHaveBeenCalledTimes(LIMIT);
    expect(testApp.createRefreshToken).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('counts successful logins too, so the limit cannot be used to probe passwords', async () => {
    const client = newClient();
    for (let i = 0; i < LIMIT; i++) {
      await attempt(client, right).expect(200);
    }

    await attempt(client, right).expect(429);
  });

  it('counts requests with an invalid body as attempts', async () => {
    const client = newClient();
    for (let i = 0; i < LIMIT; i++) {
      await attempt(client, {}).expect(400);
    }

    await attempt(client, {}).expect(429);
  });

  it('keeps a separate count for each client address', async () => {
    const exhausted = newClient();
    const other = newClient();
    await exhaust(exhausted);
    await attempt(exhausted).expect(429);

    await attempt(other).expect(401);
  });

  it('counts by the address the trusted proxy reports, not by one the client made up', async () => {
    const real = newClient();
    // A client can put anything it likes at the front of X-Forwarded-For.
    // The proxy appends the address it actually saw, at the end.
    for (let i = 1; i <= LIMIT; i++) {
      await attempt(`10.0.0.${i}, ${real}`).expect(401);
    }

    await attempt(`10.0.0.99, ${real}`).expect(429);
  });

  it('does not limit anything else, so a blocked login attempt cannot lock out an active session', async () => {
    const client = newClient();
    await exhaust(client);
    await attempt(client).expect(429);
    const from = (call: request.Test) => call.set('X-Forwarded-For', client);
    const http = testApp.app.getHttpServer();

    await from(request(http).get('/health')).expect(200);
    await from(request(http).post('/auth/refresh')).expect(401);
    await from(request(http).post('/auth/logout')).expect(204);
    const me = await from(request(http).get('/auth/me')).expect(401);
    expect((me.body as { message: string }).message).toBe(
      'Invalid or missing access token',
    );
  });

  describe('when the window has passed', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets the client try again', async () => {
      const client = newClient();
      await exhaust(client);
      await attempt(client).expect(429);

      vi.setSystemTime(Date.now() + 61_000);

      await attempt(client).expect(401);
    });

    it('still blocks the client just before the window ends', async () => {
      const client = newClient();
      await exhaust(client);

      vi.setSystemTime(Date.now() + 59_000);

      await attempt(client).expect(429);
    });
  });
});
