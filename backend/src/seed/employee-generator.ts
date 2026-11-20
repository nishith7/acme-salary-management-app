import { base, en, Faker, type LocaleDefinition } from '@faker-js/faker';
import type { EmployeeStatus, Gender } from '../generated/prisma/enums.js';
import { formatFullName } from './full-name.js';
import { LOCALES } from './locales.js';
import {
  COUNTRIES,
  DEPARTMENTS,
  LEVELS,
  type DepartmentSeed,
} from './reference-data.js';

/** One synthetic employee, before it is stored. Country and department are by code and name, not id. */
export interface GeneratedEmployee {
  employeeCode: string;
  fullName: string;
  gender: Gender;
  jobTitle: string;
  level: number;
  countryCode: string;
  departmentName: string;
  joiningDate: Date;
  status: EmployeeStatus;
  terminatedOn: Date | null;
}

export interface GenerateOptions {
  /** How many employees to make. */
  count: number;
  /** The same seed always gives the same employees (with the same faker version). */
  seed?: number;
  /**
   * "Today" for the dataset: nobody joins or leaves after it. A fixed default
   * keeps the data identical on every day and machine; it is passed in, never
   * read from the clock.
   */
  asOf?: Date;
  /** Employee codes are `<prefix>-00001`, `<prefix>-00002`, and so on. */
  codePrefix?: string;
}

export const DEFAULT_SEED = 2026;
export const SEED_AS_OF = new Date('2026-11-01T00:00:00.000Z');

const DAY_MS = 24 * 60 * 60 * 1000;
/** Nobody joined more than 12 years before the as-of date. */
const MAX_TENURE_DAYS = 12 * 365;
/** Higher levels take longer to reach, so each level adds this much minimum tenure. */
const MIN_TENURE_DAYS_PER_LEVEL = 180;
/** Above 1, tenures bunch up near the minimum: more recent joiners than old hands, as in a growing company. */
const RECENT_HIRE_SKEW = 1.5;
/** Share of people who have left. */
const SHARE_LEAVERS = 0.06;
/** Nobody leaves in their first month. */
const MIN_DAYS_BEFORE_LEAVING = 30;
/** Share of people who are neither female nor male. */
const SHARE_OTHER_GENDER = 0.02;
/** Each level above 1 lowers the share of women by this fraction, so there are fewer women at the top. */
const FEMALE_SHARE_LOSS_PER_LEVEL = 0.05;

/**
 * Makes `count` synthetic employees, deterministically, using faker for the
 * random choices and for the names (in each country's own locale).
 *
 * Employees are made one after another from seeded random sequences, so asking
 * for more never changes the ones before: the first 200 of 10,000 are the 200
 * you get when you ask for 200. That is what lets the seed be re-run with a
 * larger count and only add people.
 *
 * The faker version is pinned in package.json: faker's output for a given seed
 * can change between versions, which would change the dataset.
 */
export function generateEmployees(
  options: GenerateOptions,
): GeneratedEmployee[] {
  const { count, seed = DEFAULT_SEED, codePrefix = 'EMP' } = options;
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a whole number, 0 or more');
  }

  const asOf = startOfUtcDay(options.asOf ?? SEED_AS_OF);
  // One sequence makes the structural choices (country, department, level, dates)...
  const faker = createFaker(en, seed);
  // ...and each country has its own for names, seeded differently so countries that
  // share a locale (the US, the UK and Canada) do not repeat each other's names.
  const nameFakers = new Map(
    COUNTRIES.map((country, index) => [
      country.code,
      createFaker(LOCALES[country.locale], seed + index + 1),
    ]),
  );

  const employees: GeneratedEmployee[] = [];
  for (let number = 1; number <= count; number++) {
    const code = formatEmployeeCode(codePrefix, number);
    employees.push(generateOne(faker, nameFakers, code, asOf));
  }
  return employees;
}

/** The code HR knows an employee by: `EMP-00001` for number 1 with the default prefix. */
export function formatEmployeeCode(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(5, '0')}`;
}

function generateOne(
  faker: Faker,
  nameFakers: Map<string, Faker>,
  employeeCode: string,
  asOf: Date,
): GeneratedEmployee {
  const country = weighted(faker, COUNTRIES);
  const department = weighted(faker, DEPARTMENTS);
  const { level } = weighted(faker, LEVELS);
  const gender = pickGender(faker, department, level);

  const names = nameFakers.get(country.code)!;
  const sex =
    gender === 'FEMALE' ? 'female' : gender === 'MALE' ? 'male' : undefined;
  const fullName = formatFullName(
    names.person.firstName(sex),
    names.person.lastName(sex),
    country.locale,
  );

  const minTenure = (level - 1) * MIN_TENURE_DAYS_PER_LEVEL;
  const tenureDays =
    minTenure +
    Math.floor(
      (MAX_TENURE_DAYS - minTenure) *
        faker.number.float({ min: 0, max: 1 }) ** RECENT_HIRE_SKEW,
    );
  const joiningDate = addDays(asOf, -tenureDays);

  let terminatedOn: Date | null = null;
  if (
    tenureDays >= MIN_DAYS_BEFORE_LEAVING &&
    faker.datatype.boolean({ probability: SHARE_LEAVERS })
  ) {
    terminatedOn = addDays(
      joiningDate,
      faker.number.int({ min: MIN_DAYS_BEFORE_LEAVING, max: tenureDays }),
    );
  }

  return {
    employeeCode,
    fullName,
    gender,
    jobTitle: department.titles[level - 1]!,
    level,
    countryCode: country.code,
    departmentName: department.name,
    joiningDate,
    status: terminatedOn ? 'TERMINATED' : 'ACTIVE',
    terminatedOn,
  };
}

function pickGender(
  faker: Faker,
  department: DepartmentSeed,
  level: number,
): Gender {
  if (faker.datatype.boolean({ probability: SHARE_OTHER_GENDER })) {
    return 'OTHER';
  }
  const femaleShare =
    department.femaleShare * (1 - FEMALE_SHARE_LOSS_PER_LEVEL * (level - 1));
  return faker.datatype.boolean({ probability: femaleShare })
    ? 'FEMALE'
    : 'MALE';
}

/** A fresh, seeded faker for one locale. English and the base data fill any gaps in a locale. */
function createFaker(locale: LocaleDefinition, seed: number): Faker {
  const faker = new Faker({ locale: [locale, en, base] });
  faker.seed(seed);
  return faker;
}

/** One item, chosen with probability proportional to its weight. */
function weighted<T extends { weight: number }>(
  faker: Faker,
  items: readonly T[],
): T {
  return faker.helpers.weightedArrayElement(
    items.map((item) => ({ weight: item.weight, value: item })),
  );
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
