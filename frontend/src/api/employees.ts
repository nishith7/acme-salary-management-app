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

/** The body of `QUERY /employees/export`: the list's filters and sort, with no paging (everyone who matches). */
export type EmployeeExportQuery = Omit<EmployeeQuery, 'page' | 'pageSize'>;

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

export const SALARY_CHANGE_REASONS = [
  'HIRE',
  'PROMOTION',
  'MERIT',
  'MARKET_ADJUSTMENT',
  'CORRECTION',
] as const;
export type SalaryChangeReason = (typeof SALARY_CHANGE_REASONS)[number];

/** One salary an employee has been on. */
export interface SalaryHistoryEntry {
  id: string;
  /** Annual gross in `currencyCode`: a decimal string, never a float. */
  annualAmount: string;
  currencyCode: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  /** Null for a salary loaded without a reason, for example from a spreadsheet. */
  reason: SalaryChangeReason | null;
  /** Name of the user who recorded it; null when the seed loaded it. */
  changedBy: string | null;
  /** The salary before this one in time; null for the first. */
  previous: { annualAmount: string; currencyCode: string } | null;
  /**
   * The change from `previous` as a percentage with one decimal, as text ("8.1", "-2.5").
   * Null for the first salary and when the currency changed.
   */
  changePercent: string | null;
  /** CURRENT is in force today, SCHEDULED starts after today, PAST was replaced. */
  state: 'CURRENT' | 'PAST' | 'SCHEDULED';
}

/** One employee as the directory shows them, plus the whole salary history (newest first). */
export interface EmployeeProfile extends EmployeeListItem {
  salaryHistory: SalaryHistoryEntry[];
}

/** The body of `POST /employees/:id/salary-changes`. The currency is not sent: the API uses the one in force. */
export interface SalaryChangeRequest {
  /** A decimal string, for example "52000.50": never a number, so nothing is rounded. */
  annualAmount: string;
  /** YYYY-MM-DD; not before the joining date; a future date schedules the change. */
  effectiveFrom: string;
  /** HIRE only for a person with no salary yet; one of the other four for any later change. */
  reason: SalaryChangeReason;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  page: number;
  pageSize: number;
  /** Employees matching the filters, across all pages. */
  total: number;
}

/** What the directory's filters can be set to (`GET /employees/filter-options`). */
export interface FilterOptions {
  /** Ordered by name. `code` is what the `countries` filter takes. */
  countries: { code: string; name: string }[];
  /** Ordered by name; each is what the `departments` filter takes. */
  departments: string[];
  /** The levels that exist, ascending; each is what the `levels` filter takes. */
  levels: number[];
  /** The job titles that exist, in order; each is what the `jobTitles` filter takes. */
  jobTitles: string[];
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
     * Everyone who matches the filters as a CSV file, ready to save. The API sends the whole
     * directory in one response (about 1.3 MB for 10,000 people).
     */
    async exportCsv(
      query: EmployeeExportQuery,
      signal?: AbortSignal,
    ): Promise<Blob> {
      const { data } = await client.http.request<Blob>({
        method: 'QUERY',
        url: '/employees/export',
        data: query,
        headers: { 'Content-Type': 'application/json' },
        responseType: 'blob',
        signal,
      });
      return data;
    },

    /** One employee with their salary history. Rejects with a 404 `ApiError` if there is no such employee. */
    async get(id: string, signal?: AbortSignal): Promise<EmployeeProfile> {
      const { data } = await client.http.request<EmployeeProfile>({
        method: 'GET',
        url: `/employees/${encodeURIComponent(id)}`,
        signal,
      });
      return data;
    },

    /**
     * Adds a salary to the employee's history and returns the updated profile. Rejects with
     * an `ApiError`: 400 (invalid, or a date before the joining date), 404 (no such
     * employee) or 409 (the employee has left).
     */
    async addSalaryChange(
      id: string,
      request: SalaryChangeRequest,
    ): Promise<EmployeeProfile> {
      const { data } = await client.http.request<EmployeeProfile>({
        method: 'POST',
        url: `/employees/${encodeURIComponent(id)}/salary-changes`,
        data: request,
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
