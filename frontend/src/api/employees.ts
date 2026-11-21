import type { ApiClient } from './client.ts';

// Shapes of the employee directory, written by hand from
// backend/src/employees/employees.schemas.ts. Keep the two in step.

export const EMPLOYEE_STATUSES = ['ACTIVE', 'TERMINATED'] as const;
export const TENURE_BANDS = ['0-1', '1-3', '3-5', '5+'] as const;
export const BAND_POSITIONS = ['BELOW', 'WITHIN', 'ABOVE'] as const;
export const SORT_FIELDS = [
  'fullName',
  'employeeCode',
  'jobTitle',
  'level',
  'department',
  'country',
  'joiningDate',
  'salaryUsd',
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export type TenureBand = (typeof TENURE_BANDS)[number];
export type BandPosition = (typeof BAND_POSITIONS)[number];
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** True when `value` is a column the API can sort by. */
export function isSortField(value: string): value is SortField {
  return (SORT_FIELDS as readonly string[]).includes(value);
}

/**
 * The body of `QUERY /employees`. Everything is optional: `{}` is everyone, first page.
 * Different filters must all match; several values inside one filter match any of them.
 * A filter that is present must have at least one value, so leave it out instead of
 * sending an empty list.
 */
export interface EmployeeQuery {
  search?: string;
  statuses?: EmployeeStatus[];
  countries?: string[];
  departments?: string[];
  jobTitles?: string[];
  levels?: number[];
  tenureBands?: TenureBand[];
  bandPositions?: BandPosition[];
  sortBy?: SortField;
  sortOrder?: SortOrder;
  /** Starts at 1. */
  page?: number;
  /** At most 100. */
  pageSize?: number;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string;
  level: number;
  department: string;
  country: { code: string; name: string };
  /** YYYY-MM-DD */
  joiningDate: string;
  status: EmployeeStatus;
  /** YYYY-MM-DD; null while the person is active. */
  terminatedOn: string | null;
  tenureBand: TenureBand;
  /** The salary in force today; null if the person has no salary record. */
  currentSalary: {
    /** Annual gross in `currencyCode`: a decimal string, never a float. */
    annualAmount: string;
    currencyCode: string;
    /** The same in US dollars; null if there is no exchange rate. */
    annualAmountUsd: string | null;
  } | null;
  /** Null when there is no salary, or no band for the person's country and level. */
  bandPosition: BandPosition | null;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  page: number;
  pageSize: number;
  /** Employees matching the filters, across all pages. */
  total: number;
}

/** What the country and department filters can be set to (`GET /employees/filter-options`). */
export interface FilterOptions {
  /** Ordered by name. `code` is what the `countries` filter takes. */
  countries: { code: string; name: string }[];
  /** Ordered by name; each is what the `departments` filter takes. */
  departments: string[];
}

export function createEmployeesApi(client: ApiClient) {
  return {
    async filterOptions(signal?: AbortSignal): Promise<FilterOptions> {
      const { data } = await client.http.request<FilterOptions>({
        method: 'GET',
        url: '/employees/filter-options',
        signal,
      });
      return data;
    },

    /**
     * One page of the directory. It uses the HTTP QUERY method: a read-only request
     * that carries its filters in a JSON body. `signal` lets TanStack Query cancel a
     * request that a newer filter has made out of date.
     */
    async list(
      query: EmployeeQuery,
      signal?: AbortSignal,
    ): Promise<EmployeeListResponse> {
      const { data } = await client.http.request<EmployeeListResponse>({
        method: 'QUERY',
        url: '/employees',
        data: query,
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      return data;
    },
  };
}
