import type { Prisma } from '../generated/prisma/client.js';
import {
  BAND_HALF_WIDTH,
  midpointPay,
  PAY_MODEL,
  type PayModel,
} from './pay-model.js';

/**
 * The first day the exchange rates apply. Earlier than anyone's first salary
 * (the oldest seeded joining date is in 2014), so every salary in the history
 * converts to USD.
 */
export const FX_VALID_FROM = new Date('2010-01-01T00:00:00.000Z');

export interface SeedRatesOptions {
  /** The pay model; tests pass their own so they need no real reference data. */
  payModel?: PayModel;
}

export interface SeedRatesResult {
  /** Rows added; rows that already existed are left exactly as they were. */
  created: number;
}

/**
 * Loads one salary band for every level of every country in the pay model that
 * exists in the database: the department-neutral midpoint, 15% either side, in
 * the country's currency and rounded to whole units. The countries come from
 * the employee seed, so run that first. Safe to run again: it only inserts what
 * is missing.
 */
export async function seedSalaryBands(
  db: Prisma.TransactionClient,
  options: SeedRatesOptions = {},
): Promise<SeedRatesResult> {
  const { payModel = PAY_MODEL } = options;
  const countries = await db.country.findMany({
    where: { code: { in: Object.keys(payModel.countryPayIndex) } },
    select: { id: true, code: true, currencyCode: true },
  });

  const bands = countries.flatMap((country) =>
    payModel.ladderUsd.map((_, index) => {
      const midpoint = midpointPay(
        {
          level: index + 1,
          countryCode: country.code,
          currencyCode: country.currencyCode,
        },
        payModel,
      );
      return {
        countryId: country.id,
        level: index + 1,
        // Text, not a float: the columns are decimals.
        minAmount: String(Math.round(midpoint * (1 - BAND_HALF_WIDTH))),
        maxAmount: String(Math.round(midpoint * (1 + BAND_HALF_WIDTH))),
      };
    }),
  );

  const { count } = await db.salaryBand.createMany({
    data: bands,
    skipDuplicates: true,
  });
  return { created: count };
}

/**
 * Loads the pay model's exchange rates, one row per currency (the US dollar is
 * 1), valid from `FX_VALID_FROM`. These are the rates the seeded salaries were
 * built with, so converting a salary to USD gives back the model's figure. Safe
 * to run again: it only inserts what is missing.
 */
export async function seedFxRates(
  db: Prisma.TransactionClient,
  options: SeedRatesOptions = {},
): Promise<SeedRatesResult> {
  const { payModel = PAY_MODEL } = options;
  const { count } = await db.fxRate.createMany({
    data: Object.entries(payModel.unitsPerUsd).map(
      ([currencyCode, unitsPerUsd]) => ({
        currencyCode,
        validFrom: FX_VALID_FROM,
        unitsPerUsd: String(unitsPerUsd),
      }),
    ),
    skipDuplicates: true,
  });
  return { created: count };
}
