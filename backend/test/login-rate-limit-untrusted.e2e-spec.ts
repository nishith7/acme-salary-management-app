import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

// Runs before the imports above, because the environment is validated when
// app.module.ts loads. TRUST_PROXY=0 means no proxy is trusted: the app is
// reached directly, so X-Forwarded-For is whatever the client chooses to send.
vi.hoisted(() => {
  process.env['LOGIN_RATE_LIMIT'] = '3';
  process.env['TRUST_PROXY'] = '0';
});

describe('Login rate limit (e2e), no trusted proxy', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    testApp.findUser.mockReset().mockResolvedValue(null);
  });

  const attempt = (forwardedFor: string) =>
    request(testApp.app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email: 'hr@acme.test', password: 'a wrong password' });

  it('ignores X-Forwarded-For, so a client cannot dodge the limit by changing it', async () => {
    await attempt('1.1.1.1').expect(401);
    await attempt('2.2.2.2').expect(401);
    await attempt('3.3.3.3').expect(401);

    // Three different "addresses", one real connection: the fourth is blocked.
    await attempt('4.4.4.4').expect(429);
  });
});
