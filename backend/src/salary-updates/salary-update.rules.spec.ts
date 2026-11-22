import { parseCsv } from './csv-parse.js';
import {
  checkSalaryUpdate,
  MAX_ROWS,
  readSalaryUpdateFile,
  type SalaryTarget,
} from './salary-update.rules.js';

const HEADER = 'Employee ID,New annual salary,Effective from,Reason';

const target = (overrides: Partial<SalaryTarget> = {}): SalaryTarget => ({
  employeeId: 'id-asha',
  employeeCode: 'EMP-00001',
  fullName: 'Asha Rao',
  status: 'ACTIVE',
  joiningDate: '2023-11-20',
  countryCurrencyCode: 'GBP',
  earliestCurrencyCode: 'GBP',
  salaryRecordCount: 3,
  current: {
    annualAmount: '50000.00',
    currencyCode: 'GBP',
    effectiveFrom: '2025-04-01',
  },
  ...overrides,
});

const targets = new Map<string, SalaryTarget>([
  ['EMP-00001', target()],
  [
    'EMP-00002',
    target({
      employeeId: 'id-bela',
      employeeCode: 'EMP-00002',
      fullName: 'Bela Beta',
      status: 'TERMINATED',
    }),
  ],
  [
    'EMP-00003',
    target({
      employeeId: 'id-cy',
      employeeCode: 'EMP-00003',
      fullName: 'Cy Gamma',
      countryCurrencyCode: 'EUR',
      // No salary at all, so no first salary either.
      earliestCurrencyCode: null,
      salaryRecordCount: 0,
      current: null,
    }),
  ],
]);

/** The whole pipeline on a file's text: read it, then check it against the people it names. */
function analyse(csv: string) {
  const file = readSalaryUpdateFile(parseCsv(csv));
  return { file, report: checkSalaryUpdate(file, targets) };
}

const rowsOf = (...lines: string[]) => [HEADER, ...lines].join('\n');

describe('readSalaryUpdateFile', () => {
  it('finds the columns by name, whatever the case, spacing or underscores, and ignores the others', () => {
    const { file } = analyse(
      'Full name,employee_id,NEW ANNUAL SALARY,effective-from,Reason,Notes\nAsha,EMP-00001,52000,2026-12-01,merit,hello\n',
    );

    expect(file.problems).toEqual([]);
    expect(file.entries).toEqual([
      {
        line: 2,
        employeeCode: 'EMP-00001',
        amount: '52000',
        date: '2026-12-01',
        reason: 'merit',
      },
    ]);
  });

  it('names the columns that are missing, and points at the template', () => {
    const { file } = analyse('Employee ID,Salary\nEMP-00001,52000\n');

    expect(file.problems).toHaveLength(1);
    expect(file.problems[0]).toContain('New annual salary');
    expect(file.problems[0]).toContain('Effective from');
    expect(file.problems[0]).toContain('Reason');
    expect(file.problems[0]).toContain('template');
  });

  it('refuses a column that appears twice, an empty file and a file with a header only', () => {
    expect(
      analyse(
        'Employee ID,Employee ID,New annual salary,Effective from,Reason\n',
      ).file.problems.join(' '),
    ).toContain('more than once');
    expect(analyse('').file.problems).toEqual(['The file is empty.']);
    expect(analyse(`${HEADER}\n`).file.problems).toEqual([
      'The file has a header but no rows below it.',
    ]);
  });

  it('refuses a file with more rows than one update takes', () => {
    const many = rowsOf(
      ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => `EMP-${i},1,,`),
    );

    expect(analyse(many).file.problems.join(' ')).toContain(
      `${MAX_ROWS.toLocaleString('en-US')}`,
    );
  });
});

