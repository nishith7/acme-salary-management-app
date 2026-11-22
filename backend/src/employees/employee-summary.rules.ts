import { MIN_GROUP_SIZE } from '../insights/insights.rules.js';
import type { EmployeeSummary } from './employees.schemas.js';

/**
 * The privacy rule for the summary cards (requirements section 3): a total, median or average
 * over fewer than MIN_GROUP_SIZE people tells the reader roughly what each of them earns, so
 * the money is only shown for 5 or more. The database already leaves it empty below that; this
 * is the second lock, so a small group's pay cannot leave the API however the query changes.
 * The counts are always shown: they say how many people there are, not what they are paid.
 */
export function showableSummary(row: EmployeeSummary): EmployeeSummary {
  if (row.counted >= MIN_GROUP_SIZE) {
    return row;
  }
  return { ...row, totalAnnualUsd: null, medianUsd: null, averageUsd: null };
}
