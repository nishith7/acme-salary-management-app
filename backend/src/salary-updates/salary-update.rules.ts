import type {
  EmployeeStatus,
  SalaryChangeReason,
} from '../generated/prisma/enums.js';
import { checkSalaryChange } from '../employees/salary-change.rules.js';
import type { CsvRecord } from './csv-parse.js';
import { percentChange, toCents } from './money.js';

/**
 * The rules for a bulk salary update from a spreadsheet, with no I/O so every one of them is
 * easy to test. Two steps: `readSalaryUpdateFile` finds the columns and the rows (and says
 * what is wrong with the file as a whole), and `checkSalaryUpdate` checks each row against
 * the people it names. Nothing is saved here; the same check runs for the preview and again,
 * on the data as it is then, when the update is applied.
 *
 * The rules for a single change (nobody who has left, not before the joining date, HIRE only
 * for a first salary) are the app's one set, in `employees/salary-change.rules.ts`, and are
 * used here unchanged, so a spreadsheet can never do what the form refuses.
 */

/** One update takes at most this many rows (the whole directory is about 10,000). */
export const MAX_ROWS = 20_000;

/** A raise above this percentage is flagged as probably a typo (an extra zero, a dropped dot). */
export const LARGE_RAISE_PERCENT = 50;

const COLUMNS = {
  employeeCode: 'Employee ID',
  amount: 'New annual salary',
  date: 'Effective from',
  reason: 'Reason',
} as const;

/** The columns are found by name, ignoring case, spaces and punctuation: "employee_id" is "Employee ID". */
const normalise = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]/g, '');

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const REASONS: Record<string, SalaryChangeReason> = {
  promotion: 'PROMOTION',
  merit: 'MERIT',
  meritincrease: 'MERIT',
  marketadjustment: 'MARKET_ADJUSTMENT',
  correction: 'CORRECTION',
  hire: 'HIRE',
  joinedacme: 'HIRE',
};

/** One row of the file, as text. */
export interface SalaryUpdateEntry {
  line: number;
  employeeCode: string;
  amount: string;
  date: string;
  reason: string;
}

export interface SalaryUpdateFile {
  /** What is wrong with the file as a whole; when there are any, no row is checked. */
  problems: string[];
  entries: SalaryUpdateEntry[];
}

/** What the rules need to know about a person the file names. */
export interface SalaryTarget {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  status: EmployeeStatus;
  /** YYYY-MM-DD */
  joiningDate: string;
  countryCurrencyCode: string;
  salaryRecordCount: number;
  /** The salary in force today; null if the person has none. */
  current: {
    annualAmount: string;
    currencyCode: string;
    effectiveFrom: string;
  } | null;
}

export interface SalaryUpdateChange {
  /** As typed in the file, trimmed. */
  annualAmount: string;
  currencyCode: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  reason: SalaryChangeReason;
  previousAmount: string | null;
  /** One decimal, for example "8.1" or "-2.5"; null for a first salary. */
  changePercent: string | null;
}

export interface SalaryUpdateRow {
  line: number;
  employeeCode: string;
  fullName: string | null;
  /** WILL_UPDATE would be applied; UNCHANGED is already the person's salary; ERROR is refused. */
  outcome: 'WILL_UPDATE' | 'UNCHANGED' | 'ERROR';
  errors: string[];
  warnings: string[];
  change: SalaryUpdateChange | null;
}

export interface SalaryUpdateReport {
  fileProblems: string[];
  rows: SalaryUpdateRow[];
  summary: {
    /** Rows that asked for a change (a row with nothing filled in is not one). */
    rows: number;
    willUpdate: number;
    unchanged: number;
    errors: number;
    /** Rows that will be applied but carry a warning. */
    withWarnings: number;
    /** Rows with the salary, date and reason all left empty: nobody asked for a change. */
    notRequested: number;
  };
}

