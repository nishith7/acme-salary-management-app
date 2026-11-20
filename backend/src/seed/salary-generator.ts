import type { Gender, SalaryChangeReason } from '../generated/prisma/enums.js';
import { SEED_AS_OF } from './employee-generator.js';
import {
  midpointPay,
  PAY_MODEL,
  roundSignificant,
  type PayModel,
} from './pay-model.js';
import { createRng, type Rng } from './random.js';

/**
 * What the salary history of a person depends on. These are the details of a
 * STORED employee (country and department by code and name, currency from the
 * country), so history can be generated for the employees already in the
 * database without regenerating, or touching, the employees themselves.
 */
export interface SalaryEmployee {
  employeeCode: string;
  gender: Gender;
  level: number;
  countryCode: string;
  /** The currency of the person's country; every record is in it. */
  currencyCode: string;
  departmentName: string;
  joiningDate: Date;
  terminatedOn: Date | null;
}

/** One salary record, before it is stored. */
export interface GeneratedSalaryRecord {
  /**
   * Whole currency units a year. A whole number, so it is exact; the database
   * stores it as a decimal and the seed hands it over as text, never as a float.
   */
  annualAmount: number;
  currencyCode: string;
  effectiveFrom: Date;
  reason: SalaryChangeReason;
  /** When the record was made. Backdated: the seed pretends the history was recorded as it happened. */
  createdAt: Date;
}

export interface SalaryHistoryOptions {
  /** The same seed always gives the same history for the same person. */
  seed?: number;
  /** "Today" for the dataset; nothing is effective or recorded after it. */
  asOf?: Date;
  /** The pay model; tests pass their own so they need no real reference data. */
  payModel?: PayModel;
}

export const DEFAULT_SALARY_SEED = 2026;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Today's salary: the midpoint, a spread, a few outliers, a gender gap ----
/** Standard deviation of the spread around the midpoint: about 90% land within 10%. */
const SPREAD_SD = 0.06;
/** The bell-shaped spread is cut off here, so a freak draw cannot give an absurd salary. */
const SPREAD_LIMIT = 0.25;
/** Share of people deliberately pushed far from the midpoint, in either direction. */
const OUTLIER_SHARE = 0.05;
/** Of those outliers, the share who are paid BELOW the midpoint. */
const OUTLIER_BELOW_SHARE = 0.6;
/** How far outside the midpoint an outlier sits, clear of the 15% band. */
const OUTLIER_BELOW = { min: 0.18, max: 0.35 };
const OUTLIER_ABOVE = { min: 0.18, max: 0.4 };
/** Women are paid this much of what a man is at the same country, level and department. */
const WOMEN_PAY_FACTOR = 0.96;
/** Salaries are rounded to this many significant figures: 123,400, not 123,402. */
const SALARY_SIGNIFICANT_FIGURES = 4;

// ---- The changes that lead up to it ----
/** Merit raises take effect on 1 April (month index 3, in UTC). */
const MERIT_MONTH = 3;
/** Eligible only if hired at least this long before that 1 April ("about six months"). */
const MERIT_MIN_SERVICE_DAYS = 183;
const MERIT_SKIP_SHARE = 0.1;
const MERIT = { mean: 0.04, sd: 0.015, min: 0.01, max: 0.09 };
/** A promotion about every 2.5 years of service, up to the current level. */
const PROMOTION_INTERVAL_DAYS = 913;
const PROMOTION_JITTER_DAYS = 180;
/** Less than the gap between two level midpoints, so a promoted person lands low in the new band. */
const PROMOTION_RAISE = { min: 0.1, max: 0.14 };
/** Share of people with two or more years of service who get one market adjustment. */
const MARKET_SHARE = 0.07;
const MARKET_MIN_SERVICE_DAYS = 730;
const MARKET_RAISE = { min: 0.06, max: 0.1 };
/** A market adjustment is never in the last month of the history. */
const MARKET_MIN_DAYS_BEFORE_END = 30;
/** Share of people whose pay was first recorded wrongly and corrected later. */
const CORRECTION_SHARE = 0.01;
const CORRECTION_DELAY_DAYS = { min: 10, max: 60 };
/** How far off the wrong amount is. */
const CORRECTION_ERROR = { min: 0.05, max: 0.2 };

interface PlannedChange {
  date: Date;
  reason: 'PROMOTION' | 'MARKET_ADJUSTMENT' | 'MERIT';
  /** The raise as a fraction: 0.04 is 4%. */
  raise: number;
}

