import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback, type Tx } from './support/test-db.js';

/**
 * Proves the refresh_tokens table in the real database matches the reviewed design.
 * Every test runs in a rolled-back transaction.
 */
describe('refresh_tokens table (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const hash = (seed: string) => seed.padEnd(64, '0').slice(0, 64);

  const newUser = (tx: Tx) =>
    tx.user.create({
      data: {
        email: `${randomUUID()}@test.local`,
        passwordHash: 'not-a-real-hash',
        name: 'Test HR Manager',
        role: 'HR_ADMIN',
      },
    });

  const newToken = (userId: string, tokenHash: string) => ({
    userId,
    familyId: randomUUID(),
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  it('has exactly the reviewed columns; only revoked_at may be empty', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'refresh_tokens'
        ORDER BY column_name`;

      expect(columns.map((c) => [c.column_name, c.is_nullable])).toEqual([
        ['created_at', 'NO'],
        ['expires_at', 'NO'],
        ['family_id', 'NO'],
        ['id', 'NO'],
        ['revoked_at', 'YES'],
        ['token_hash', 'NO'],
        ['user_id', 'NO'],
      ]);
    }));

  it('stores the token hash as char(64), the length of a SHA-256 hex digest', () =>
    inRollback(prisma, async (tx) => {
      const [column] = await tx.$queryRaw<
        { data_type: string; character_maximum_length: number }[]
      >`SELECT data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'refresh_tokens'
          AND column_name = 'token_hash'`;

      expect(column).toEqual({
        data_type: 'character',
        character_maximum_length: 64,
      });
    }));

  it('indexes user_id and family_id for lookups and family revocation', () =>
    inRollback(prisma, async (tx) => {
      const indexes = await tx.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'refresh_tokens'`;
      const definitions = indexes.map((i) => i.indexdef);

      expect(definitions.some((d) => d.includes('(user_id)'))).toBe(true);
      expect(definitions.some((d) => d.includes('(family_id)'))).toBe(true);
    }));

  it('generates an id and created_at, and leaves revoked_at empty', () =>
    inRollback(prisma, async (tx) => {
      const user = await newUser(tx);
      const token = await tx.refreshToken.create({
        data: newToken(user.id, hash('a')),
      });

      expect(token.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(token.createdAt).toBeInstanceOf(Date);
      expect(token.revokedAt).toBeNull();
    }));

  it('rejects a second token with the same hash', () =>
    inRollback(prisma, async (tx) => {
      const user = await newUser(tx);
      await tx.refreshToken.create({ data: newToken(user.id, hash('a')) });

      await expect(
        tx.refreshToken.create({ data: newToken(user.id, hash('a')) }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }));

  it('rejects a token for a user that does not exist', () =>
    inRollback(prisma, async (tx) => {
      await expect(
        tx.refreshToken.create({ data: newToken(randomUUID(), hash('a')) }),
      ).rejects.toMatchObject({ code: 'P2003' });
    }));

  it('deletes a user’s tokens when the user is deleted', () =>
    inRollback(prisma, async (tx) => {
      const user = await newUser(tx);
      await tx.refreshToken.create({ data: newToken(user.id, hash('a')) });
      await tx.refreshToken.create({ data: newToken(user.id, hash('b')) });

      await tx.user.delete({ where: { id: user.id } });

      expect(await tx.refreshToken.count({ where: { userId: user.id } })).toBe(
        0,
      );
    }));
});
