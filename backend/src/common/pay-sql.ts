import { Prisma } from '../generated/prisma/client.js';
import { MIN_GROUP_SIZE } from '../insights/insights.rules.js';

/**
 * SQL for pay figures that follow the privacy rule, shared by everything that totals or averages
 * pay (the insights and the directory's summary cards), so they cannot disagree about it. All of
 * it works on a column named `usd`: one person's salary in US dollars, null if unknown.
 */

/** True for a set of people big enough that their figures may be calculated at all. */
export const ENOUGH = Prisma.sql`count(usd) >= ${MIN_GROUP_SIZE}::int`;

/**
 * A percentile of `usd`, rounded to cents as text, or null when the group is too small.
 * `percentile_cont` interpolates between the two middle values (the usual median) and works
 * in double precision; for annual salaries in dollars the error is far below a cent.
 */
export const percentile = (fraction: number) =>
  Prisma.sql`CASE WHEN ${ENOUGH} THEN round((percentile_cont(${fraction}::float8) WITHIN GROUP (ORDER BY usd))::numeric, 2)::text END`;
