import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { httpContext } from '../../test/support/execution-context.js';
import type { AuthenticatedRequest } from './authenticated-user.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';

class ProbeController {
  protectedRoute() {}

  @Public()
  publicRoute() {}
}

@Public()
class OpenController {
  anyRoute() {}
}

describe('JwtAuthGuard', () => {
  const secret = 'a-test-secret-that-is-at-least-32-characters-long';
  const userId = '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11';
  const now = new Date('2026-11-19T10:00:00.000Z');
  const jwt = new JwtService({ secret });
  const guard = new JwtAuthGuard(jwt, new Reflector());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const requestWith = (authorization?: string): AuthenticatedRequest =>
    ({
      headers: authorization === undefined ? {} : { authorization },
    }) as AuthenticatedRequest;

  const protectedRoute = (request: AuthenticatedRequest) =>
    httpContext(request, {
      handler: ProbeController.prototype.protectedRoute,
      controller: ProbeController,
    });

  const sign = (
    claims: object = { sub: userId, role: 'HR_ADMIN' },
    options: { algorithm: 'HS256' | 'HS512'; expiresIn: number } = {
      algorithm: 'HS256',
      expiresIn: 900,
    },
    signer: JwtService = jwt,
  ) => signer.signAsync(claims, options);

  const base64url = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  describe('on a public route', () => {
    it('lets a request through without looking at any token', async () => {
      const request = requestWith('Bearer garbage');
      const context = httpContext(request, {
        handler: ProbeController.prototype.publicRoute,
        controller: ProbeController,
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('lets a request through when the whole controller is public', async () => {
      const context = httpContext(requestWith(), {
        handler: OpenController.prototype.anyRoute,
        controller: OpenController,
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('on a protected route', () => {
    it('accepts a valid token and attaches the user’s id and role to the request', async () => {
      const request = requestWith(`Bearer ${await sign()}`);

      await expect(guard.canActivate(protectedRoute(request))).resolves.toBe(
        true,
      );

      expect(request.user).toEqual({ id: userId, role: 'HR_ADMIN' });
    });

    it('accepts the Bearer scheme in any letter case', async () => {
      const request = requestWith(`bearer ${await sign()}`);

      await expect(guard.canActivate(protectedRoute(request))).resolves.toBe(
        true,
      );
    });

    it('takes the role from the token, so an EMPLOYEE token is an EMPLOYEE', async () => {
      const request = requestWith(
        `Bearer ${await sign({ sub: userId, role: 'EMPLOYEE' })}`,
      );

      await guard.canActivate(protectedRoute(request));

      expect(request.user?.role).toBe('EMPLOYEE');
    });

    // [description, how to build the Authorization header]
    const rejected: [string, () => Promise<string | undefined>][] = [
      ['there is no Authorization header', async () => undefined],
      ['the scheme is not Bearer', async () => 'Basic dXNlcjpwYXNz'],
      ['the Bearer token is missing', async () => 'Bearer'],
      ['the Bearer token is blank', async () => 'Bearer    '],
      ['there is more than one value after Bearer', async () => 'Bearer a b'],
      ['the token is not a JWT', async () => 'Bearer not-a-jwt'],
      [
        'the token was signed with a different secret',
        async () =>
          `Bearer ${await sign(
            undefined,
            undefined,
            new JwtService({
              secret: 'another-secret-that-is-at-least-32-characters-long',
            }),
          )}`,
      ],
      [
        'the token has expired',
        async () => {
          const token = await sign();
          vi.setSystemTime(new Date(now.getTime() + 15 * 60 * 1000 + 1000));
          return `Bearer ${token}`;
        },
      ],
      [
        'the token uses a different algorithm than HS256, even with the right secret',
        async () =>
          `Bearer ${await sign(undefined, { algorithm: 'HS512', expiresIn: 900 })}`,
      ],
      [
        'the token is unsigned (alg none)',
        async () =>
          `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
            sub: userId,
            role: 'HR_ADMIN',
            exp: Math.floor(now.getTime() / 1000) + 900,
          })}.`,
      ],
      [
        'the token has no expiry',
        async () => {
          const token = await jwt.signAsync(
            { sub: userId, role: 'HR_ADMIN' },
            { algorithm: 'HS256' },
          );
          return `Bearer ${token}`;
        },
      ],
      [
        'the token has no role',
        async () => `Bearer ${await sign({ sub: userId })}`,
      ],
      [
        'the token has an unknown role',
        async () => `Bearer ${await sign({ sub: userId, role: 'ROOT' })}`,
      ],
      [
        'the token has no subject',
        async () => `Bearer ${await sign({ role: 'HR_ADMIN' })}`,
      ],
      [
        'the token’s subject is not a user id',
        async () => `Bearer ${await sign({ sub: 'admin', role: 'HR_ADMIN' })}`,
      ],
    ];

    it.each(rejected)(
      'rejects with 401 when %s',
      async (_label, authorization) => {
        const request = requestWith(await authorization());

        await expect(
          guard.canActivate(protectedRoute(request)),
        ).rejects.toBeInstanceOf(UnauthorizedException);

        expect(request.user).toBeUndefined();
      },
    );

    it('gives one message for every rejection, so it does not help someone forging tokens', async () => {
      const messages = new Set<string>();
      for (const [, authorization] of rejected) {
        const error = await guard
          .canActivate(protectedRoute(requestWith(await authorization())))
          .catch((e: Error) => e);
        messages.add((error as Error).message);
      }

      expect([...messages]).toEqual(['Invalid or missing access token']);
    });
  });
});
