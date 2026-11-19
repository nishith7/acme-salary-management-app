import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { generateRefreshToken } from '../src/auth/refresh-token.js';
import { RefreshTokensRepository } from '../src/auth/refresh-tokens.repository.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { UsersRepository } from '../src/users/users.repository.js';
import {
  asPrismaService,
  createTestPrisma,
  inRollback,
  type Tx,
} from './support/test-db.js';

/** Logout against the real database. Every test is rolled back. */
describe('logout (integration)', () => {
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

  const createUser = (tx: Tx) =>
    tx.user.create({
      data: {
        email: 'hr@acme.test',
        passwordHash,
        name: 'Hana Rao',
        role: 'HR_ADMIN',
      },
    });

  const serviceOn = (tx: Tx) =>
    new AuthService(
      new UsersRepository(asPrismaService(tx)),
      new RefreshTokensRepository(asPrismaService(tx)),
      passwords,
      jwt,
    );

  it('revokes every token of the session, including the newest, so none can be refreshed', () =>
    inRollback(prisma, async (tx) => {
      const user = await createUser(tx);
      const service = serviceOn(tx);
      const first = (await service.login('hr@acme.test', password)).refreshToken
        .value;
      const newest = (await service.refresh(first)).refreshToken.value;

      await service.logout(newest);

      const rows = await tx.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      await expect(service.refresh(newest)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }));

  it('leaves the same user’s other sessions logged in', () =>
    inRollback(prisma, async (tx) => {
      await createUser(tx);
      const service = serviceOn(tx);
      const laptop = (await service.login('hr@acme.test', password))
        .refreshToken.value;
      const phone = (await service.login('hr@acme.test', password)).refreshToken
        .value;

      await service.logout(laptop);

      await expect(service.refresh(laptop)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const stillWorks = await service.refresh(phone);
      expect(stillWorks.accessToken).toEqual(expect.any(String));
    }));

  it('can be repeated without error', () =>
    inRollback(prisma, async (tx) => {
      await createUser(tx);
      const service = serviceOn(tx);
      const token = (await service.login('hr@acme.test', password)).refreshToken
        .value;

      await service.logout(token);

      await expect(service.logout(token)).resolves.toBeUndefined();
    }));

  it('changes nothing for a token that was never issued', () =>
    inRollback(prisma, async (tx) => {
      const user = await createUser(tx);
      const service = serviceOn(tx);
      await service.login('hr@acme.test', password);

      await service.logout(generateRefreshToken().token);

      const rows = await tx.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.revokedAt).toBeNull();
    }));
});
