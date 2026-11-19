import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { RefreshToken, User } from '../generated/prisma/client.js';
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

describe('AuthService.refresh', () => {
  const secret = 'a-test-secret-that-is-at-least-32-characters-long';
  const now = new Date('2026-11-19T10:00:00.000Z');
  const presented = 'the-refresh-token-value-the-browser-sent';

  const passwords = new PasswordHasher();
  const jwt = new JwtService({ secret });

  const user: User = {
    id: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
    email: 'hr@acme.test',
    passwordHash: 'not-used-by-refresh',
    name: 'Hana Rao',
    role: 'HR_ADMIN',
    createdAt: now,
    updatedAt: now,
  };
  const active: RefreshToken = {
    id: '5d0c6f7e-3b1a-4c55-8f0e-2a9d4b6c7e10',
    userId: user.id,
    familyId: '9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f',
    tokenHash: hashRefreshToken(presented),
    expiresAt: new Date('2026-11-25T10:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-11-18T10:00:00.000Z'),
  };

  let findById: ReturnType<typeof vi.fn>;
  let findByHash: ReturnType<typeof vi.fn>;
  let rotate: ReturnType<typeof vi.fn>;
  let revokeFamily: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    findById = vi.fn().mockResolvedValue(user);
    findByHash = vi.fn().mockResolvedValue(active);
    rotate = vi.fn().mockResolvedValue(true);
    revokeFamily = vi.fn().mockResolvedValue(undefined);
    service = new AuthService(
      { findById } as unknown as UsersRepository,
      {
        findByHash,
        rotate,
        revokeFamily,
      } as unknown as RefreshTokensRepository,
      passwords,
      jwt,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('with an active token', () => {
    it('looks the token up by its hash, never by the raw value', async () => {
      await service.refresh(presented);

      expect(findByHash).toHaveBeenCalledWith(hashRefreshToken(presented));
      expect(JSON.stringify(findByHash.mock.calls)).not.toContain(presented);
    });

    it('returns a new 15-minute access token built from the user as they are now', async () => {
      findById.mockResolvedValue({ ...user, role: 'EMPLOYEE' });

      const result = await service.refresh(presented);

      const claims = jwt.verify<{
        sub: string;
        role: string;
        iat: number;
        exp: number;
      }>(result.accessToken);
      expect(claims.sub).toBe(user.id);
      expect(claims.role).toBe('EMPLOYEE');
      expect(claims.exp - claims.iat).toBe(15 * 60);
      expect(result.expiresIn).toBe(15 * 60);
    });

    it('returns the user without the password hash', async () => {
      const result = await service.refresh(presented);

      expect(result.user).toEqual({
        id: user.id,
        email: 'hr@acme.test',
        name: 'Hana Rao',
        role: 'HR_ADMIN',
      });
    });

    it('replaces the token with a new one in the same family, valid for 7 more days', async () => {
      const result = await service.refresh(presented);

      expect(rotate).toHaveBeenCalledOnce();
      const [currentId, next, rotatedAt] = rotate.mock.calls[0] as [
        string,
        {
          userId: string;
          familyId: string;
          tokenHash: string;
          expiresAt: Date;
        },
        Date,
      ];
      expect(currentId).toBe(active.id);
      expect(next.userId).toBe(user.id);
      expect(next.familyId).toBe(active.familyId);
      expect(next.expiresAt).toEqual(new Date('2026-11-26T10:00:00.000Z'));
      expect(rotatedAt).toEqual(now);
      expect(result.refreshToken.expiresAt).toEqual(next.expiresAt);
    });

    it('hands back a different token and stores only its hash', async () => {
      const result = await service.refresh(presented);

      const next = rotate.mock.calls[0]![1] as { tokenHash: string };
      expect(result.refreshToken.value).not.toBe(presented);
      expect(next.tokenHash).toBe(hashRefreshToken(result.refreshToken.value));
      expect(JSON.stringify(rotate.mock.calls)).not.toContain(
        result.refreshToken.value,
      );
    });

    it('revokes nothing else', async () => {
      await service.refresh(presented);

      expect(revokeFamily).not.toHaveBeenCalled();
    });
  });

  describe('when the token is not usable', () => {
    // [description, how to arrange it, the token the browser sends]
    const unusable: [string, () => void, string | undefined][] = [
      ['no token is sent', () => undefined, undefined],
      ['an empty token is sent', () => undefined, ''],
      [
        'the token is unknown',
        () => findByHash.mockResolvedValue(null),
        presented,
      ],
      [
        'the token has expired',
        () =>
          findByHash.mockResolvedValue({
            ...active,
            expiresAt: new Date('2026-11-19T09:59:59.000Z'),
          }),
        presented,
      ],
      [
        'the token expires at this very moment',
        () => findByHash.mockResolvedValue({ ...active, expiresAt: now }),
        presented,
      ],
      [
        'the user no longer exists',
        () => findById.mockResolvedValue(null),
        presented,
      ],
    ];

    it.each(unusable)(
      'rejects with 401 and issues no token when %s',
      async (_label, arrange, token) => {
        arrange();

        await expect(service.refresh(token)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );

        expect(rotate).not.toHaveBeenCalled();
      },
    );

    it.each(unusable)(
      'does not revoke the family when %s',
      async (_label, arrange, token) => {
        arrange();

        await service.refresh(token).catch(() => undefined);

        expect(revokeFamily).not.toHaveBeenCalled();
      },
    );

    it('does not even query the database when no token is sent', async () => {
      await service.refresh(undefined).catch(() => undefined);

      expect(findByHash).not.toHaveBeenCalled();
    });
  });

  describe('when a token that was already used is presented again', () => {
    const replayed: RefreshToken = {
      ...active,
      revokedAt: new Date('2026-11-19T09:00:00.000Z'),
    };

    it('rejects with 401 and revokes every token in its family', async () => {
      findByHash.mockResolvedValue(replayed);

      await expect(service.refresh(presented)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(revokeFamily).toHaveBeenCalledExactlyOnceWith(
        replayed.familyId,
        now,
      );
    });

    it('issues no new token', async () => {
      findByHash.mockResolvedValue(replayed);

      await service.refresh(presented).catch(() => undefined);

      expect(rotate).not.toHaveBeenCalled();
    });

    it('treats a token that was both used and has expired as a replay', async () => {
      findByHash.mockResolvedValue({
        ...replayed,
        expiresAt: new Date('2026-11-19T09:59:59.000Z'),
      });

      await service.refresh(presented).catch(() => undefined);

      expect(revokeFamily).toHaveBeenCalledWith(replayed.familyId, now);
    });
  });

  describe('when a parallel request uses the token first', () => {
    beforeEach(() => {
      rotate.mockResolvedValue(false);
    });

    it('rejects with 401 and revokes the family, as it would for any replay', async () => {
      await expect(service.refresh(presented)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(revokeFamily).toHaveBeenCalledExactlyOnceWith(
        active.familyId,
        now,
      );
    });
  });

  it('gives one message for every failure, so the reason is not revealed', async () => {
    const messageOf = async (arrange: () => void, token = presented) => {
      findByHash.mockResolvedValue(active);
      findById.mockResolvedValue(user);
      rotate.mockResolvedValue(true);
      arrange();
      const error = await service.refresh(token).catch((e: Error) => e);
      return (error as Error).message;
    };

    // One at a time: the scenarios share the same fakes.
    const messages: string[] = [];
    messages.push(await messageOf(() => undefined, ''));
    messages.push(await messageOf(() => findByHash.mockResolvedValue(null)));
    messages.push(
      await messageOf(() =>
        findByHash.mockResolvedValue({ ...active, expiresAt: now }),
      ),
    );
    messages.push(
      await messageOf(() =>
        findByHash.mockResolvedValue({ ...active, revokedAt: now }),
      ),
    );
    messages.push(await messageOf(() => findById.mockResolvedValue(null)));
    messages.push(await messageOf(() => rotate.mockResolvedValue(false)));

    expect(messages).toHaveLength(6);
    expect(new Set(messages)).toEqual(
      new Set(['Your session has expired. Please log in again.']),
    );
  });
});

describe('AuthService.logout', () => {
  const now = new Date('2026-11-19T10:00:00.000Z');
  const presented = 'the-refresh-token-value-the-browser-sent';
  const token: RefreshToken = {
    id: '5d0c6f7e-3b1a-4c55-8f0e-2a9d4b6c7e10',
    userId: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
    familyId: '9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f',
    tokenHash: hashRefreshToken(presented),
    expiresAt: new Date('2026-11-25T10:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-11-18T10:00:00.000Z'),
  };

  let findByHash: ReturnType<typeof vi.fn>;
  let revokeFamily: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    findByHash = vi.fn().mockResolvedValue(token);
    revokeFamily = vi.fn().mockResolvedValue(undefined);
    service = new AuthService(
      {} as UsersRepository,
      { findByHash, revokeFamily } as unknown as RefreshTokensRepository,
      new PasswordHasher(),
      new JwtService({
        secret: 'a-test-secret-that-is-at-least-32-characters-long',
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks the token up by its hash, never by the raw value', async () => {
    await service.logout(presented);

    expect(findByHash).toHaveBeenCalledWith(hashRefreshToken(presented));
    expect(JSON.stringify(findByHash.mock.calls)).not.toContain(presented);
  });

  it('revokes every token in the family of the token it was given', async () => {
    await service.logout(presented);

    expect(revokeFamily).toHaveBeenCalledExactlyOnceWith(token.familyId, now);
  });

  it('revokes the family even when the token itself was already used or has expired', async () => {
    // A user can log out holding an older token while a newer one is still live.
    findByHash.mockResolvedValue({
      ...token,
      revokedAt: new Date('2026-11-19T09:00:00.000Z'),
      expiresAt: new Date('2026-11-19T09:30:00.000Z'),
    });

    await service.logout(presented);

    expect(revokeFamily).toHaveBeenCalledExactlyOnceWith(token.familyId, now);
  });

  it('does nothing, and does not fail, for a token it does not know', async () => {
    findByHash.mockResolvedValue(null);

    await expect(service.logout(presented)).resolves.toBeUndefined();

    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it.each([
    ['no token', undefined],
    ['an empty token', ''],
  ])(
    'does nothing, without querying the database, for %s',
    async (_l, value) => {
      await expect(service.logout(value)).resolves.toBeUndefined();

      expect(findByHash).not.toHaveBeenCalled();
      expect(revokeFamily).not.toHaveBeenCalled();
    },
  );
});

describe('AuthService.me', () => {
  const now = new Date('2026-11-19T10:00:00.000Z');
  const user: User = {
    id: '0b5e6a8e-2f43-4d3e-9a57-6f0f6f1b7c11',
    email: 'hr@acme.test',
    passwordHash: 'must-never-be-returned',
    name: 'Hana Rao',
    role: 'HR_ADMIN',
    createdAt: now,
    updatedAt: now,
  };

  let findById: ReturnType<typeof vi.fn>;
  let service: AuthService;

  beforeEach(() => {
    findById = vi.fn().mockResolvedValue(user);
    service = new AuthService(
      { findById } as unknown as UsersRepository,
      {} as RefreshTokensRepository,
      new PasswordHasher(),
      new JwtService({
        secret: 'a-test-secret-that-is-at-least-32-characters-long',
      }),
    );
  });

  it('looks the user up by the id it is given', async () => {
    await service.me(user.id);

    expect(findById).toHaveBeenCalledWith(user.id);
  });

  it('returns the user as stored now, without the password hash', async () => {
    const result = await service.me(user.id);

    expect(result).toEqual({
      id: user.id,
      email: 'hr@acme.test',
      name: 'Hana Rao',
      role: 'HR_ADMIN',
    });
    expect(JSON.stringify(result)).not.toContain(user.passwordHash);
  });

  it('rejects with 401 when the user no longer exists, even though their token is still valid', async () => {
    findById.mockResolvedValue(null);

    await expect(service.me(user.id)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