/** The report for a file that cannot be checked at all: its problems, and no rows. */
export function problemReport(problems: string[]): SalaryUpdateReport {
  return {
    fileProblems: problems,
    rows: [],
    summary: {
      rows: 0,
      willUpdate: 0,
      unchanged: 0,
      errors: 0,
      withWarnings: 0,
      notRequested: 0,
    },
  };
}

export function readSalaryUpdateFile(records: CsvRecord[]): SalaryUpdateFile {
  const [header, ...rows] = records;
  if (!header) {
    return { problems: ['The file is empty.'], entries: [] };
  }

  const names = header.cells.map(normalise);
  const problems: string[] = [];
  const missing: string[] = [];
  const index = {} as Record<keyof typeof COLUMNS, number>;
  for (const key of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
    const label = COLUMNS[key];
    const positions = names.flatMap((n, i) =>
      n === normalise(label) ? [i] : [],
    );
    if (positions.length === 0) {
      missing.push(label);
    } else if (positions.length > 1) {
      problems.push(`The column "${label}" appears more than once.`);
    } else {
      index[key] = positions[0] as number;
    }
  }
  if (missing.length > 0) {
    problems.push(
      `The file is missing ${missing.length > 1 ? 'the columns' : 'the column'} ${missing.map((m) => `"${m}"`).join(', ')}. Download the template to get the right columns.`,
    );
  }
  if (problems.length === 0 && rows.length === 0) {
    problems.push('The file has a header but no rows below it.');
  }
  if (rows.length > MAX_ROWS) {
    problems.push(
      `The file has ${rows.length.toLocaleString('en-US')} rows, and one update takes at most ${MAX_ROWS.toLocaleString('en-US')}. Split it into smaller files.`,
    );
  }
  if (problems.length > 0) {
    return { problems, entries: [] };
  }

  const cellAt = (row: CsvRecord, key: keyof typeof COLUMNS) =>
    (row.cells[index[key]] ?? '').trim();
  return {
    problems: [],
    entries: rows.map((row) => ({
      line: row.line,
      employeeCode: cellAt(row, 'employeeCode'),
      amount: cellAt(row, 'amount'),
      date: cellAt(row, 'date'),
      reason: cellAt(row, 'reason'),
    })),
  };
}

