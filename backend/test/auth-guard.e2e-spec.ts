import { Controller, Get } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { Public } from '../src/auth/public.decorator.js';
import { Roles } from '../src/auth/roles.decorator.js';
import {
  createTestApp,
  TEST_JWT_SECRET,
  type TestApp,
} from './support/test-app.js';

/**
 * Routes that exist only in this test. No real route is restricted to a role
 * yet, so these prove the global guards on their own. Real controllers get
 * the same treatment, because the guards are registered for the whole app.
 */
@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  @Get('any')
  anySignedInUser() {
    return { ok: true };
  }

  @Roles('HR_ADMIN')
  @Get('hr')
  hrOnly() {
    return { ok: true };
  }
}

describe('Global authentication (e2e)', () => {
  const userId = '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11';
  const jwt = new JwtService({ secret: TEST_JWT_SECRET });
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    testApp.queryRaw.mockReset();
    testApp.findUser.mockReset();
    testApp.findRefreshToken.mockReset().mockResolvedValue(null);
    testApp.updateRefreshTokens.mockReset();
  });

  const accessToken = (role: 'HR_ADMIN' | 'EMPLOYEE' = 'HR_ADMIN') =>
    jwt.signAsync(
      { sub: userId, role },
      { algorithm: 'HS256', expiresIn: 900 },
    );

  const get = (path: string, token?: string) => {
    const call = request(testApp.app.getHttpServer()).get(path);
    return token === undefined
      ? call
      : call.set('Authorization', `Bearer ${token}`);
  };

  const expectNoDatabaseAccess = () => {
    expect(testApp.queryRaw).not.toHaveBeenCalled();
    expect(testApp.findUser).not.toHaveBeenCalled();
    expect(testApp.findRefreshToken).not.toHaveBeenCalled();
  };

  describe('routes that are public on purpose', () => {
    it('serves GET /health without a token', async () => {
      await get('/health').expect(200);
    });

    it('serves the Swagger UI and the OpenAPI document without a token', async () => {
      await get('/docs').expect(200);
      await get('/docs-json').expect(200);
    });

    it('reaches the login handler without a token (an empty body is a 400, not a 401)', async () => {
      await request(testApp.app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('reaches the refresh handler without an access token (it answers with its own 401 message)', async () => {
      const response = await request(testApp.app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);

      expect(response.body).toMatchObject({
        message: 'Your session has expired. Please log in again.',
      });
    });

    it('reaches the logout handler without an access token, so an expired session can still log out', async () => {
      await request(testApp.app.getHttpServer())
        .post('/auth/logout')
        .expect(204);
    });

    it('serves a route marked @Public() without a token', async () => {
      await get('/probe/open').expect(200);
    });
  });

  describe('every other route', () => {
    it('returns 401 without a token', async () => {
      const response = await get('/probe/any').expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid or missing access token',
      });
    });

    it('returns 200 with a valid token, and checks it without touching the database', async () => {
      await get('/probe/any', await accessToken()).expect(200);

      expectNoDatabaseAccess();
    });

    it('does not touch the database when it refuses a request', async () => {
      await get('/probe/any').expect(401);

      expectNoDatabaseAccess();
    });

    it('returns 401 for an expired token', async () => {
      const expired = await jwt.signAsync(
        {
          sub: userId,
          role: 'HR_ADMIN',
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        { algorithm: 'HS256' },
      );

      await get('/probe/any', expired).expect(401);
    });

    it('returns 401 for a token signed with a different secret', async () => {
      const forged = await new JwtService({
        secret: 'not-the-servers-secret-but-long-enough-to-be-valid',
      }).signAsync(
        { sub: userId, role: 'HR_ADMIN' },
        { algorithm: 'HS256', expiresIn: 900 },
      );

      await get('/probe/any', forged).expect(401);
    });

    it('returns 401 for an unsigned token that claims alg none', async () => {
      const part = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${part({ alg: 'none', typ: 'JWT' })}.${part({
        sub: userId,
        role: 'HR_ADMIN',
        exp: Math.floor(Date.now() / 1000) + 900,
      })}.`;

      await get('/probe/any', unsigned).expect(401);
    });

    it('does not take the refresh cookie for an access token', async () => {
      await request(testApp.app.getHttpServer())
        .get('/probe/any')
        .set('Cookie', 'refresh_token=anything')
        .expect(401);
    });
  });

  describe('role checks', () => {
    it('lets an HR_ADMIN into a route restricted to HR_ADMIN', async () => {
      await get('/probe/hr', await accessToken('HR_ADMIN')).expect(200);
    });

    it('returns 403 for a signed-in user without the role', async () => {
      const response = await get(
        '/probe/hr',
        await accessToken('EMPLOYEE'),
      ).expect(403);

      expect(response.body).toMatchObject({ statusCode: 403 });
    });

    it('returns 401, not 403, when there is no token at all, because authentication is checked first', async () => {
      await get('/probe/hr').expect(401);
    });

    it('lets any signed-in role into a route that names no role', async () => {
      await get('/probe/any', await accessToken('EMPLOYEE')).expect(200);
    });
  });
});
