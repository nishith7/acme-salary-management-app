import type { SalaryUpdateRow } from '../../api/salary-updates.ts';

/**
 * The problems of an update file as a CSV the person can open next to their spreadsheet and
 * work through: one line per problem, with the line of their file it is about. The Employee
 * ID comes from their file, so a cell a spreadsheet would run as a formula (= + - @) is
 * defused with a leading apostrophe, as in the export. A byte order mark comes first so Excel
 * reads it as UTF-8.
 */
function cell(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function errorReportCsv(rows: SalaryUpdateRow[]): string {
  const lines = ['Line,Employee ID,Problem'];
  for (const row of rows) {
    for (const problem of row.errors) {
      lines.push(
        [String(row.line), row.employeeCode, problem].map(cell).join(','),
      );
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
