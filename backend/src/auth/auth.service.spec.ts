import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../generated/prisma/client.js';
import type { UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { hashRefreshToken } from './refresh-token.js';
import type { RefreshTokensRepository } from './refresh-tokens.repository.js';

describe('AuthService.login', () => {
  const secret = 'a-test-secret-that-is-at-least-32-characters-long';
  const now = new Date('2026-11-19T10:00:00.000Z');
  const password = 'correct horse battery staple';

  const passwords = new PasswordHasher();
  const jwt = new JwtService({ secret });

  let user: User;
  let findByEmail: ReturnType<typeof vi.fn>;
  let createRefreshToken: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeAll(async () => {
    user = {
      id: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
      email: 'hr@acme.test',
      passwordHash: await passwords.hash(password),
      name: 'Hana Rao',
      role: 'HR_ADMIN',
      createdAt: now,
      updatedAt: now,
    };
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    findByEmail = vi.fn().mockResolvedValue(user);
    createRefreshToken = vi.fn().mockResolvedValue({});
    service = new AuthService(
      { findByEmail } as unknown as UsersRepository,
      { create: createRefreshToken } as unknown as RefreshTokensRepository,
      passwords,
      jwt,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('with the right credentials', () => {
    it('returns an HS256 access token for the user that lasts 15 minutes', async () => {
      const result = await service.login(user.email, password);

      const header = JSON.parse(
        Buffer.from(result.accessToken.split('.')[0]!, 'base64url').toString(),
      ) as { alg: string };
      const claims = jwt.verify<{
        sub: string;
        role: string;
        iat: number;
        exp: number;
      }>(result.accessToken);

      expect(header.alg).toBe('HS256');
      expect(claims.sub).toBe(user.id);
      expect(claims.role).toBe('HR_ADMIN');
      expect(claims.exp - claims.iat).toBe(15 * 60);
      expect(result.expiresIn).toBe(15 * 60);
    });

    it('returns the user without the password hash', async () => {
      const result = await service.login(user.email, password);

      expect(result.user).toEqual({
        id: user.id,
        email: 'hr@acme.test',
        name: 'Hana Rao',
        role: 'HR_ADMIN',
      });
    });

    it('stores only the hash of a new refresh token, valid for 7 days', async () => {
      const result = await service.login(user.email, password);

      expect(createRefreshToken).toHaveBeenCalledOnce();
      const stored = createRefreshToken.mock.calls[0]![0] as {
        userId: string;
        familyId: string;
        tokenHash: string;
        expiresAt: Date;
      };
      expect(stored.userId).toBe(user.id);
      expect(stored.tokenHash).toBe(
        hashRefreshToken(result.refreshToken.value),
      );
      expect(stored.tokenHash).not.toBe(result.refreshToken.value);
      expect(JSON.stringify(stored)).not.toContain(result.refreshToken.value);
      expect(stored.expiresAt).toEqual(new Date('2026-11-26T10:00:00.000Z'));
      expect(result.refreshToken.expiresAt).toEqual(stored.expiresAt);
    });

    it('starts a new token family for every login', async () => {
      const first = await service.login(user.email, password);
      const second = await service.login(user.email, password);

      const families = createRefreshToken.mock.calls.map(
        (call) => (call[0] as { familyId: string }).familyId,
      );
      expect(families[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(families[0]).not.toBe(families[1]);
      expect(first.refreshToken.value).not.toBe(second.refreshToken.value);
    });

    it('looks the user up by the email it is given', async () => {
      await service.login(user.email, password);

      expect(findByEmail).toHaveBeenCalledWith('hr@acme.test');
    });
  });

  describe('with bad credentials', () => {
    it('rejects a wrong password and creates no refresh token', async () => {
      await expect(service.login(user.email, 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(createRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects an unknown email and creates no refresh token', async () => {
      findByEmail.mockResolvedValue(null);

      await expect(
        service.login('nobody@acme.test', password),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(createRefreshToken).not.toHaveBeenCalled();
    });

    it('gives the same message for a wrong password and an unknown email', async () => {
      const messageOf = async (email: string, pass: string) => {
        try {
          await service.login(email, pass);
        } catch (error) {
          return (error as Error).message;
        }
        return undefined;
      };

      findByEmail.mockResolvedValueOnce(user);
      const wrongPassword = await messageOf(user.email, 'wrong');
      findByEmail.mockResolvedValueOnce(null);
      const unknownEmail = await messageOf('nobody@acme.test', password);

      expect(wrongPassword).toBe('Invalid email or password');
      expect(unknownEmail).toBe(wrongPassword);
    });

    it('still runs a password check when the email is unknown, so timing does not reveal accounts', async () => {
      findByEmail.mockResolvedValue(null);
      const verify = vi.spyOn(passwords, 'verify');

      await service.login('nobody@acme.test', password).catch(() => undefined);

      expect(verify).toHaveBeenCalledWith(undefined, password);
      verify.mockRestore();
    });
  });
});
