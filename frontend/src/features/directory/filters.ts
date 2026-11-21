import type { EmployeeQuery, EmployeeStatus } from '../../api/employees.ts';

/**
 * What the search box and the filter controls are set to. Empty means "no restriction":
 * an empty list is "all countries", not "no countries".
 */
export interface DirectoryFilters {
  search: string;
  statuses: EmployeeStatus[];
  /** ISO country codes, for example `IN`. */
  countries: string[];
  departments: string[];
}

export const NO_FILTERS: DirectoryFilters = {
  search: '',
  statuses: [],
  countries: [],
  departments: [],
};

/** True when something narrows the list, which is when "Clear filters" has work to do. */
export function hasActiveFilters(filters: DirectoryFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.statuses.length > 0 ||
    filters.countries.length > 0 ||
    filters.departments.length > 0
  );
}

/**
 * The request body for these filters. The API rejects an empty list and a blank search
 * (400) instead of reading them as "no filter", so anything unset is left out entirely.
 */
export function toEmployeeFilterQuery(
  filters: DirectoryFilters,
): Pick<EmployeeQuery, 'search' | 'statuses' | 'countries' | 'departments'> {
  const search = filters.search.trim();
  return {
    ...(search && { search }),
    ...(filters.statuses.length > 0 && { statuses: filters.statuses }),
    ...(filters.countries.length > 0 && { countries: filters.countries }),
    ...(filters.departments.length > 0 && {
      departments: filters.departments,
    }),
  };
}