/** True for a date that exists, written YYYY-MM-DD (2026-02-30 does not). */
function isRealIsoDate(text: string): boolean {
  const parts = ISO_DATE.exec(text);
  if (!parts) {
    return false;
  }
  const [year, month, day] = [
    Number(parts[1]),
    Number(parts[2]),
    Number(parts[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** "2 and 4", "2, 4 and 9". */
function listLines(lines: number[]): string {
  return lines.length < 3
    ? lines.join(' and ')
    : `${lines.slice(0, -1).join(', ')} and ${lines.at(-1)}`;
}

function checkRow(
  entry: SalaryUpdateEntry,
  target: SalaryTarget | null,
  linesOfSamePerson: number[],
): SalaryUpdateRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entry.employeeCode === '') {
    errors.push('Employee ID is missing.');
  } else {
    if (linesOfSamePerson.length > 1) {
      errors.push(
        `${entry.employeeCode} is on lines ${listLines(linesOfSamePerson)}: list each person once per file.`,
      );
    }
    if (!target) {
      errors.push(`No employee has the Employee ID ${entry.employeeCode}.`);
    }
  }

  let amountOk = false;
  if (entry.amount === '') {
    errors.push('New annual salary is missing.');
  } else if (!AMOUNT.test(entry.amount) || !/[1-9]/.test(entry.amount)) {
    errors.push(
      `New annual salary "${entry.amount}" is not valid: use digits only with a dot for decimals (for example 52000 or 52000.50), no thousands separator or currency symbol, and more than zero.`,
    );
  } else {
    amountOk = true;
  }

  let dateOk = false;
  if (entry.date === '') {
    errors.push('Effective from is missing.');
  } else if (!isRealIsoDate(entry.date)) {
    errors.push(
      `Effective from "${entry.date}" is not a valid date: write it as YYYY-MM-DD, for example 2026-12-01 (a date like 01/12/2026 is ambiguous, so it is not accepted).`,
    );
  } else {
    dateOk = true;
  }

  const reason = REASONS[normalise(entry.reason)];
  if (entry.reason === '') {
    errors.push('Reason is missing.');
  } else if (!reason) {
    errors.push(
      `Reason "${entry.reason}" is not recognised: use Promotion, Merit increase, Market adjustment or Correction.`,
    );
  }

  // The app's rules for a single change, once the row is otherwise readable.
  if (target && amountOk && dateOk && reason) {
    const problem = checkSalaryChange(
      {
        status: target.status,
        joiningDate: target.joiningDate,
        hasSalary: target.salaryRecordCount > 0,
      },
      { effectiveFrom: entry.date, reason },
    );
    if (problem) {
      errors.push(problem.message);
    }
  }

  const row = {
    line: entry.line,
    employeeCode: entry.employeeCode,
    fullName: target?.fullName ?? null,
  };
  if (errors.length > 0 || !target || !reason) {
    return { ...row, outcome: 'ERROR', errors, warnings, change: null };
  }

  const current = target.current;
  if (current && toCents(entry.amount) === toCents(current.annualAmount)) {
    return { ...row, outcome: 'UNCHANGED', errors, warnings, change: null };
  }

  const changePercent = current
    ? percentChange(current.annualAmount, entry.amount)
    : null;
  if (current) {
    const now = toCents(entry.amount);
    const before = toCents(current.annualAmount);
    if (now * 100n > before * BigInt(100 + LARGE_RAISE_PERCENT)) {
      warnings.push(
        `A raise of ${changePercent}% is unusually large: check the amount for a typo.`,
      );
    } else if (now < before && reason !== 'CORRECTION') {
      warnings.push(
        `This lowers the salary by ${changePercent?.replace('-', '')}%. If it fixes a mistake, use the reason Correction.`,
      );
    }
  }
  return {
    ...row,
    outcome: 'WILL_UPDATE',
    errors,
    warnings,
    change: {
      annualAmount: entry.amount,
      currencyCode: current?.currencyCode ?? target.countryCurrencyCode,
      effectiveFrom: entry.date,
      reason,
      previousAmount: current?.annualAmount ?? null,
      changePercent,
    },
  };
}

/**
 * Checks every row that asked for a change against the people it names. `targets` is keyed by
 * the upper-case Employee ID.
 */
export function checkSalaryUpdate(
  file: SalaryUpdateFile,
  targets: ReadonlyMap<string, SalaryTarget>,
): SalaryUpdateReport {
  if (file.problems.length > 0) {
    return problemReport(file.problems);
  }

  const requested = file.entries.filter(
    (e) => e.amount !== '' || e.date !== '' || e.reason !== '',
  );
  const linesByPerson = new Map<string, number[]>();
  for (const entry of requested) {
    const key = entry.employeeCode.toUpperCase();
    if (key !== '') {
      linesByPerson.set(key, [...(linesByPerson.get(key) ?? []), entry.line]);
    }
  }

  const rows = requested.map((entry) => {
    const key = entry.employeeCode.toUpperCase();
    return checkRow(
      entry,
      key === '' ? null : (targets.get(key) ?? null),
      linesByPerson.get(key) ?? [],
    );
  });
  return {
    fileProblems: [],
    rows,
    summary: {
      rows: rows.length,
      willUpdate: rows.filter((r) => r.outcome === 'WILL_UPDATE').length,
      unchanged: rows.filter((r) => r.outcome === 'UNCHANGED').length,
      errors: rows.filter((r) => r.outcome === 'ERROR').length,
      withWarnings: rows.filter(
        (r) => r.outcome === 'WILL_UPDATE' && r.warnings.length > 0,
      ).length,
      notRequested: file.entries.length - requested.length,
    },
  };
}
