import type { EmployeeRow } from './employees.repository.js';
import { toEmployeesCsv } from './employees-csv.js';

describe('toEmployeesCsv', () => {
  const person: EmployeeRow = {
    id: '5b1c6d0a-8f3e-4c52-9a1e-2d7f4b6a9c10',
    employeeCode: 'EMP-00001',
    fullName: 'Asha Rao',
    jobTitle: 'Staff Engineer',
    level: 3,
    department: 'Engineering',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    joiningDate: '2023-11-20',
    status: 'ACTIVE',
    terminatedOn: null,
    tenureBand: '1-3',
    annualAmount: '48700.00',
    currencyCode: 'GBP',
    annualAmountUsd: '61646.00',
    salaryEffectiveFrom: '2025-04-01',
    bandPosition: 'WITHIN',
  };

  /** The file without the byte order mark, as lines. */
  const lines = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n');

  it('starts with the byte order mark Excel needs to read names like Müller correctly, and ends each line with CRLF', () => {
    const csv = toEmployeesCsv([person]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('gives a header row and one row per person, with the current salary exactly as stored', () => {
    const [header, row, end] = lines(toEmployeesCsv([person]));

    expect(header).toBe(
      'Employee ID,Full name,Job title,Level,Department,Country,Joining date,Status,Left on,Currency,Annual salary,Salary effective from,Annual salary (USD),Pay band',
    );
    expect(row).toBe(
      'EMP-00001,Asha Rao,Staff Engineer,3,Engineering,United Kingdom,2023-11-20,Active,,GBP,48700.00,2025-04-01,61646.00,Within band',
    );
    expect(end).toBe('');
  });

  it('writes a person who has left with their last day, and a person with no salary with empty salary cells', () => {
    const [, left, noSalary] = lines(
      toEmployeesCsv([
        { ...person, status: 'TERMINATED', terminatedOn: '2026-03-31' },
        {
          ...person,
          annualAmount: null,
          currencyCode: null,
          annualAmountUsd: null,
          salaryEffectiveFrom: null,
          bandPosition: null,
        },
      ]),
    );

    expect(left).toContain(',Left,2026-03-31,GBP,');
    expect(noSalary).toBe(
      'EMP-00001,Asha Rao,Staff Engineer,3,Engineering,United Kingdom,2023-11-20,Active,,,,,,',
    );
  });

  it('quotes a cell that holds a comma, a quote or a line break, so one person stays one row', () => {
    const csv = toEmployeesCsv([
      {
        ...person,
        jobTitle: 'VP, "People" & Culture',
        fullName: 'Line\nBreak',
      },
    ]);

    expect(csv).toContain('"VP, ""People"" & Culture"');
    expect(csv).toContain('"Line\nBreak"');
  });

  it('defuses a cell a spreadsheet would run as a formula, but leaves ordinary text and amounts alone', () => {
    const csv = toEmployeesCsv([
      {
        ...person,
        fullName: '=HYPERLINK("http://x","hi")',
        jobTitle: '-5 + 3',
      },
      { ...person, fullName: '@SUM(A1)', jobTitle: '+1' },
    ]);

    // A leading apostrophe makes the spreadsheet show the text instead of running it.
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""hi"")"`);
    expect(csv).toContain(`'-5 + 3`);
    expect(csv).toContain(`'@SUM(A1)`);
    expect(csv).toContain(`'+1`);
    // Amounts are left exactly as stored, and the unchanged text of other cells too.
    expect(csv).toContain(',48700.00,');
    expect(csv).toContain(',Engineering,');
  });

  it('gives only the header for nobody', () => {
    expect(lines(toEmployeesCsv([]))).toHaveLength(2); // the header and the empty end
  });

  it('can add the three empty columns a bulk salary update is filled in with', () => {
    const [header, row] = lines(
      toEmployeesCsv([person], { withUpdateColumns: true }),
    );

    expect(header).toBe(
      'Employee ID,Full name,Job title,Level,Department,Country,Joining date,Status,Left on,Currency,Annual salary,Salary effective from,Annual salary (USD),Pay band,New annual salary,Effective from,Reason',
    );
    expect(row).toBe(
      'EMP-00001,Asha Rao,Staff Engineer,3,Engineering,United Kingdom,2023-11-20,Active,,GBP,48700.00,2025-04-01,61646.00,Within band,,,',
    );
  });
});
