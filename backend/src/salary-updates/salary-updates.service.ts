import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { toEmployeesCsv } from '../employees/employees-csv.js';
import {
  EmployeesRepository,
  type SalaryTargetRow,
} from '../employees/employees.repository.js';
import { CsvError, parseCsv } from './csv-parse.js';
import { SalaryUpdatesRepository } from './salary-updates.repository.js';
import type { SalaryUpdateResultResponse } from './salary-updates.schemas.js';
import {
  checkSalaryUpdate,
  isRealIsoDate,
  problemReport,
  readSalaryUpdateFile,
  type SalaryTarget,
  type SalaryUpdateReport,
} from './salary-update.rules.js';

@Injectable()
export class SalaryUpdatesService {
  constructor(
    private readonly employees: EmployeesRepository,
    private readonly updates: SalaryUpdatesRepository,
  ) {}

  /**
   * The file to fill in: everyone who can still be given a salary (the people who have left
   * cannot), one row each with their current salary, and three empty columns for the change.
   */
  async template(): Promise<string> {
    const people = await this.employees.listAll(
      { statuses: ['ACTIVE'], sortBy: 'employeeCode', sortOrder: 'asc' },
      new Date(),
    );
    return toEmployeesCsv(people, { withUpdateColumns: true });
  }

  /**
   * Checks an uploaded file, row by row, against the people it names, and says what would
   * happen. Reads only: nothing is saved.
   */
  async preview(csv: string): Promise<SalaryUpdateReport> {
    return (await this.analyse(csv)).report;
  }

  /**
   * Applies a file: runs exactly the check the preview ran, on the data as it is now, and
   * adds the salary of every row that passed, all under one import, as the signed-in user.
   * Rows with errors are skipped, not applied, and a salary that is already in place is left
   * alone, so applying the same file twice adds nothing the second time. When nothing would
   * be added, nothing is saved at all (no empty import).
   */
  async apply(
    csv: string,
    fileName: string,
    userId: string,
  ): Promise<SalaryUpdateResultResponse> {
    const { report, targets } = await this.analyse(csv);
    if (report.fileProblems.length > 0) {
      throw new BadRequestException(report.fileProblems.join(' '));
    }

    const salaries = report.rows.flatMap((row) => {
      const target = targets.get(row.employeeCode.toUpperCase());
      return row.outcome === 'WILL_UPDATE' && row.change && target
        ? [
            {
              employeeId: target.employeeId,
              annualAmount: row.change.annualAmount,
              currencyCode: row.change.currencyCode,
              effectiveFrom: row.change.effectiveFrom,
              reason: row.change.reason,
            },
          ]
        : [];
    });
    const counts = {
      applied: salaries.length,
      unchanged: report.summary.unchanged,
      skipped: report.summary.errors,
    };
    if (salaries.length === 0) {
      return { importId: null, ...counts };
    }

    const { importId } = await this.updates.apply({
      fileName,
      fileSha256: createHash('sha256').update(csv).digest('hex'),
      uploadedById: userId,
      rowCount: report.summary.rows,
      unchangedCount: counts.unchanged,
      skippedCount: counts.skipped,
      salaries,
    });
    return { importId, ...counts };
  }

  /** Reads the file and the people it names, and checks every row. The one check, for the preview and for applying. */
  private async analyse(csv: string): Promise<{
    report: SalaryUpdateReport;
    targets: Map<string, SalaryTarget>;
  }> {
    const none = new Map<string, SalaryTarget>();
    let file;
    try {
      file = readSalaryUpdateFile(parseCsv(csv));
    } catch (error) {
      if (error instanceof CsvError) {
        return { report: problemReport([error.message]), targets: none };
      }
      throw error;
    }
    if (file.problems.length > 0) {
      return { report: checkSalaryUpdate(file, none), targets: none };
    }

    // Each row is judged against the salary in force on its own date, so the lookup is told
    // the date. A row without a usable date is an error anyway; it is looked up for today.
    const today = new Date().toISOString().slice(0, 10);
    const found = await this.employees.findSalaryTargets(
      file.entries
        .filter((e) => e.amount !== '' || e.date !== '' || e.reason !== '')
        .filter((e) => e.employeeCode !== '')
        .map((e) => ({
          code: e.employeeCode,
          date: isRealIsoDate(e.date) ? e.date : today,
        })),
    );
    const targets = new Map(
      found.map((row) => [row.employeeCode.toUpperCase(), toTarget(row)]),
    );
    return { report: checkSalaryUpdate(file, targets), targets };
  }
}

function toTarget(row: SalaryTargetRow): SalaryTarget {
  return {
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    status: row.status,
    joiningDate: row.joiningDate,
    countryCurrencyCode: row.countryCurrencyCode,
    earliestCurrencyCode: row.earliestCurrency,
    salaryRecordCount: row.salaryRecordCount,
    current:
      row.currentAmount === null ||
      row.currentCurrency === null ||
      row.currentEffectiveFrom === null
        ? null
        : {
            annualAmount: row.currentAmount,
            currencyCode: row.currentCurrency,
            effectiveFrom: row.currentEffectiveFrom,
          },
  };
}