/**
 * Makes the salary history of one person, deterministically.
 *
 * Today's salary comes first (the pay-model midpoint for their country, level
 * and department, a bell-shaped spread, a few outliers, and a gender gap), and
 * the history is then built BACKWARDS from it, so the current salary is exactly
 * the model's figure and every earlier salary is a consistent step below.
 * What can appear, all from the joining date to the as-of date (or the day
 * before a leaver's last day):
 *
 * - HIRE on the joining date.
 * - MERIT on each 1 April about 4% (1 to 9%), for people hired at least about six
 *   months before; one cycle in ten is skipped.
 * - PROMOTION about every 2.5 years of service, on the first of a month, +10 to 14%,
 *   up to the person's level. A promotion takes the place of a merit raise that
 *   falls on the same date.
 * - MARKET_ADJUSTMENT, once, for 7% of people with two or more years of service.
 * - CORRECTION for about 1% of people: the wrong amount is recorded first, and a
 *   correction with the same effective date, recorded 10 to 60 days later,
 *   carries the right one. That is the one case of two records sharing a date.
 *
 * Pay never falls: the salary in force rises at every change. Everything is
 * drawn from a random source keyed by the seed and the employee code, so the
 * history depends only on that person, not on who was generated before.
 */
export function generateSalaryHistory(
  employee: SalaryEmployee,
  options: SalaryHistoryOptions = {},
): GeneratedSalaryRecord[] {
  const { seed = DEFAULT_SALARY_SEED, payModel = PAY_MODEL } = options;
  const asOf = startOfUtcDay(options.asOf ?? SEED_AS_OF);
  const joined = startOfUtcDay(employee.joiningDate);
  const left = employee.terminatedOn
    ? startOfUtcDay(employee.terminatedOn)
    : null;
  if (joined.getTime() > asOf.getTime()) {
    throw new RangeError(
      `${employee.employeeCode} joins after the as-of date, so there is no history to make`,
    );
  }
  if (left && left.getTime() < joined.getTime()) {
    throw new RangeError(`${employee.employeeCode} leaves before they join`);
  }
  // The last day a change can take effect: today, or the day before a leaver's last day.
  const lastChange = left
    ? new Date(Math.min(asOf.getTime(), left.getTime() - DAY_MS))
    : asOf;

  const rng = createRng(`${seed}:${employee.employeeCode}`);
  const midpoint = midpointPay(employee, payModel);
  const current = wholeAmount(
    midpoint * (1 + payDeviation(rng)) * genderFactor(employee.gender),
  );
  const changes = planChanges(rng, employee.level, joined, lastChange);

  // Build backwards: amounts[i] is the salary before change i, and the last is today's.
  const amounts = [current];
  for (let i = changes.length - 1; i >= 0; i--) {
    amounts.unshift(stepDown(amounts[0]!, changes[i]!.raise));
  }

  const records: GeneratedSalaryRecord[] = [
    record(employee, amounts[0]!, joined, 'HIRE'),
    ...changes.map((change, i) =>
      record(employee, amounts[i + 1]!, change.date, change.reason),
    ),
  ];
  return maybeCorrect(rng, records, asOf);
}

/** How far from the midpoint this person is paid: a fraction, 0.03 meaning 3% above. */
function payDeviation(rng: Rng): number {
  if (rng.chance(OUTLIER_SHARE)) {
    return rng.chance(OUTLIER_BELOW_SHARE)
      ? -rng.between(OUTLIER_BELOW.min, OUTLIER_BELOW.max)
      : rng.between(OUTLIER_ABOVE.min, OUTLIER_ABOVE.max);
  }
  const deviation = rng.normal(0, SPREAD_SD);
  return Math.max(-SPREAD_LIMIT, Math.min(SPREAD_LIMIT, deviation));
}

/** Women are paid a little less at the same country, level and department; anyone else is neutral. */
function genderFactor(gender: Gender): number {
  return gender === 'FEMALE' ? WOMEN_PAY_FACTOR : 1;
}

/**
 * The raises between the joining date and the last day a change can take effect,
 * oldest first. Two changes never share a date: a promotion wins over a market
 * adjustment, which wins over a merit raise.
 */
