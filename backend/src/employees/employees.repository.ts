import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
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

  /** `today` is a parameter so the result does not depend on the clock. */
  async list(
    query: EmployeeQuery,
    today: Date,
  ): Promise<{ rows: EmployeeRow[]; total: number }> {
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
        SELECT
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
          ${bandPosition} AS "bandPosition"
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
