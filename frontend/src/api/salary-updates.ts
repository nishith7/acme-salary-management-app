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
  };
}
