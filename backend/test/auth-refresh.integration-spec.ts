import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../src/auth/refresh-token.js';
import { RefreshTokensRepository } from '../src/auth/refresh-tokens.repository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { UsersRepository } from '../src/users/users.repository.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/**
 * Refresh-token rotation against the real database: the conditional update,
 * the family revocation and the foreign keys. Every test is rolled back.
 */
describe('refresh (integration)', () => {
  const password = 'correct horse battery staple';
  const passwords = new PasswordHasher();
  const jwt = new JwtService({
    secret: 'integration-test-secret-at-least-32-characters-long',
  });
  const DAY_MS = 24 * 60 * 60 * 1000;

  let prisma: PrismaClient;
  let passwordHash: string;

  beforeAll(async () => {
    prisma = createTestPrisma();
    passwordHash = await passwords.hash(password);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createUser = (tx: Tx, email = 'hr@acme.test') =>
    tx.user.create({
      data: { email, passwordHash, name: 'Hana Rao', role: 'HR_ADMIN' },
    });

  const serviceOn = (tx: Tx) =>
    new AuthService(
      new UsersRepository(asPrismaService(tx)),
      new RefreshTokensRepository(asPrismaService(tx)),
      passwords,
      jwt,
    );

  const repositoryOn = (tx: Tx) =>
    new RefreshTokensRepository(asPrismaService(tx));

  /** Inserts a token directly, bypassing login, and returns the raw value. */
  const insertToken = async (
    tx: Tx,
    userId: string,
    options: { familyId?: string; expiresAt?: Date; revokedAt?: Date } = {},
  ) => {
    const { token, hash } = generateRefreshToken();
    const row = await tx.refreshToken.create({
      data: {
        userId,
        familyId: options.familyId ?? randomUUID(),
        tokenHash: hash,
        expiresAt: options.expiresAt ?? new Date(Date.now() + 7 * DAY_MS),
        revokedAt: options.revokedAt ?? null,
      },
    });
    return { token, row };
  };

  describe('AuthService.refresh', () => {
    it('retires the presented token and stores an active replacement in the same family', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const service = serviceOn(tx);
        const login = await service.login('hr@acme.test', password);

        const refreshed = await service.refresh(login.refreshToken.value);

        const rows = await tx.refreshToken.findMany({
          where: { userId: user.id },
        });
        expect(rows).toHaveLength(2);
        const oldRow = rows.find(
          (r) => r.tokenHash === hashRefreshToken(login.refreshToken.value),
        )!;
        const newRow = rows.find(
          (r) => r.tokenHash === hashRefreshToken(refreshed.refreshToken.value),
        )!;
        expect(oldRow.revokedAt).not.toBeNull();
        expect(newRow.revokedAt).toBeNull();
        expect(newRow.familyId).toBe(oldRow.familyId);
        expect(newRow.userId).toBe(user.id);
        expect(newRow.expiresAt).toEqual(refreshed.refreshToken.expiresAt);
      }));

    it('returns the user and a usable access token', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const service = serviceOn(tx);
        const login = await service.login('hr@acme.test', password);

        const refreshed = await service.refresh(login.refreshToken.value);

        expect(refreshed.user.id).toBe(user.id);
        expect(jwt.verify<{ sub: string }>(refreshed.accessToken).sub).toBe(
          user.id,
        );
      }));

    it('keeps exactly one active token however many times it is refreshed', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const service = serviceOn(tx);
        let current = (await service.login('hr@acme.test', password))
          .refreshToken.value;

        for (let i = 0; i < 3; i++) {
          current = (await service.refresh(current)).refreshToken.value;
        }

        const rows = await tx.refreshToken.findMany({
          where: { userId: user.id },
        });
        expect(rows).toHaveLength(4);
        expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
        const active = rows.filter((r) => r.revokedAt === null);
        expect(active).toHaveLength(1);
        expect(active[0]!.tokenHash).toBe(hashRefreshToken(current));
      }));

    it('revokes the whole family when an already used token is replayed, newest token included', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const service = serviceOn(tx);
        const first = (await service.login('hr@acme.test', password))
          .refreshToken.value;
        const second = (await service.refresh(first)).refreshToken.value;

        await expect(service.refresh(first)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );

        const rows = await tx.refreshToken.findMany({
          where: { userId: user.id },
        });
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
        await expect(service.refresh(second)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }));

    it('leaves the same user’s other sessions alone when one family is revoked', () =>
      inRollback(prisma, async (tx) => {
        await createUser(tx);
        const service = serviceOn(tx);
        const laptop = (await service.login('hr@acme.test', password))
          .refreshToken.value;
        const phone = (await service.login('hr@acme.test', password))
          .refreshToken.value;
        await service.refresh(laptop);

        await expect(service.refresh(laptop)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );

        const stillWorks = await service.refresh(phone);
        expect(stillWorks.accessToken).toEqual(expect.any(String));
      }));

    it('does not touch a different user’s tokens when a token is replayed', () =>
      inRollback(prisma, async (tx) => {
        await createUser(tx, 'hr@acme.test');
        const other = await createUser(tx, 'other@acme.test');
        const service = serviceOn(tx);
        const first = (await service.login('hr@acme.test', password))
          .refreshToken.value;
        await service.login('other@acme.test', password);
        await service.refresh(first);

        await service.refresh(first).catch(() => undefined);

        const otherRows = await tx.refreshToken.findMany({
          where: { userId: other.id },
        });
        expect(otherRows).toHaveLength(1);
        expect(otherRows[0]!.revokedAt).toBeNull();
      }));

    it('rejects an expired token and changes nothing', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const { token } = await insertToken(tx, user.id, {
          expiresAt: new Date(Date.now() - 1000),
        });

        await expect(serviceOn(tx).refresh(token)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );

        const rows = await tx.refreshToken.findMany({
          where: { userId: user.id },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]!.revokedAt).toBeNull();
      }));

    it('rejects a token that was never issued', () =>
      inRollback(prisma, async (tx) => {
        await createUser(tx);

        await expect(
          serviceOn(tx).refresh(generateRefreshToken().token),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }));
  });

  describe('RefreshTokensRepository', () => {
    it('findByHash returns the matching token, and null for an unknown hash', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const { token, row } = await insertToken(tx, user.id);

        const found = await repositoryOn(tx).findByHash(
          hashRefreshToken(token),
        );
        const missing = await repositoryOn(tx).findByHash(
          hashRefreshToken('no-such-token'),
        );

        expect(found?.id).toBe(row.id);
        expect(missing).toBeNull();
      }));

    describe('rotate', () => {
      const nextFor = (userId: string, familyId: string) => ({
        userId,
        familyId,
        tokenHash: generateRefreshToken().hash,
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      });

      it('retires the token and inserts the replacement, returning true', () =>
        inRollback(prisma, async (tx) => {
          const user = await createUser(tx);
          const { row } = await insertToken(tx, user.id);
          const now = new Date();
          const next = nextFor(user.id, row.familyId);

          const rotated = await repositoryOn(tx).rotate(row.id, next, now);

          expect(rotated).toBe(true);
          const old = await tx.refreshToken.findUniqueOrThrow({
            where: { id: row.id },
          });
          expect(old.revokedAt).toEqual(now);
          const replacement = await tx.refreshToken.findUnique({
            where: { tokenHash: next.tokenHash },
          });
          expect(replacement?.revokedAt).toBeNull();
        }));

      it('returns false and inserts nothing when the token was already retired', () =>
        inRollback(prisma, async (tx) => {
          const user = await createUser(tx);
          const retiredAt = new Date(Date.now() - 60_000);
          const { row } = await insertToken(tx, user.id, {
            revokedAt: retiredAt,
          });
          const next = nextFor(user.id, row.familyId);

          const rotated = await repositoryOn(tx).rotate(
            row.id,
            next,
            new Date(),
          );

          expect(rotated).toBe(false);
          expect(
            await tx.refreshToken.findUnique({
              where: { tokenHash: next.tokenHash },
            }),
          ).toBeNull();
          const old = await tx.refreshToken.findUniqueOrThrow({
            where: { id: row.id },
          });
          expect(old.revokedAt).toEqual(retiredAt);
        }));
    });

    describe('revokeFamily', () => {
      it('revokes every active token in the family and no others', () =>
        inRollback(prisma, async (tx) => {
          const user = await createUser(tx);
          const family = randomUUID();
          const a = await insertToken(tx, user.id, { familyId: family });
          const b = await insertToken(tx, user.id, { familyId: family });
          const elsewhere = await insertToken(tx, user.id);
          const now = new Date();

          await repositoryOn(tx).revokeFamily(family, now);

          const revokedAt = async (id: string) =>
            (await tx.refreshToken.findUniqueOrThrow({ where: { id } }))
              .revokedAt;
          expect(await revokedAt(a.row.id)).toEqual(now);
          expect(await revokedAt(b.row.id)).toEqual(now);
          expect(await revokedAt(elsewhere.row.id)).toBeNull();
        }));

      it('keeps the original time on a token that was already revoked', () =>
        inRollback(prisma, async (tx) => {
          const user = await createUser(tx);
          const family = randomUUID();
          const earlier = new Date(Date.now() - 3600_000);
          const old = await insertToken(tx, user.id, {
            familyId: family,
            revokedAt: earlier,
          });

          await repositoryOn(tx).revokeFamily(family, new Date());

          const row = await tx.refreshToken.findUniqueOrThrow({
            where: { id: old.row.id },
          });
          expect(row.revokedAt).toEqual(earlier);
        }));
    });
  });

  describe('UsersRepository.findById', () => {
    it('finds a user by id, and returns null for an unknown id', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx);
        const repository = new UsersRepository(asPrismaService(tx));

        expect((await repository.findById(user.id))?.email).toBe(
          'hr@acme.test',
        );
        expect(await repository.findById(randomUUID())).toBeNull();
      }));
  });
});
