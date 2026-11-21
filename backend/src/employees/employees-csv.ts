import type { EmployeeRow } from './employees.repository.js';

/**
 * The directory as a CSV file. Pure, so what ends up in the file is easy to test.
 *
 * Choices, each for the person who opens it in Excel:
 *  - a UTF-8 byte order mark first, because without it Excel reads the file as a legacy code
 *    page and turns "Müller" into "MÃ¼ller";
 *  - CRLF line ends (RFC 4180), which every spreadsheet reads;
 *  - amounts exactly as stored ("48700.00"), dates as YYYY-MM-DD: nothing is formatted by a
 *    locale or rounded, so the file means the same on every machine;
 *  - a cell that starts with = + - @ (or a tab or carriage return) gets a leading apostrophe,
 *    because a spreadsheet would otherwise run it as a formula (CSV injection): a name or a
 *    job title typed as `=HYPERLINK(...)` must stay text.
 */

const HEADER = [
  'Employee ID',
  'Full name',
  'Job title',
  'Level',
  'Department',
  'Country',
  'Joining date',
  'Status',
  'Left on',
  'Currency',
  'Annual salary',
  'Salary effective from',
  'Annual salary (USD)',
  'Pay band',
] as const;

const BAND_POSITION_WORDS = {
  BELOW: 'Below band',
  WITHIN: 'Within band',
  ABOVE: 'Above band',
} as const;

/** A character that makes a spreadsheet read a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  let text = String(value);
  if (FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowOf(person: EmployeeRow): string {
  return [
    person.employeeCode,
    person.fullName,
    person.jobTitle,
    person.level,
    person.department,
    person.countryName,
    person.joiningDate,
    person.status === 'ACTIVE' ? 'Active' : 'Left',
    person.terminatedOn,
    person.currencyCode,
    person.annualAmount,
    person.salaryEffectiveFrom,
    person.annualAmountUsd,
    person.bandPosition ? BAND_POSITION_WORDS[person.bandPosition] : null,
  ]
    .map(cell)
    .join(',');
}

/** The columns a bulk salary update is filled in with; the update reads them by these names. */
const UPDATE_COLUMNS = [
  'New annual salary',
  'Effective from',
  'Reason',
] as const;

/**
 * With `withUpdateColumns`, three empty columns are added at the end: the template for a bulk
 * salary update, where the person fills in the new salary, its date and why, for the people
 * who are getting a change, and leaves the rest empty.
 */
export function toEmployeesCsv(
  people: EmployeeRow[],
  options: { withUpdateColumns?: boolean } = {},
): string {
  const extra = options.withUpdateColumns;
  const lines = [
    (extra ? [...HEADER, ...UPDATE_COLUMNS] : [...HEADER]).join(','),
    ...people.map((person) => (extra ? `${rowOf(person)},,,` : rowOf(person))),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
