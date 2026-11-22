import { Injectable } from '@nestjs/common';
import { calendarDate } from '../common/calendar-date.js';
import { ENOUGH, percentile } from '../common/pay-sql.js';
import { Prisma } from '../generated/prisma/client.js';
import type { SalaryChangeReason } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  EmployeeExportQuery,
  EmployeeQuery,
  EmployeeSummary,
} from './employees.schemas.js';

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
  /** When the salary in force started (YYYY-MM-DD); null if there is no salary. */
  salaryEffectiveFrom: string | null;
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
 * The salary in force on `day` for the employee `e`, as the joined row `s`: the latest record
 * up to that day, the newest entry winning a tie. The one definition of "current salary",
 * used by the directory and by the bulk update, so they cannot disagree.
 */
function salaryInForce(day: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`LEFT JOIN LATERAL (
        SELECT sr.annual_amount, sr.currency_code, sr.effective_from
        FROM salary_records sr
        WHERE sr.employee_id = e.id AND sr.effective_from <= ${day}
        ORDER BY sr.effective_from DESC, sr.created_at DESC
        LIMIT 1
      ) s ON TRUE`;
}

/**
 * The SQL pieces that define a directory row, shared by the list and the single-employee
 * lookup so the two can never disagree about what "the salary today" or "the pay band
 * position" means. `today` is a parameter so nothing depends on the clock.
 */
