import type { PayGrouping, PayQuery } from '../../api/insights.ts';

/** What the insights page lets the person choose. Empty means "no restriction", not "none". */
export interface PayChoices {
  groupBy: PayGrouping;
  /** ISO country codes, for example `IN`. */
  countries: string[];
  departments: string[];
}

export const NO_PAY_FILTERS: Pick<PayChoices, 'countries' | 'departments'> = {
  countries: [],
  departments: [],
};

/**
 * The request body for these choices. The API refuses an empty list (400) instead of reading
 * it as "no filter", so a filter with nothing chosen is left out entirely.
 */
export function toPayQuery(choices: PayChoices): PayQuery {
  return {
    groupBy: choices.groupBy,
    ...(choices.countries.length > 0 && { countries: choices.countries }),
    ...(choices.departments.length > 0 && {
      departments: choices.departments,
    }),
  };
}

/** True when a filter narrows the people, which is when "Clear filters" has work to do. */
export function hasPayFilters(choices: PayChoices): boolean {
  return choices.countries.length > 0 || choices.departments.length > 0;
}
