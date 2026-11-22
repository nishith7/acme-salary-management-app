import type {
  BandPosition,
  EmployeeQuery,
  EmployeeStatus,
  TenureBand,
} from '../../api/employees.ts';

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
  /** Where the salary sits against the pay band for the person's country and level. */
  bandPositions: BandPosition[];
  /** Numbers, as the API takes them: 1 is the most junior. */
  levels: number[];
  tenureBands: TenureBand[];
  jobTitles: string[];
}

export const NO_FILTERS: DirectoryFilters = {
  search: '',
  statuses: [],
  countries: [],
  departments: [],
  bandPositions: [],
  levels: [],
  tenureBands: [],
  jobTitles: [],
};

/** True when something narrows the list, which is when "Clear filters" has work to do. */
export function hasActiveFilters(filters: DirectoryFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.statuses.length > 0 ||
    filters.countries.length > 0 ||
    filters.departments.length > 0 ||
    filters.bandPositions.length > 0 ||
    countMoreFilters(filters) > 0
  );
}

/**
 * How many of the filters kept behind "More filters" (level, tenure, job title) are on, so the
 * button can say so while they are hidden.
 */
export function countMoreFilters(filters: DirectoryFilters): number {
  return (
    Number(filters.levels.length > 0) +
    Number(filters.tenureBands.length > 0) +
    Number(filters.jobTitles.length > 0)
  );
}

/**
 * The request body for these filters. The API rejects an empty list and a blank search
 * (400) instead of reading them as "no filter", so anything unset is left out entirely.
 */
export function toEmployeeFilterQuery(
  filters: DirectoryFilters,
): Pick<
  EmployeeQuery,
  | 'search'
  | 'statuses'
  | 'countries'
  | 'departments'
  | 'bandPositions'
  | 'levels'
  | 'tenureBands'
  | 'jobTitles'
> {
  const search = filters.search.trim();
  return {
    ...(search && { search }),
    ...(filters.statuses.length > 0 && { statuses: filters.statuses }),
    ...(filters.countries.length > 0 && { countries: filters.countries }),
    ...(filters.departments.length > 0 && {
      departments: filters.departments,
    }),
    ...(filters.bandPositions.length > 0 && {
      bandPositions: filters.bandPositions,
    }),
    ...(filters.levels.length > 0 && { levels: filters.levels }),
    ...(filters.tenureBands.length > 0 && { tenureBands: filters.tenureBands }),
    ...(filters.jobTitles.length > 0 && { jobTitles: filters.jobTitles }),
  };
}