export function directoryParts(today: Date) {
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
      ${salaryInForce(day)}
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
          s.effective_from::text AS "salaryEffectiveFrom",
          ${bandPosition} AS "bandPosition"`;

  return { day, tenureBand, bandPosition, people, salary, columns };
}

type DirectoryParts = ReturnType<typeof directoryParts>;

/** The filters of a directory query: what `whereFor` reads, without the paging and the sort. */
export type DirectoryFilters = Partial<
  Pick<
    EmployeeExportQuery,
    | 'search'
    | 'statuses'
    | 'countries'
    | 'departments'
    | 'jobTitles'
    | 'levels'
    | 'tenureBands'
    | 'bandPositions'
  >
>;

/** The WHERE clause for a query's filters. Different filters must all match; the values of one filter are alternatives. */
export function whereFor(
  query: DirectoryFilters,
  { tenureBand, bandPosition }: DirectoryParts,
): Prisma.Sql {
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
    conditions.push(Prisma.sql`e.job_title = ANY(${query.jobTitles}::text[])`);
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
  return conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;
}

/** The ORDER BY for a query: its sort column and direction, then the employee code so the order is always the same. */
function orderFor(query: EmployeeExportQuery): Prisma.Sql {
  const direction =
    query.sortOrder === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  return Prisma.sql`ORDER BY ${SORT_COLUMNS[query.sortBy]} ${direction} NULLS LAST, e.employee_code ASC`;
}

/** A person a bulk salary update names, as the database returns it: text for dates and money. */
export interface SalaryTargetRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  status: 'ACTIVE' | 'TERMINATED';
  joiningDate: string;
  countryCurrencyCode: string;
  /** The currency of the person's first salary; null if they have none. */
  earliestCurrency: string | null;
  salaryRecordCount: number;
  /** The salary in force on the row's date; all three are null if the person has none by then. */
  currentAmount: string | null;
  currentCurrency: string | null;
  currentEffectiveFrom: string | null;
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

  /**
   * The summary cards: how many people match the filters, and the total, median and average
   * annual pay of the CURRENT ones among them, in US dollars (each salary converted at the
   * rate in force today, the same definition as the directory and the insights, so the cards
   * agree with both). People who have left, and people with no salary or exchange rate, are
   * counted in `headcount` but not in the money. The money is left null for fewer than 5
   * people (see `showableSummary`, the second lock). One query, whatever the filters.
   */
  async summary(
    filters: DirectoryFilters,
    today: Date,
  ): Promise<EmployeeSummary> {
    const parts = directoryParts(today);
    const where = whereFor(filters, parts);
    const rows = await this.prisma.$queryRaw<EmployeeSummary[]>`
      WITH people AS (
        SELECT CASE WHEN e.status::text = 'ACTIVE'
            THEN round(s.annual_amount / fx.units_per_usd, 2) END AS usd
        ${parts.people}
        ${parts.salary}
        ${where})
      SELECT count(*)::int AS headcount,
        count(usd)::int AS counted,
        CASE WHEN ${ENOUGH} THEN sum(usd)::text END AS "totalAnnualUsd",
        ${percentile(0.5)} AS "medianUsd",
        CASE WHEN ${ENOUGH} THEN round(avg(usd), 2)::text END AS "averageUsd"
      FROM people`;
    // An aggregate without GROUP BY always returns exactly one row.
    return rows[0] as EmployeeSummary;
  }

  /**
   * The lists the directory's filters choose from: every country and department by name, and the
   * levels and job titles that exist, each once and in order (grouped by the database, so 10,000
   * employees are not read to find a few dozen values).
   */
  async filterOptions(): Promise<{
    countries: { code: string; name: string }[];
    departments: { name: string }[];
    levels: number[];
    jobTitles: string[];
  }> {
    const [countries, departments, levels, jobTitles] = await Promise.all([
      this.prisma.country.findMany({
        select: { code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.department.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employee.groupBy({
        by: ['level'],
        orderBy: { level: 'asc' },
      }),
      this.prisma.employee.groupBy({
        by: ['jobTitle'],
        orderBy: { jobTitle: 'asc' },
      }),
    ]);
    return {
      countries,
      departments,
      levels: levels.map((row) => row.level),
      jobTitles: jobTitles.map((row) => row.jobTitle),
    };
  }

  /** What the rules for a salary change need to know about an employee, or null if there is none. */
  async findSalaryContext(id: string): Promise<{
    status: 'ACTIVE' | 'TERMINATED';
    joiningDate: string;
    countryCurrencyCode: string;
    salaryRecordCount: number;
  } | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        status: true,
        joiningDate: true,
        country: { select: { currencyCode: true } },
        _count: { select: { salaryRecords: true } },
      },
    });
    if (!employee) {
      return null;
    }
    return {
      status: employee.status,
      // A @db.Date comes back as midnight UTC, so its UTC date is the stored date.
      joiningDate: employee.joiningDate.toISOString().slice(0, 10),
      countryCurrencyCode: employee.country.currencyCode,
      salaryRecordCount: employee._count.salaryRecords,
    };
  }

  /**
   * The currency of the salary in force on `date` (YYYY-MM-DD): the latest record up to
   * then, the newest entry winning a tie. If every record starts later, the earliest
   * record's currency. Null if the employee has no salary at all.
   */
  async currencyInForceOn(
    employeeId: string,
    date: string,
  ): Promise<string | null> {
    const onDate = await this.prisma.salaryRecord.findFirst({
      where: { employeeId, effectiveFrom: { lte: calendarDate(date) } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { currencyCode: true },
    });
    if (onDate) {
      return onDate.currencyCode;
    }
    const earliest = await this.prisma.salaryRecord.findFirst({
      where: { employeeId },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      select: { currencyCode: true },
    });
    return earliest?.currencyCode ?? null;
  }

  /** Appends a salary record. History is append-only: nothing is ever updated or deleted. */
  async addSalaryRecord(record: {
    employeeId: string;
    /** A decimal string, so nothing is rounded on the way in. */
    annualAmount: string;
    currencyCode: string;
    /** YYYY-MM-DD */
    effectiveFrom: string;
    reason: SalaryChangeReason;
    changedById: string;
  }): Promise<void> {
    await this.prisma.salaryRecord.create({
      data: {
        employeeId: record.employeeId,
        annualAmount: record.annualAmount,
        currencyCode: record.currencyCode,
        effectiveFrom: calendarDate(record.effectiveFrom),
        reason: record.reason,
        changedById: record.changedById,
      },
    });
  }

  /**
   * The people a bulk salary update names, by Employee ID in any case, with what its rules
   * need: whether they have left, when they joined, the currency of their country, how many
   * salaries they have, and the salary in force on the date of the row that names them (so a
   * raise already applied for a future date counts as in place, and a correction of the past
   * is measured against what was paid then). Codes nobody has are simply absent.
   */
  async findSalaryTargets(
    requests: { code: string; date: string }[],
  ): Promise<SalaryTargetRow[]> {
    const codes = requests.map((r) => r.code.toUpperCase());
    const days = requests.map((r) => r.date);
    return this.prisma.$queryRaw<SalaryTargetRow[]>`
      SELECT
        e.id AS "employeeId",
        e.employee_code AS "employeeCode",
        e.full_name AS "fullName",
        e.status::text AS status,
        e.joining_date::text AS "joiningDate",
        c.currency_code AS "countryCurrencyCode",
        (SELECT r.currency_code FROM salary_records r WHERE r.employee_id = e.id
          ORDER BY r.effective_from, r.created_at LIMIT 1) AS "earliestCurrency",
        (SELECT count(*) FROM salary_records r WHERE r.employee_id = e.id)::int AS "salaryRecordCount",
        s.annual_amount::text AS "currentAmount",
        s.currency_code AS "currentCurrency",
        s.effective_from::text AS "currentEffectiveFrom"
      FROM unnest(${codes}::text[], ${days}::date[]) AS w(code, day)
      JOIN employees e ON upper(e.employee_code) = w.code
      JOIN countries c ON c.id = e.country_id
      ${salaryInForce(Prisma.sql`w.day`)}`;
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

  /**
   * Everyone who matches the filters, in the sort order, with no paging: what the export
   * writes. The same filters and rows as `list`, one query, so the file is exactly the
   * directory the user was looking at.
   */
  async listAll(
    query: EmployeeExportQuery,
    today: Date,
  ): Promise<EmployeeRow[]> {
    const parts = directoryParts(today);
    return this.prisma.$queryRaw<EmployeeRow[]>`
      SELECT ${parts.columns}
      ${parts.people}
      ${parts.salary}
      ${whereFor(query, parts)}
      ${orderFor(query)}`;
  }

  /** `today` is a parameter so the result does not depend on the clock. */
  async list(
    query: EmployeeQuery,
    today: Date,
  ): Promise<{ rows: EmployeeRow[]; total: number }> {
    const parts = directoryParts(today);
    const { people, salary, columns } = parts;
    const where = whereFor(query, parts);
    const offset = (query.page - 1) * query.pageSize;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<EmployeeRow[]>`
        SELECT ${columns}
        ${people}
        ${salary}
        ${where}
        ${orderFor(query)}
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
