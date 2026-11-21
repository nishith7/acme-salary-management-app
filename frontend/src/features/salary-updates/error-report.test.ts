import { describe, expect, it } from 'vitest';
import type { SalaryUpdateRow } from '../../api/salary-updates.ts';
import { errorReportCsv } from './error-report.ts';

const row = (overrides: Partial<SalaryUpdateRow>): SalaryUpdateRow => ({
  line: 2,
  employeeCode: 'EMP-00001',
  fullName: 'Asha Rao',
  outcome: 'ERROR',
  errors: [],
  warnings: [],
  change: null,
  ...overrides,
});

describe('the error report', () => {
  it('has one line per problem, with the line of the person’s own file, ready for Excel', () => {
    const csv = errorReportCsv([
      row({
        line: 4,
        errors: ['Effective from is missing.', 'Reason is missing.'],
      }),
      row({
        line: 9,
        employeeCode: 'EMP-00002',
        errors: ['No employee has this Employee ID.'],
      }),
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.replace('\uFEFF', '').split('\r\n')).toEqual([
      'Line,Employee ID,Problem',
      '4,EMP-00001,Effective from is missing.',
      '4,EMP-00001,Reason is missing.',
      '9,EMP-00002,No employee has this Employee ID.',
      '',
    ]);
  });

  it('quotes a problem that holds a comma or a quote, and defuses an Employee ID a spreadsheet would run as a formula', () => {
    const csv = errorReportCsv([
      row({
        employeeCode: '=HYPERLINK("http://x")',
        errors: ['New annual salary "52,000" is not valid: use digits only.'],
      }),
    ]);

    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(
      '"New annual salary ""52,000"" is not valid: use digits only."',
    );
  });

  it('has only the header when there is nothing wrong', () => {
    // (trim() would also strip the byte order mark, so take it off first.)
    expect(
      errorReportCsv([row({ outcome: 'WILL_UPDATE' })])
        .replace('\uFEFF', '')
        .trim(),
    ).toBe('Line,Employee ID,Problem');
  });
});
