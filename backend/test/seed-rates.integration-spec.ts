import type { PrismaClient } from '../src/generated/prisma/client.js';
import { PAY_MODEL, type PayModel } from '../src/seed/pay-model.js';
import { seedFxRates, seedSalaryBands } from '../src/seed/seed-rates.js';
import { createTestPrisma, inRollback } from './support/test-db.js';

/**
 * The band and exchange-rate seeds against the real database. Every test is
 * rolled back, and they use a made-up country (XS, currency XTS) and a pay
 * model that knows only that, so they pass whether or not the database has
 * been seeded.
 */
describe('salary bands and exchange rates (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const payModel: PayModel = {
    ladderUsd: PAY_MODEL.ladderUsd,
    countryPayIndex: { XS: 0.5 },
    unitsPerUsd: { XTS: 2 },
    departmentFactor: {},
  };

  it('stores a band of 15% either side of the midpoint for each level of a country, in its currency, and a re-run adds nothing', () =>
    inRollback(prisma, async (tx) => {
      const country = await tx.country.create({
        data: { code: 'XS', name: 'Test Country Rates', currencyCode: 'XTS' },
      });

      const first = await seedSalaryBands(tx, { payModel });
      const second = await seedSalaryBands(tx, { payModel });

      expect(first.created).toBe(7);
      expect(second.created).toBe(0);
      const bands = await tx.salaryBand.findMany({
        where: { countryId: country.id },
        orderBy: { level: 'asc' },
      });
      expect(bands).toHaveLength(7);
      // Level 3: 110,000 USD x 0.5 x 2 = 110,000; 15% either side.
      expect(bands[2]!.minAmount.toFixed(2)).toBe('93500.00');
      expect(bands[2]!.maxAmount.toFixed(2)).toBe('126500.00');
    }));

  it('stores the exchange rate of each currency exactly as the pay model has it, and a re-run adds nothing', () =>
    inRollback(prisma, async (tx) => {
      const first = await seedFxRates(tx, { payModel });
      const second = await seedFxRates(tx, { payModel });

      expect(first.created).toBe(1);
      expect(second.created).toBe(0);
      const rate = await tx.fxRate.findFirstOrThrow({
        where: { currencyCode: 'XTS' },
      });
      expect(rate.unitsPerUsd.toFixed(8)).toBe('2.00000000');
    }));
});
