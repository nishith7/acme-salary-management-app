import type { Prisma } from '../generated/prisma/client.js';
import {
  generateEmployees,
  type GenerateOptions,
} from './employee-generator.js';
import { COUNTRIES, DEPARTMENTS } from './reference-data.js';

/** The size of the dataset the requirements ask for. */
export const DEFAULT_EMPLOYEE_COUNT = 10_000;
/** Rows per insert. 1,000 rows of 11 columns stays far below Postgres's 65,535 parameter limit. */
const DEFAULT_BATCH_SIZE = 1_000;

export interface SeedOptions extends Partial<GenerateOptions> {
  /** How many employees to insert per statement. */
  batchSize?: number;
}

export interface SeedResult {
  countriesCreated: number;
  departmentsCreated: number;
  employeesCreated: number;
  /** Employees whose code already existed, left exactly as they were. */
  employeesSkipped: number;
}

/**
 * Loads the reference data and the synthetic employees. Safe to run again: it
 * only inserts what is missing and never changes a row that already exists, so
 * it also resumes cleanly if a run is interrupted, and a larger count only adds
 * employees. Employees go in batches, not one transaction, so a long run cannot
 * hit a transaction timeout.
 *
 * Takes the client as an argument so tests can pass a rolled-back transaction.
 */
export async function seedEmployees(
  db: Prisma.TransactionClient,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const {
    count = DEFAULT_EMPLOYEE_COUNT,
    batchSize = DEFAULT_BATCH_SIZE,
    ...rest
  } = options;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a whole number, 1 or more');
  }

  const countriesCreated = (
    await db.country.createMany({
      data: COUNTRIES.map(({ code, name, currencyCode }) => ({
        code,
        name,
        currencyCode,
      })),
      skipDuplicates: true,
    })
  ).count;
  const departmentsCreated = (
    await db.department.createMany({
      data: DEPARTMENTS.map(({ name }) => ({ name })),
      skipDuplicates: true,
    })
  ).count;

  const countryIds = new Map(
    (
      await db.country.findMany({
        where: { code: { in: COUNTRIES.map((c) => c.code) } },
        select: { id: true, code: true },
      })
    ).map((c) => [c.code, c.id]),
  );
  const departmentIds = new Map(
    (
      await db.department.findMany({
        where: { name: { in: DEPARTMENTS.map((d) => d.name) } },
        select: { id: true, name: true },
      })
    ).map((d) => [d.name, d.id]),
  );

  const employees = generateEmployees({ ...rest, count });
  let employeesCreated = 0;

  for (let start = 0; start < employees.length; start += batchSize) {
    const rows = employees.slice(start, start + batchSize).map((e) => ({
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      gender: e.gender,
      jobTitle: e.jobTitle,
      level: e.level,
      countryId: idOf(countryIds, e.countryCode),
      departmentId: idOf(departmentIds, e.departmentName),
      joiningDate: e.joiningDate,
      status: e.status,
      terminatedOn: e.terminatedOn,
    }));
    employeesCreated += (
      await db.employee.createMany({ data: rows, skipDuplicates: true })
    ).count;
  }

  return {
    countriesCreated,
    departmentsCreated,
    employeesCreated,
    employeesSkipped: employees.length - employeesCreated,
  };
}

function idOf(ids: Map<string, string>, key: string): string {
  const id = ids.get(key);
  if (id === undefined) {
    throw new Error(`Reference data "${key}" is missing after it was created`);
  }
  return id;
}
