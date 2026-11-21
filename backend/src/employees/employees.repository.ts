import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { SalaryChangeReason } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EmployeeQuery } from './employees.schemas.js';

/** One directory row as the database returns it: text for dates and money, so nothing is rounded or shifted by a time zone. */
export interface EmployeeRow {
  id: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  level: number;
  department: string;
  countryCode: string;
  countryName: string;
  joiningDate: string;
  status: 'ACTIVE' | 'TERMINATED';
  terminatedOn: string | null;
  tenureBand: '0-1' | '1-3' | '3-5' | '5+';
  annualAmount: string | null;
  currencyCode: string | null;
  annualAmountUsd: string | null;
  bandPosition: 'BELOW' | 'WITHIN' | 'ABOVE' | null;
}

/** The sort keys of the API, as SQL. Fixed text chosen from a validated list, never user input. */
const SORT_COLUMNS: Record<EmployeeQuery['sortBy'], Prisma.Sql> = {
  fullName: Prisma.sql`e.full_name`,
  employeeCode: Prisma.sql`e.employee_code`,
  jobTitle: Prisma.sql`e.job_title`,
  level: Prisma.sql`e.level`,
  department: Prisma.sql`d.name`,
  country: Prisma.sql`c.name`,
  joiningDate: Prisma.sql`e.joining_date`,
  salaryUsd: Prisma.sql`(s.annual_amount / fx.units_per_usd)`,
};

/**
 * The SQL pieces that define a directory row, shared by the list and the single-employee
 * lookup so the two can never disagree about what "the salary today" or "the pay band
 * position" means. `today` is a parameter so nothing depends on the clock.
 */
