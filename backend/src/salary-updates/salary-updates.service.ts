import { Injectable } from '@nestjs/common';
import { toEmployeesCsv } from '../employees/employees-csv.js';
import {
  EmployeesRepository,
  type SalaryTargetRow,
} from '../employees/employees.repository.js';
import { CsvError, parseCsv } from './csv-parse.js';
import {
  checkSalaryUpdate,
  problemReport,
  readSalaryUpdateFile,
  type SalaryTarget,
  type SalaryUpdateReport,
} from './salary-update.rules.js';

@Injectable()
export class SalaryUpdatesService {
  constructor(private readonly employees: EmployeesRepository) {}

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
    let file;
    try {
      file = readSalaryUpdateFile(parseCsv(csv));
    } catch (error) {
      if (error instanceof CsvError) {
        return problemReport([error.message]);
      }
      throw error;
    }
    if (file.problems.length > 0) {
      return checkSalaryUpdate(file, new Map());
    }

    const codes = new Set(
      file.entries
        .filter((e) => e.amount !== '' || e.date !== '' || e.reason !== '')
        .map((e) => e.employeeCode.toUpperCase())
        .filter((code) => code !== ''),
    );
    const found = await this.employees.findSalaryTargets(
      [...codes],
      new Date(),
    );
    return checkSalaryUpdate(
      file,
      new Map(
        found.map((row) => [row.employeeCode.toUpperCase(), toTarget(row)]),
      ),
    );
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
