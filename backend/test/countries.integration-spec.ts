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

  // Made-up codes (XA to XC are reserved for private use), so these tests can never
  // clash with the real countries the seed loads.
  const home = { code: 'XA', name: 'Testland Alpha', currencyCode: 'XXX' };

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
      const country = await tx.country.create({ data: home });

      expect(country.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(country).toMatchObject(home);
    }));

  it('rejects a second country with the same code', () =>
    inRollback(prisma, async (tx) => {
      await tx.country.create({ data: home });

      await expect(
        tx.country.create({ data: { ...home, name: 'Another Name' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    }));

  // XTS is the ISO 4217 code reserved for testing, so no real country uses it.
  it('allows several countries to share one currency', () =>
    inRollback(prisma, async (tx) => {
      await tx.country.create({
        data: { code: 'XB', name: 'Testland Beta', currencyCode: 'XTS' },
      });
      await tx.country.create({
        data: { code: 'XC', name: 'Testland Gamma', currencyCode: 'XTS' },
      });

      const shared = await tx.country.count({ where: { currencyCode: 'XTS' } });
      expect(shared).toBe(2);
    }));
});
