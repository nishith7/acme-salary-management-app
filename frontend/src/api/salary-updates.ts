import type { ApiClient } from './client.ts';
import type { SalaryChangeReason } from './employees.ts';

// Shapes of the bulk salary update, written by hand from
// backend/src/salary-updates/salary-updates.schemas.ts. Keep the two in step.

/** What would be recorded for a row. */
export interface SalaryUpdateChange {
  /** The new salary as typed in the file, trimmed: a decimal string. */
  annualAmount: string;
  /** The currency the person is paid in; never read from the file. */
  currencyCode: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  reason: SalaryChangeReason;
  /** The salary in force today; null for a first salary. */
  previousAmount: string | null;
  /** One decimal, as text ("8.1", "-2.5"); null for a first salary. */
  changePercent: string | null;
}

export interface SalaryUpdateRow {
  /** The line of the file the row starts on. */
  line: number;
  employeeCode: string;
  /** Null when no employee has this Employee ID. */
  fullName: string | null;
  /** WILL_UPDATE would be applied; UNCHANGED is already the person's salary; ERROR is refused. */
  outcome: 'WILL_UPDATE' | 'UNCHANGED' | 'ERROR';
  errors: string[];
  warnings: string[];
  change: SalaryUpdateChange | null;
}

export interface SalaryUpdateReport {
  /** What is wrong with the file as a whole; when there are any, there are no rows. */
  fileProblems: string[];
  /** How the file was read, when worth knowing and harmless: for example that dates written day-month-year were read as such. */
  notices: string[];
  rows: SalaryUpdateRow[];
  summary: {
    rows: number;
    willUpdate: number;
    unchanged: number;
    errors: number;
    withWarnings: number;
    notRequested: number;
  };
}

/** What applying a file did. */
export interface SalaryUpdateResult {
  /** The import that now holds the salaries added; null when nothing was added (nothing was saved). */
  importId: string | null;
  /** Salaries added. */
  applied: number;
  /** Rows already at the salary asked for. */
  unchanged: number;
  /** Rows refused because of an error. */
  skipped: number;
}

export function createSalaryUpdatesApi(client: ApiClient) {
  return {
    /** The CSV to fill in: everyone who can still be given a salary, with three empty columns. */
    async template(signal?: AbortSignal): Promise<Blob> {
      const { data } = await client.http.request<Blob>({
        method: 'GET',
        url: '/salary-updates/template',
        responseType: 'blob',
        signal,
      });
      return data;
    },

    /**
     * Checks a file's text against the people it names and says what would happen, row by
     * row. Saves nothing. The file goes as the body, with the type text/csv.
     */
    async preview(
      csv: string,
      signal?: AbortSignal,
    ): Promise<SalaryUpdateReport> {
      const { data } = await client.http.request<SalaryUpdateReport>({
        method: 'POST',
        url: '/salary-updates/preview',
        data: csv,
        headers: { 'Content-Type': 'text/csv' },
        signal,
      });
      return data;
    },

    /**
     * Applies a file: the server checks it again, on the data as it is now, and adds the
     * salary of every row that passes, all under one import. Rows with errors are skipped.
     * Rejects with an `ApiError` (400) for a file that cannot be read.
     */
    async apply(csv: string, fileName: string): Promise<SalaryUpdateResult> {
      const { data } = await client.http.request<SalaryUpdateResult>({
        method: 'POST',
        url: '/salary-updates/apply',
        params: { fileName },
        data: csv,
        headers: { 'Content-Type': 'text/csv' },
      });
      return data;
    },
  };
}