function planChanges(
  rng: Rng,
  level: number,
  joined: Date,
  lastChange: Date,
): PlannedChange[] {
  const serviceDays = Math.max(0, daysBetween(joined, lastChange));
  const planned = new Map<number, PlannedChange>();
  const add = (change: PlannedChange) => {
    const inWindow =
      change.date.getTime() > joined.getTime() &&
      change.date.getTime() <= lastChange.getTime();
    if (inWindow && !planned.has(change.date.getTime())) {
      planned.set(change.date.getTime(), change);
    }
  };

  // Promotions: the person climbed from a lower level to today's. Someone whose
  // service is too short to have climbed that far was hired higher up instead.
  const promotions = Math.min(
    level - 1,
    Math.floor(serviceDays / PROMOTION_INTERVAL_DAYS),
  );
  for (let k = 1; k <= promotions; k++) {
    const jitter = rng.int(-PROMOTION_JITTER_DAYS, PROMOTION_JITTER_DAYS);
    const raise = rng.between(PROMOTION_RAISE.min, PROMOTION_RAISE.max);
    add({
      date: firstOfMonthOnOrAfter(
        addDays(joined, k * PROMOTION_INTERVAL_DAYS + jitter),
      ),
      reason: 'PROMOTION',
      raise,
    });
  }

  // Market adjustment. Everything is drawn whether or not it is used, so the
  // sequence of draws does not depend on eligibility.
  const wantsMarket = rng.chance(MARKET_SHARE);
  const marketRaise = rng.between(MARKET_RAISE.min, MARKET_RAISE.max);
  const marketPlace = rng.next();
  const latestOffset = serviceDays - MARKET_MIN_DAYS_BEFORE_END;
  if (wantsMarket && latestOffset >= MARKET_MIN_SERVICE_DAYS) {
    const offset =
      MARKET_MIN_SERVICE_DAYS +
      Math.floor(marketPlace * (latestOffset - MARKET_MIN_SERVICE_DAYS + 1));
    add({
      date: firstOfMonthOnOrAfter(addDays(joined, offset)),
      reason: 'MARKET_ADJUSTMENT',
      raise: marketRaise,
    });
  }

  // Merit raises, each 1 April.
  for (
    let year = joined.getUTCFullYear();
    year <= lastChange.getUTCFullYear();
    year++
  ) {
    const date = new Date(Date.UTC(year, MERIT_MONTH, 1));
    const skipped = rng.chance(MERIT_SKIP_SHARE);
    const raise = Math.max(
      MERIT.min,
      Math.min(MERIT.max, rng.normal(MERIT.mean, MERIT.sd)),
    );
    if (!skipped && daysBetween(joined, date) >= MERIT_MIN_SERVICE_DAYS) {
      add({ date, reason: 'MERIT', raise });
    }
  }

  return [...planned.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

/**
 * For about 1% of people, the amount first recorded for one of their changes was
 * wrong. The wrong amount stays as the original record, and a CORRECTION with the
 * same effective date carries the right one, recorded 10 to 60 days later (never
 * after the as-of date, so only changes at least 10 days old can be corrected).
 */
function maybeCorrect(
  rng: Rng,
  records: GeneratedSalaryRecord[],
  asOf: Date,
): GeneratedSalaryRecord[] {
  const wanted = rng.chance(CORRECTION_SHARE);
  const pick = rng.next();
  const errorSize = rng.between(CORRECTION_ERROR.min, CORRECTION_ERROR.max);
  const tooHigh = rng.chance(0.5);
  const delay = rng.int(CORRECTION_DELAY_DAYS.min, CORRECTION_DELAY_DAYS.max);

  const candidates = records.flatMap((r, index) =>
    daysBetween(r.effectiveFrom, asOf) >= CORRECTION_DELAY_DAYS.min
      ? [index]
      : [],
  );
  if (!wanted || candidates.length === 0) {
    return records;
  }

  const target = candidates[Math.floor(pick * candidates.length)]!;
  const original = records[target]!;
  const wrongAmount = wholeAmount(
    original.annualAmount * (1 + (tooHigh ? errorSize : -errorSize)),
  );
  const correction: GeneratedSalaryRecord = {
    ...original,
    reason: 'CORRECTION',
    createdAt: addDays(
      original.effectiveFrom,
      Math.min(delay, daysBetween(original.effectiveFrom, asOf)),
    ),
  };
  return [
    ...records.slice(0, target),
    { ...original, annualAmount: wrongAmount },
    correction,
    ...records.slice(target + 1),
  ];
}

function record(
  employee: SalaryEmployee,
  annualAmount: number,
  effectiveFrom: Date,
  reason: SalaryChangeReason,
): GeneratedSalaryRecord {
  return {
    annualAmount,
    currencyCode: employee.currencyCode,
    effectiveFrom,
    reason,
    // Recorded the day it took effect; only a correction is recorded later.
    createdAt: effectiveFrom,
  };
}

/**
 * The salary before a raise. With any realistic pay this is a little lower, but
 * for a pay so small that whole units cannot show the raise (10 less 4% is still
 * 10), a history cannot rise strictly, and an error is better than storing equal
 * or zero pay.
 */
function stepDown(after: number, raise: number): number {
  const before = wholeAmount(after / (1 + raise));
  if (before >= after) {
    throw new RangeError(
      `A pay of ${after} is too small to build a history of whole-unit raises (a raise of ${(raise * 100).toFixed(1)}% rounds away)`,
    );
  }
  return before;
}

/** Rounded to 4 significant figures, and to a whole number so it is exact whatever the size. */
function wholeAmount(value: number): number {
  return Math.max(
    1,
    Math.round(roundSignificant(value, SALARY_SIGNIFICANT_FIGURES)),
  );
}

function firstOfMonthOnOrAfter(date: Date): Date {
  return date.getUTCDate() === 1
    ? date
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
