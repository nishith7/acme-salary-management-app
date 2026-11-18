import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback } from './support/test-db.js';

/**
 * Proves the users table in the real database matches the reviewed design.
 * Every test runs in a rolled-back transaction.
 */
describe('users table (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const newUser = (email: string) => ({
    email,
    passwordHash: 'not-a-real-hash',
    name: 'Test HR Manager',
    role: 'HR_ADMIN' as const,
  });

  it('has exactly the reviewed columns, all required', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY column_name`;

      expect(columns.map((c) => c.column_name)).toEqual([
        'created_at',
        'email',
        'id',
        'name',
        'password_hash',
        'role',
        'updated_at',
      ]);
      expect(columns.every((c) => c.is_nullable === 'NO')).toBe(true);
    }));

  it('limits role to HR_ADMIN and EMPLOYEE', () =>
    inRollback(prisma, async (tx) => {
      const labels = await tx.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role'
        ORDER BY e.enumsortorder`;

      expect(labels.map((l) => l.enumlabel)).toEqual(['HR_ADMIN', 'EMPLOYEE']);
    }));

  it('generates an id and timestamps when a user is created', () =>
    inRollback(prisma, async (tx) => {
      const user = await tx.user.create({ data: newUser('hr@test.local') });

      expect(user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    }));

  it('rejects a second user with the same email', () =>
    inRollback(prisma, async (tx) => {
      await tx.user.create({ data: newUser('hr@test.local') });

      await expect(
        tx.user.create({ data: newUser('hr@test.local') }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }));
});