describe('checkSalaryUpdate: rows that can be applied', () => {
  it('accepts a raise, in the currency the person is paid in, with the change worked out exactly', () => {
    const { report } = analyse(
      rowsOf('EMP-00001,52000.50,2026-12-01,Merit increase'),
    );

    expect(report.fileProblems).toEqual([]);
    expect(report.rows).toEqual([
      {
        line: 2,
        employeeCode: 'EMP-00001',
        fullName: 'Asha Rao',
        outcome: 'WILL_UPDATE',
        errors: [],
        warnings: [],
        change: {
          annualAmount: '52000.50',
          currencyCode: 'GBP',
          effectiveFrom: '2026-12-01',
          reason: 'MERIT',
          previousAmount: '50000.00',
          changePercent: '4.0',
        },
      },
    ]);
    expect(report.summary).toEqual({
      rows: 1,
      willUpdate: 1,
      unchanged: 0,
      errors: 0,
      withWarnings: 0,
      notRequested: 0,
    });
  });

  it('matches the Employee ID whatever its case, and accepts the reason as its code or its name', () => {
    const { report } = analyse(
      rowsOf(
        ' emp-00001 ,52000,2026-12-01,MARKET_ADJUSTMENT',
        'EMP-00003,40000,2023-11-20,hire',
      ),
    );

    expect(report.rows.map((r) => r.outcome)).toEqual([
      'WILL_UPDATE',
      'WILL_UPDATE',
    ]);
    expect(report.rows[0]?.change?.reason).toBe('MARKET_ADJUSTMENT');
  });

  it('gives a first salary the currency of the person’s country, and no percentage', () => {
    const { report } = analyse(
      rowsOf('EMP-00003,40000,2023-11-20,Joined ACME'),
    );

    expect(report.rows[0]?.change).toEqual({
      annualAmount: '40000',
      currencyCode: 'EUR',
      effectiveFrom: '2023-11-20',
      reason: 'HIRE',
      previousAmount: null,
      changePercent: null,
    });
  });

  it('uses the currency of the person’s first salary when the row is dated before any salary began', () => {
    const early = new Map<string, SalaryTarget>([
      [
        'EMP-00001',
        target({
          current: null,
          salaryRecordCount: 2,
          earliestCurrencyCode: 'USD',
          countryCurrencyCode: 'GBP',
        }),
      ],
    ]);
    const file = readSalaryUpdateFile(
      parseCsv(rowsOf('EMP-00001,52000,2023-11-20,Correction')),
    );

    const row = checkSalaryUpdate(file, early).rows[0];

    expect(row?.outcome).toBe('WILL_UPDATE');
    expect(row?.change).toMatchObject({
      currencyCode: 'USD',
      previousAmount: null,
      changePercent: null,
    });
  });

  it('leaves a person alone when the new salary is the one they already have', () => {
    const { report } = analyse(rowsOf('EMP-00001,50000,2026-12-01,Merit'));

    expect(report.rows[0]).toMatchObject({
      outcome: 'UNCHANGED',
      errors: [],
      change: null,
    });
    expect(report.summary).toMatchObject({ unchanged: 1, willUpdate: 0 });
  });

  it('does not list a row whose salary, date and reason were all left empty: nobody asked for a change', () => {
    const { report } = analyse(
      rowsOf('EMP-00001,,,', 'EMP-00001,52000,2026-12-01,Merit'),
    );

    // The second row is a duplicate of the first by code, but the first asked for nothing.
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.outcome).toBe('WILL_UPDATE');
    expect(report.summary).toMatchObject({ rows: 1, notRequested: 1 });
  });
});

