import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { hashRefreshToken } from '../src/auth/refresh-token.js';
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
 * Login against the real database: the repositories, the unique email, the
 * refresh_tokens foreign key and the stored hash. Every test is rolled back.
 */
describe('login (integration)', () => {
  const password = 'correct horse battery staple';
  const passwords = new PasswordHasher();
  const jwt = new JwtService({
    secret: 'integration-test-secret-at-least-32-characters-long',
  });

  let prisma: PrismaClient;
  let passwordHash: string;

  beforeAll(async () => {
    prisma = createTestPrisma();
    passwordHash = await passwords.hash(password);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createUser = (tx: Tx, email: string) =>
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

  it('stores one active refresh token, as a hash, for the user who logged in', () =>
    inRollback(prisma, async (tx) => {
      const user = await createUser(tx, 'hr@acme.test');

      const result = await serviceOn(tx).login('hr@acme.test', password);

      const rows = await tx.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(1);
      const [row] = rows;
      expect(row!.tokenHash).toBe(hashRefreshToken(result.refreshToken.value));
      expect(row!.tokenHash).not.toBe(result.refreshToken.value);
      expect(row!.revokedAt).toBeNull();
      expect(row!.expiresAt).toEqual(result.refreshToken.expiresAt);
      expect(row!.familyId).toMatch(/^[0-9a-f-]{36}$/);
    }));

  it('starts a separate token family for each login of the same user', () =>
    inRollback(prisma, async (tx) => {
      const user = await createUser(tx, 'hr@acme.test');
      const service = serviceOn(tx);

      await service.login('hr@acme.test', password);
      await service.login('hr@acme.test', password);

      const rows = await tx.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]!.familyId).not.toBe(rows[1]!.familyId);
    }));

  it('rejects a wrong password and stores no refresh token', () =>
    inRollback(prisma, async (tx) => {
      const user = await createUser(tx, 'hr@acme.test');

      await expect(
        serviceOn(tx).login('hr@acme.test', 'wrong password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(await tx.refreshToken.count({ where: { userId: user.id } })).toBe(
        0,
      );
    }));

  it('rejects an email that does not exist', () =>
    inRollback(prisma, async (tx) => {
      await expect(
        serviceOn(tx).login('nobody@acme.test', password),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }));

  describe('UsersRepository.findByEmail', () => {
    it('finds a user by their exact email', () =>
      inRollback(prisma, async (tx) => {
        const user = await createUser(tx, 'hr@acme.test');

        const found = await new UsersRepository(
          asPrismaService(tx),
        ).findByEmail('hr@acme.test');

        expect(found?.id).toBe(user.id);
      }));

    it('is case-sensitive, which is why the API lower-cases emails before calling it', () =>
      inRollback(prisma, async (tx) => {
        await createUser(tx, 'hr@acme.test');

        const found = await new UsersRepository(
          asPrismaService(tx),
        ).findByEmail('HR@ACME.TEST');

        expect(found).toBeNull();
      }));
  });
});