function directoryParts(today: Date) {
  const day = Prisma.sql`${today.toISOString().slice(0, 10)}::date`;

  const tenureYears = Prisma.sql`EXTRACT(YEAR FROM age(COALESCE(e.terminated_on, ${day}), e.joining_date))`;
  const tenureBand = Prisma.sql`(CASE WHEN ${tenureYears} < 1 THEN '0-1' WHEN ${tenureYears} < 3 THEN '1-3' WHEN ${tenureYears} < 5 THEN '3-5' ELSE '5+' END)`;
  const bandPosition = Prisma.sql`(CASE
      WHEN s.annual_amount IS NULL OR b.min_amount IS NULL THEN NULL
      WHEN s.annual_amount < b.min_amount THEN 'BELOW'
      WHEN s.annual_amount > b.max_amount THEN 'ABOVE'
      ELSE 'WITHIN' END)`;

  const people = Prisma.sql`FROM employees e
      JOIN departments d ON d.id = e.department_id
      JOIN countries c ON c.id = e.country_id`;
  // The salary in force today, its exchange rate and its band. The page
  // always needs them; the count only when a filter uses them.
  const salary = Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT sr.annual_amount, sr.currency_code
        FROM salary_records sr
        WHERE sr.employee_id = e.id AND sr.effective_from <= ${day}
        ORDER BY sr.effective_from DESC, sr.created_at DESC
        LIMIT 1
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT f.units_per_usd
        FROM fx_rates f
        WHERE f.currency_code = s.currency_code AND f.valid_from <= ${day}
        ORDER BY f.valid_from DESC
        LIMIT 1
      ) fx ON TRUE
      LEFT JOIN salary_bands b ON b.country_id = e.country_id AND b.level = e.level`;

  // The columns of one directory row, named as EmployeeRow names them.
  const columns = Prisma.sql`
          e.id,
          e.employee_code AS "employeeCode",
          e.full_name AS "fullName",
          e.job_title AS "jobTitle",
          e.level,
          d.name AS department,
          c.code AS "countryCode",
          c.name AS "countryName",
          e.joining_date::text AS "joiningDate",
          e.status::text AS status,
          e.terminated_on::text AS "terminatedOn",
          ${tenureBand} AS "tenureBand",
          s.annual_amount::text AS "annualAmount",
          s.currency_code AS "currencyCode",
          round(s.annual_amount / fx.units_per_usd, 2)::text AS "annualAmountUsd",
          ${bandPosition} AS "bandPosition"`;

  return { day, tenureBand, bandPosition, people, salary, columns };
}

/** One step of an employee's salary history as the database returns it: text for dates and money. */
export interface SalaryHistoryRow {
  id: string;
  annualAmount: string;
  currencyCode: string;
  effectiveFrom: string;
  reason: SalaryChangeReason | null;
  changedByName: string | null;
  /** The salary before this one in time; null for the first. */
  previousAmount: string | null;
  previousCurrencyCode: string | null;
  /** One decimal, for example "8.1" or "-2.5"; null for the first salary or when the currency changed. */
  changePercent: string | null;
  state: 'CURRENT' | 'PAST' | 'SCHEDULED';
}

/**
 * The only place that queries the employee directory. One query for the page
 * and one for the total, with no per-row queries. It is raw SQL because the
 * current salary needs a lateral join (the latest record up to today, the
 * newest recorded winning a tie), which Prisma cannot express. Every value
 * reaches the database as a bound parameter.
 */
@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The reference lists the directory's filters choose from, each by name. */
  async filterOptions(): Promise<{
    countries: { code: string; name: string }[];
    departments: { name: string }[];
  }> {
    const [countries, departments] = await Promise.all([
      this.prisma.country.findMany({
        select: { code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { countries, departments };
  }

  /** One employee as a directory row, or null if there is no such employee. */
  async findById(id: string, today: Date): Promise<EmployeeRow | null> {
    const { columns, people, salary } = directoryParts(today);
    const rows = await this.prisma.$queryRaw<EmployeeRow[]>`
      SELECT ${columns}
      ${people}
      ${salary}
      WHERE e.id = ${id}::uuid`;
    return rows[0] ?? null;
  }

  /**
   * Every salary the employee has been on, newest first (the order that picks "the salary
   * in force": latest effective date, the newest entry winning a tie). Each step carries the
   * salary before it in time and the change as a percentage, worked out here in SQL with
   * exact decimals. A percentage is only given when both salaries are in the same currency.
   */
  async salaryHistory(
    employeeId: string,
    today: Date,
  ): Promise<SalaryHistoryRow[]> {
    const { day } = directoryParts(today);
    return this.prisma.$queryRaw<SalaryHistoryRow[]>`
      WITH ordered AS (
        SELECT sr.id, sr.annual_amount, sr.currency_code, sr.effective_from, sr.created_at,
          sr.reason, sr.changed_by,
          LAG(sr.annual_amount) OVER w AS previous_amount,
          LAG(sr.currency_code) OVER w AS previous_currency_code
        FROM salary_records sr
        WHERE sr.employee_id = ${employeeId}::uuid
        WINDOW w AS (ORDER BY sr.effective_from, sr.created_at)
      ),
      in_force AS (
        SELECT id FROM ordered
        WHERE effective_from <= ${day}
        ORDER BY effective_from DESC, created_at DESC
        LIMIT 1
      )
      SELECT
        o.id,
        o.annual_amount::text AS "annualAmount",
        o.currency_code AS "currencyCode",
        o.effective_from::text AS "effectiveFrom",
        o.reason::text AS reason,
        u.name AS "changedByName",
        o.previous_amount::text AS "previousAmount",
        o.previous_currency_code AS "previousCurrencyCode",
        CASE WHEN o.previous_amount > 0 AND o.previous_currency_code = o.currency_code
          THEN round((o.annual_amount - o.previous_amount) / o.previous_amount * 100, 1)::text
        END AS "changePercent",
        CASE
          WHEN o.effective_from > ${day} THEN 'SCHEDULED'
          WHEN o.id = (SELECT id FROM in_force) THEN 'CURRENT'
          ELSE 'PAST'
        END AS state
      FROM ordered o
      LEFT JOIN users u ON u.id = o.changed_by
      ORDER BY o.effective_from DESC, o.created_at DESC`;
  }

  /** `today` is a parameter so the result does not depend on the clock. */
  async list(
    query: EmployeeQuery,
    today: Date,
  ): Promise<{ rows: EmployeeRow[]; total: number }> {
    const { tenureBand, bandPosition, people, salary, columns } =
      directoryParts(today);

    // Different filters must all match; the values of one filter are alternatives.
    const conditions: Prisma.Sql[] = [];
    if (query.search !== undefined) {
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        Prisma.sql`(e.full_name ILIKE ${pattern} OR e.employee_code ILIKE ${pattern})`,
      );
    }
    if (query.statuses) {
      conditions.push(
        Prisma.sql`e.status::text = ANY(${query.statuses}::text[])`,
      );
    }
    if (query.countries) {
      conditions.push(Prisma.sql`c.code = ANY(${query.countries}::text[])`);
    }
    if (query.departments) {
      conditions.push(Prisma.sql`d.name = ANY(${query.departments}::text[])`);
    }
    if (query.jobTitles) {
      conditions.push(
        Prisma.sql`e.job_title = ANY(${query.jobTitles}::text[])`,
      );
    }
    if (query.levels) {
      conditions.push(Prisma.sql`e.level = ANY(${query.levels}::int[])`);
    }
    if (query.tenureBands) {
      conditions.push(
        Prisma.sql`${tenureBand} = ANY(${query.tenureBands}::text[])`,
      );
    }
    if (query.bandPositions) {
      conditions.push(
        Prisma.sql`${bandPosition} = ANY(${query.bandPositions}::text[])`,
      );
    }
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const direction =
      query.sortOrder === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const offset = (query.page - 1) * query.pageSize;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<EmployeeRow[]>`
        SELECT ${columns}
        ${people}
        ${salary}
        ${where}
        ORDER BY ${SORT_COLUMNS[query.sortBy]} ${direction} NULLS LAST, e.employee_code ASC
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count
        ${people}
        ${query.bandPositions ? salary : Prisma.empty}
        ${where}`,
    ]);

    return { rows, total: Number(counts[0]?.count ?? 0) };
  }
}