describe('checkSalaryUpdate: rows with errors', () => {
  const only = (line: string) => analyse(rowsOf(line)).report.rows[0]!;

  it('refuses an Employee ID that is missing or unknown', () => {
    expect(only(',52000,2026-12-01,Merit')).toMatchObject({
      outcome: 'ERROR',
      errors: [expect.stringContaining('Employee ID is missing') as string],
    });
    expect(only('EMP-99999,52000,2026-12-01,Merit')).toMatchObject({
      outcome: 'ERROR',
      fullName: null,
      errors: [expect.stringContaining('No employee') as string],
    });
  });

  it('refuses someone who has left', () => {
    expect(only('EMP-00002,52000,2026-12-01,Merit')).toMatchObject({
      outcome: 'ERROR',
      errors: [expect.stringContaining('has left') as string],
    });
  });

  it('refuses an amount that is not plain digits, a dot and at most two decimals, or is zero', () => {
    for (const amount of [
      'abc',
      '52,000',
      '£52000',
      '52000.123',
      '-5',
      '0',
      '0.00',
      '1e5',
    ]) {
      // A spreadsheet quotes a cell that holds a comma, like "52,000".
      const cell = amount.includes(',') ? `"${amount}"` : amount;
      const row = only(`EMP-00001,${cell},2026-12-01,Merit`);
      expect(row.outcome, amount).toBe('ERROR');
      expect(row.errors.join(' '), amount).toContain('New annual salary');
    }
    // A blank amount with a date or a reason is a half-filled row, not an empty one.
    expect(only('EMP-00001,,2026-12-01,Merit').errors.join(' ')).toContain(
      'New annual salary is missing',
    );
  });

  it('wants a date that exists, in a layout it knows, and not before the person joined', () => {
    expect(only('EMP-00001,52000,2026-02-30,Merit').errors.join(' ')).toContain(
      'Effective from',
    );
    expect(
      only('EMP-00001,52000,next Monday,Merit').errors.join(' '),
    ).toContain('YYYY-MM-DD');
    expect(only('EMP-00001,52000,,Merit').errors.join(' ')).toContain(
      'Effective from is missing',
    );
    expect(only('EMP-00001,52000,2023-11-19,Merit').errors.join(' ')).toContain(
      'before the joining date',
    );
    expect(only('EMP-00001,52000,2023-11-20,Merit').outcome).toBe(
      'WILL_UPDATE',
    );
  });

  it('wants one of the four reasons, HIRE only for a first salary, and a first salary only as HIRE', () => {
    expect(only('EMP-00001,52000,2026-12-01,bonus').errors.join(' ')).toContain(
      'Reason',
    );
    expect(only('EMP-00001,52000,2026-12-01,').errors.join(' ')).toContain(
      'Reason is missing',
    );
    expect(only('EMP-00001,52000,2026-12-01,hire').errors.join(' ')).toContain(
      'HIRE',
    );
    expect(only('EMP-00003,40000,2023-11-20,Merit').errors.join(' ')).toContain(
      'HIRE',
    );
  });

  it('reports every problem in a row at once, so one pass through the file is enough', () => {
    const row = only('EMP-00001,52,000,31/12/2026,bonus');

    expect(row.outcome).toBe('ERROR');
    expect(row.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses every row of a person who is listed twice, naming the lines', () => {
    const { report } = analyse(
      rowsOf(
        'EMP-00001,52000,2026-12-01,Merit',
        'EMP-00003,40000,2023-11-20,Hire',
        'emp-00001,53000,2026-12-01,Promotion',
      ),
    );

    expect(report.rows.map((r) => r.outcome)).toEqual([
      'ERROR',
      'WILL_UPDATE',
      'ERROR',
    ]);
    expect(report.rows[0]?.errors[0]).toContain('lines 2 and 4');
    expect(report.rows[2]?.errors[0]).toContain('lines 2 and 4');
  });
});

describe('checkSalaryUpdate: warnings', () => {
  const only = (line: string) => analyse(rowsOf(line)).report.rows[0]!;

  it('warns about an unusually large raise, but still lets it through', () => {
    const row = only('EMP-00001,80000,2026-12-01,Merit');

    expect(row.outcome).toBe('WILL_UPDATE');
    expect(row.change?.changePercent).toBe('60.0');
    expect(row.warnings.join(' ')).toContain('60.0%');
  });

  it('warns about a decrease unless it is a correction', () => {
    const lowered = only('EMP-00001,45000,2026-12-01,Merit');
    const corrected = only('EMP-00001,45000,2026-12-01,Correction');

    expect(lowered.outcome).toBe('WILL_UPDATE');
    expect(lowered.warnings.join(' ')).toContain('lowers');
    expect(corrected.warnings).toEqual([]);
  });

  it('counts the rows with warnings in the summary', () => {
    const { report } = analyse(
      rowsOf(
        'EMP-00001,80000,2026-12-01,Merit',
        'EMP-00003,40000,2023-11-20,Hire',
      ),
    );

    expect(report.summary).toMatchObject({
      rows: 2,
      willUpdate: 2,
      withWarnings: 1,
    });
  });
});

describe('checkSalaryUpdate: a file that cannot be read', () => {
  it('gives the file’s problems and no rows', () => {
    const { report } = analyse('Employee ID,Salary\nEMP-00001,52000\n');

    expect(report.fileProblems).toHaveLength(1);
    expect(report.rows).toEqual([]);
    expect(report.summary.rows).toBe(0);
  });
});

describe('dates in the file', () => {
  const effectiveFromOf = (written: string) =>
    analyse(rowsOf(`EMP-00001,52000,${written},Merit`)).report;

  // Excel turns a typed 2026-05-01 into a real date and saves it in the computer's regional
  // style, so the file that comes back is rarely year first.
  it('reads a date written day-month-year, as Excel saves it, and says how it was read', () => {
    for (const written of ['01-05-2026', '1/5/2026', '01.05.2026']) {
      const report = effectiveFromOf(written);

      expect(report.rows[0]?.change?.effectiveFrom, written).toBe('2026-05-01');
      expect(report.notices.join(' '), written).toContain('1 May 2026');
    }
  });

  it('reads a date written year first as it is, with nothing to say about it', () => {
    for (const written of ['2026-05-01', '2026/05/01', '2026.5.1']) {
      const report = effectiveFromOf(written);

      expect(report.rows[0]?.change?.effectiveFrom, written).toBe('2026-05-01');
      expect(report.notices, written).toEqual([]);
    }
  });

  it('still refuses a date that does not exist or has no known layout', () => {
    for (const written of [
      '31-02-2026',
      '2026-13-01',
      'May 1st 2026',
      '01-05-26',
    ]) {
      const row = effectiveFromOf(written).rows[0];

      expect(row?.outcome, written).toBe('ERROR');
      expect(row?.errors.join(' '), written).toContain('Effective from');
    }
  });

  it('refuses the whole file when a date can only be month-day-year, so such a file is never read wrongly', () => {
    const { file } = analyse(
      rowsOf(
        'EMP-00001,52000,05/13/2026,Merit',
        'EMP-00003,40000,05/01/2026,Hire',
      ),
    );

    expect(file.problems).toHaveLength(1);
    expect(file.problems[0]).toContain('05/13/2026');
    expect(file.problems[0]).toContain('line 2');
    expect(file.problems[0]).toContain('YYYY-MM-DD');
  });
});
