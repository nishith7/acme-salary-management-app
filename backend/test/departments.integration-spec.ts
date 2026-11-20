import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback } from './support/test-db.js';

/**
 * Proves the departments table in the real database matches the reviewed design.
 * Every test runs in a rolled-back transaction.
 */
describe('departments table (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('has exactly the reviewed columns, all required', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'departments'
        ORDER BY column_name`;

      expect(columns.map((c) => c.column_name)).toEqual(['id', 'name']);
      expect(columns.every((c) => c.is_nullable === 'NO')).toBe(true);
    }));

  it('generates a uuid id when a department is created', () =>
    inRollback(prisma, async (tx) => {
      const department = await tx.department.create({
        data: { name: 'Test Department Alpha' },
      });

      expect(department.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(department.name).toBe('Test Department Alpha');
    }));

  it('rejects a second department with the same name', () =>
    inRollback(prisma, async (tx) => {
      await tx.department.create({ data: { name: 'Test Department Alpha' } });

      await expect(
        tx.department.create({ data: { name: 'Test Department Alpha' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }));
});
