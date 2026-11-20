import type { Prisma } from '../generated/prisma/client.js';
import { formatEmployeeCode } from './employee-generator.js';
import {
  generateSalaryHistory,
  type SalaryEmployee,
  type SalaryHistoryOptions,
} from './salary-generator.js';
import { DEFAULT_EMPLOYEE_COUNT } from './seed-employees.js';

/**
 * Employees per insert. A history has at most about 20 records of 6 columns, so
 * 250 employees stay far below Postgres's 65,535 parameter limit (250 x 20 x 6 =
 * 30,000), and a statement is one batch of whole employees: a history is never
 * half stored.
 */
const DEFAULT_BATCH_SIZE = 250;

export interface SeedSalaryOptions extends SalaryHistoryOptions {
  /**
   * The size of the seeded employee set: the employees numbered 1 to `count`.
   * Only those are touched. Default 10,000, like the employee seed.
   */
  count?: number;
  /** The code prefix of the seeded employees, as in the employee seed. */
  codePrefix?: string;
  /** How many employees to insert per statement. */
  batchSize?: number;
}

export interface SeedSalaryResult {
  /** Employees that had no salary record and were given a history in this run. */
  employeesSeeded: number;
  /** Employees of the set that already had at least one record, left exactly as they were. */
  employeesAlreadyHadHistory: number;
  /** Employees of the set that are not in the database (the employee seed has not made them yet). */
  employeesNotFound: number;
  salaryRecordsCreated: number;
}

/**
 * Gives the seeded employees their salary history. It reads each employee as it
 * is STORED, so it works on the employees already in the database without
 * changing them, and only for the numbered set it is asked about (EMP-00001 to
 * EMP-<count>): an employee created later in the app, or loaded by an import,
 * never gets an invented salary, even if it has no record yet.
 *
 * Safe to run again: an employee with any salary record is skipped, and nothing
 * is ever updated or deleted, so a re-run adds nothing, and an interrupted run
 * resumes where it stopped. Do not run two seeds at the same time: both would
 * find the same employees without a history.
 *
 * Takes the client as an argument so tests can pass a rolled-back transaction.
 */
export async function seedSalaryHistory(
  db: Prisma.TransactionClient,
  options: SeedSalaryOptions = {},
): Promise<SeedSalaryResult> {
  const {
    count = DEFAULT_EMPLOYEE_COUNT,
    codePrefix = 'EMP',
    batchSize = DEFAULT_BATCH_SIZE,
    ...historyOptions
  } = options;
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('count must be a whole number, 0 or more');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a whole number, 1 or more');
  }

  const result: SeedSalaryResult = {
    employeesSeeded: 0,
    employeesAlreadyHadHistory: 0,
    employeesNotFound: 0,
    salaryRecordsCreated: 0,
  };

  for (let first = 1; first <= count; first += batchSize) {
    const last = Math.min(first + batchSize - 1, count);
    const codes = Array.from({ length: last - first + 1 }, (_, i) =>
      formatEmployeeCode(codePrefix, first + i),
    );

    const stored = await db.employee.findMany({
      where: { employeeCode: { in: codes } },
      select: {
        id: true,
        employeeCode: true,
        gender: true,
        level: true,
        joiningDate: true,
        terminatedOn: true,
        country: { select: { code: true, currencyCode: true } },
        department: { select: { name: true } },
        _count: { select: { salaryRecords: true } },
      },
    });
    const withoutHistory = stored.filter((e) => e._count.salaryRecords === 0);

    // All the histories of the batch are made before any is stored, so a
    // problem with one employee stops the batch with nothing half done.
    const rows = withoutHistory.flatMap((employee) => {
      const person: SalaryEmployee = {
        employeeCode: employee.employeeCode,
        gender: employee.gender,
        level: employee.level,
        countryCode: employee.country.code,
        currencyCode: employee.country.currencyCode,
        departmentName: employee.department.name,
        joiningDate: employee.joiningDate,
        terminatedOn: employee.terminatedOn,
      };
      return historyFor(person, historyOptions).map((record) => ({
        employeeId: employee.id,
        // Text, not a float: the column is a decimal.
        annualAmount: String(record.annualAmount),
        currencyCode: record.currencyCode,
        effectiveFrom: record.effectiveFrom,
        reason: record.reason,
        createdAt: record.createdAt,
      }));
    });
    if (rows.length > 0) {
      await db.salaryRecord.createMany({ data: rows });
    }

    result.employeesSeeded += withoutHistory.length;
    result.employeesAlreadyHadHistory += stored.length - withoutHistory.length;
    result.employeesNotFound += codes.length - stored.length;
    result.salaryRecordsCreated += rows.length;
  }

  return result;
}

/** Makes one history, and names the employee if it cannot. */
function historyFor(person: SalaryEmployee, options: SalaryHistoryOptions) {
  try {
    return generateSalaryHistory(person, options);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot make a salary history for ${person.employeeCode}: ${reason}`,
      { cause: error },
    );
  }
}
