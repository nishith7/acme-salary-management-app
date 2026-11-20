/**
 * The pay model behind the seeded salaries: what a person at a given level, in a
 * given country and department, is paid at the middle of the range.
 *
 *   midpoint = US ladder step for the level (USD)
 *              x country pay index x department factor
 *              x units of local currency per USD, rounded to 3 significant figures
 *
 * Every number here is illustrative, not market data. The exchange rates are
 * fixed on purpose: they must load unchanged into the `fx_rates` table later, so
 * that converting a seeded salary to USD gives back the figure the model started
 * from. The department and country keys are exactly those of `reference-data.ts`
 * (a test checks that nothing is missing and nothing is extra).
 */
export interface PayModel {
  /** The US midpoint in USD for each level: index 0 is level 1. */
  ladderUsd: readonly number[];
  /** Cost-of-labour multiplier by country code; the US is 1. */
  countryPayIndex: Readonly<Record<string, number>>;
  /** Units of the currency that one US dollar buys, by ISO 4217 code. */
  unitsPerUsd: Readonly<Record<string, number>>;
  /** Multiplier by department name; engineering-type roles pay more, support less. */
  departmentFactor: Readonly<Record<string, number>>;
}

export const PAY_MODEL: PayModel = {
  ladderUsd: [65_000, 85_000, 110_000, 140_000, 175_000, 220_000, 290_000],
  countryPayIndex: {
    US: 1.0,
    IN: 0.3,
    GB: 0.85,
    DE: 0.85,
    CA: 0.88,
    AU: 0.9,
    SG: 0.9,
    FR: 0.8,
    BR: 0.35,
    NL: 0.9,
    ES: 0.65,
    MX: 0.35,
    PL: 0.5,
    JP: 0.7,
    AE: 0.8,
  },
  unitsPerUsd: {
    USD: 1,
    INR: 83,
    GBP: 0.79,
    EUR: 0.92,
    CAD: 1.36,
    AUD: 1.52,
    SGD: 1.34,
    BRL: 5.0,
    MXN: 17.5,
    PLN: 4.0,
    JPY: 150,
    AED: 3.67,
  },
  departmentFactor: {
    Engineering: 1.08,
    Product: 1.08,
    Legal: 1.08,
    Design: 1.03,
    Finance: 1.0,
    Sales: 0.98,
    Marketing: 0.97,
    Operations: 0.94,
    'People Operations': 0.94,
    'Customer Support': 0.9,
  },
};

/**
 * A salary band is the midpoint plus and minus this share. The later
 * `salary_bands` table uses the same width, and the seed is built so that a
 * small share of people fall clearly outside it.
 */
export const BAND_HALF_WIDTH = 0.15;

/** The details of a person that decide the midpoint of their pay. */
export interface PayPosition {
  level: number;
  countryCode: string;
  currencyCode: string;
  /** Left out for the department-neutral midpoint that salary bands use (a factor of 1). */
  departmentName?: string;
}

/** The midpoint annual pay for the position, in the position's own currency. */
export function midpointPay(
  position: PayPosition,
  model: PayModel = PAY_MODEL,
): number {
  const { level, countryCode, currencyCode, departmentName } = position;
  if (!Number.isInteger(level) || level < 1 || level > model.ladderUsd.length) {
    throw new RangeError(
      `Level must be a whole number from 1 to ${model.ladderUsd.length}, got ${level}`,
    );
  }
  const ladderUsd = model.ladderUsd[level - 1]!;
  const payIndex = lookup(
    model.countryPayIndex,
    countryCode,
    'pay index for country',
  );
  const factor =
    departmentName === undefined
      ? 1
      : lookup(model.departmentFactor, departmentName, 'factor for department');
  const rate = lookup(
    model.unitsPerUsd,
    currencyCode,
    'exchange rate for currency',
  );

  return roundSignificant(ladderUsd * payIndex * factor * rate, 3);
}

/** Rounds to a number of significant figures: 118,800 to 3 figures is 119,000. */
export function roundSignificant(value: number, digits: number): number {
  if (!Number.isInteger(digits) || digits < 1) {
    throw new RangeError('digits must be a whole number, 1 or more');
  }
  return Number(value.toPrecision(digits));
}

function lookup(
  table: Readonly<Record<string, number>>,
  key: string,
  what: string,
): number {
  // hasOwn, so a key such as "constructor" can never find an inherited property.
  if (!Object.hasOwn(table, key)) {
    throw new Error(`The pay model has no ${what} "${key}"`);
  }
  return table[key]!;
}
