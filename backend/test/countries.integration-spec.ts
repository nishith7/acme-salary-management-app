import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestPrisma, inRollback } from './support/test-db.js';

/**
 * Proves the countries table in the real database matches the reviewed design.
 * Every test runs in a rolled-back transaction.
 */
describe('countries table (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const india = { code: 'IN', name: 'India', currencyCode: 'INR' };

  it('has exactly the reviewed columns, all required', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'countries'
        ORDER BY column_name`;

      expect(columns.map((c) => c.column_name)).toEqual([
        'code',
        'currency_code',
        'id',
        'name',
      ]);
      expect(columns.every((c) => c.is_nullable === 'NO')).toBe(true);
    }));

  it('stores the country code as char(2) and the currency code as char(3)', () =>
    inRollback(prisma, async (tx) => {
      const columns = await tx.$queryRaw<
        {
          column_name: string;
          data_type: string;
          character_maximum_length: number;
        }[]
      >`SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'countries'
          AND column_name IN ('code', 'currency_code')
        ORDER BY column_name`;

      expect(columns).toEqual([
        {
          column_name: 'code',
          data_type: 'character',
          character_maximum_length: 2,
        },
        {
          column_name: 'currency_code',
          data_type: 'character',
          character_maximum_length: 3,
        },
      ]);
    }));

  it('generates a uuid id when a country is created', () =>
    inRollback(prisma, async (tx) => {
      const country = await tx.country.create({ data: india });

      expect(country.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(country).toMatchObject(india);
    }));

  it('rejects a second country with the same code', () =>
    inRollback(prisma, async (tx) => {
      await tx.country.create({ data: india });

      await expect(
        tx.country.create({ data: { ...india, name: 'Bharat' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }));

  it('allows several countries to share one currency', () =>
    inRollback(prisma, async (tx) => {
      await tx.country.create({
        data: { code: 'DE', name: 'Germany', currencyCode: 'EUR' },
      });
      await tx.country.create({
        data: { code: 'FR', name: 'France', currencyCode: 'EUR' },
      });

      const euro = await tx.country.count({ where: { currencyCode: 'EUR' } });
      expect(euro).toBe(2);
    }));
});
