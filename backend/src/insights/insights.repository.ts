import { Injectable } from '@nestjs/common';
import { ENOUGH, percentile } from '../common/pay-sql.js';
import {
  directoryParts,
  whereFor,
  type DirectoryFilters,
} from '../employees/employees.repository.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type GenderOverallRow,
  type GenderRow,
  type PayGroupRow,
  type PayStatsRow,
} from './insights.rules.js';

export type PayGrouping = 'country' | 'department' | 'level';

/** What narrows the people an insight looks at, on top of "current employees only". */
export type PayFilters = Pick<
  DirectoryFilters,
  'countries' | 'departments' | 'levels'
>;

export interface PayOverallRow extends PayStatsRow {
  /** Current employees left out of every figure: no salary yet, or no exchange rate for its currency. */
  excluded: number;
}

/** How each grouping names a group: a stable key, and a label for people. Fixed text chosen from a validated list, never user input. */
const GROUPING: Record<PayGrouping, { key: Prisma.Sql; label: Prisma.Sql }> = {
  country: { key: Prisma.sql`c.code`, label: Prisma.sql`c.name` },
  department: { key: Prisma.sql`d.name`, label: Prisma.sql`d.name` },
  level: {
    key: Prisma.sql`e.level::text`,
    label: Prisma.sql`'Level ' || e.level`,
  },
};

/**
 * Pay figures, worked out in the database. They are about current employees only, in US
 * dollars (each salary converted at the rate in force today, the same definition of "salary
 * today" the directory uses), and their filters are the directory's.
 *
 * The privacy rule is applied here as well as in the service: the figures of a group of
 * fewer than MIN_GROUP_SIZE people are never calculated into the result, they come back as
 * null, so a small group's pay does not even reach the application.
 */
@Injectable()
export class InsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async payBy(
    grouping: PayGrouping,
    filters: PayFilters,
    today: Date,
  ): Promise<{ groups: PayGroupRow[]; overall: PayOverallRow }> {
    const parts = directoryParts(today);
    const where = whereFor({ ...filters, statuses: ['ACTIVE'] }, parts);
    const { key, label } = GROUPING[grouping];

    // One row per current employee that matches, with their salary in dollars (null if there is
    // no salary, or no exchange rate to convert it).
    const people = Prisma.sql`
      SELECT ${key} AS "key", ${label} AS "label",
        round(s.annual_amount / fx.units_per_usd, 2) AS usd
      ${parts.people}
      ${parts.salary}
      ${where}`;

    const figures = Prisma.sql`
      count(usd)::int AS headcount,
      ${percentile(0.25)} AS p25,
      ${percentile(0.5)} AS median,
      ${percentile(0.75)} AS p75,
      CASE WHEN ${ENOUGH} THEN sum(usd)::text END AS total`;

    const [groups, overall] = await Promise.all([
      this.prisma.$queryRaw<PayGroupRow[]>`
        WITH people AS (${people})
        SELECT "key", "label", ${figures}
        FROM people
        WHERE usd IS NOT NULL
        GROUP BY "key", "label"`,
      this.prisma.$queryRaw<PayOverallRow[]>`
        WITH people AS (${people})
        SELECT ${figures}, count(*) FILTER (WHERE usd IS NULL)::int AS excluded
        FROM people`,
    ]);
    // An aggregate without GROUP BY always returns exactly one row.
    return { groups, overall: overall[0] as PayOverallRow };
  }

  /**
   * The median pay of women and of men, level by level and for everyone together, with how
   * many people each median is about. A side with fewer than MIN_GROUP_SIZE people comes
   * back with no median. People of another gender, and people with no salary or exchange rate,
   * are in neither side: they are only counted, so the totals say what they cover.
   */
  async genderPayBy(
    filters: PayFilters,
    today: Date,
  ): Promise<{
    levels: GenderRow[];
    overall: GenderOverallRow[];
    otherGender: number;
    excluded: number;
  }> {
    const parts = directoryParts(today);
    const where = whereFor({ ...filters, statuses: ['ACTIVE'] }, parts);
    const people = Prisma.sql`
      SELECT e.level AS level, e.gender::text AS gender,
        round(s.annual_amount / fx.units_per_usd, 2) AS usd
      ${parts.people}
      ${parts.salary}
      ${where}`;
    const compared = Prisma.sql`usd IS NOT NULL AND gender IN ('FEMALE', 'MALE')`;
    const figures = Prisma.sql`count(usd)::int AS headcount, ${percentile(0.5)} AS median`;

    const [levels, overall, counts] = await Promise.all([
      this.prisma.$queryRaw<GenderRow[]>`
        WITH people AS (${people})
        SELECT level, gender, ${figures}
        FROM people
        WHERE ${compared}
        GROUP BY level, gender`,
      this.prisma.$queryRaw<GenderOverallRow[]>`
        WITH people AS (${people})
        SELECT gender, ${figures}
        FROM people
        WHERE ${compared}
        GROUP BY gender`,
      this.prisma.$queryRaw<{ otherGender: number; excluded: number }[]>`
        WITH people AS (${people})
        SELECT
          count(*) FILTER (WHERE usd IS NOT NULL AND gender NOT IN ('FEMALE', 'MALE'))::int AS "otherGender",
          count(*) FILTER (WHERE usd IS NULL)::int AS excluded
        FROM people`,
    ]);
    return {
      levels,
      overall,
      otherGender: counts[0]?.otherGender ?? 0,
      excluded: counts[0]?.excluded ?? 0,
    };
  }
}
