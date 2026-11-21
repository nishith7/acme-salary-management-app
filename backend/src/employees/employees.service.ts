import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EmployeeRow, SalaryHistoryRow } from './employees.repository.js';
import { EmployeesRepository } from './employees.repository.js';
import type {
  EmployeeExportQuery,
  EmployeeListItem,
  EmployeeListResponse,
  EmployeeProfile,
  EmployeeQuery,
  FilterOptionsResponse,
  SalaryChangeRequest,
  SalaryHistoryEntry,
} from './employees.schemas.js';
import { toEmployeesCsv } from './employees-csv.js';
import { checkSalaryChange } from './salary-change.rules.js';

@Injectable()
export class EmployeesService {
  constructor(private readonly employees: EmployeesRepository) {}

  /** What the directory's country and department filters can be set to. */
  async filterOptions(): Promise<FilterOptionsResponse> {
    const { countries, departments } = await this.employees.filterOptions();
    return {
      countries,
      departments: departments.map((department) => department.name),
    };
  }

  /** Everyone who matches the filters, as a CSV file: the directory as the user is looking at it. */
  async exportCsv(query: EmployeeExportQuery): Promise<string> {
    return toEmployeesCsv(await this.employees.listAll(query, new Date()));
  }

  /** One employee as the directory shows them, plus the whole salary history. */
  async get(id: string): Promise<EmployeeProfile> {
    const today = new Date();
    const [row, history] = await Promise.all([
      this.employees.findById(id, today),
      this.employees.salaryHistory(id, today),
    ]);
    if (!row) {
      throw new NotFoundException('Employee not found');
    }
    return { ...toListItem(row), salaryHistory: history.map(toHistoryEntry) };
  }

  /**
   * Appends a salary to the employee's history, as the signed-in user, and returns the
   * updated profile. The currency is not asked for: it is the one in force on the effective
   * date, or the country's currency for a first salary, so a salary is never recorded in a
   * currency the person is not paid in.
   */
  async recordSalaryChange(
    employeeId: string,
    request: SalaryChangeRequest,
    userId: string,
  ): Promise<EmployeeProfile> {
    const context = await this.employees.findSalaryContext(employeeId);
    if (!context) {
      throw new NotFoundException('Employee not found');
    }
    const problem = checkSalaryChange(
      {
        status: context.status,
        joiningDate: context.joiningDate,
        hasSalary: context.salaryRecordCount > 0,
      },
      request,
    );
    if (problem) {
      throw problem.kind === 'conflict'
        ? new ConflictException(problem.message)
        : new BadRequestException(problem.message);
    }

    const currencyCode =
      (await this.employees.currencyInForceOn(
        employeeId,
        request.effectiveFrom,
      )) ?? context.countryCurrencyCode;
    await this.employees.addSalaryRecord({
      employeeId,
      annualAmount: request.annualAmount,
      currencyCode,
      effectiveFrom: request.effectiveFrom,
      reason: request.reason,
      changedById: userId,
    });
    return this.get(employeeId);
  }

  /** One page of the directory, with the current salary as of today. */
  async list(query: EmployeeQuery): Promise<EmployeeListResponse> {
    const { rows, total } = await this.employees.list(query, new Date());
    return {
      items: rows.map(toListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}

function toListItem(row: EmployeeRow): EmployeeListItem {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    jobTitle: row.jobTitle,
    level: row.level,
    department: row.department,
    country: { code: row.countryCode, name: row.countryName },
    joiningDate: row.joiningDate,
    status: row.status,
    terminatedOn: row.terminatedOn,
    tenureBand: row.tenureBand,
    currentSalary:
      row.annualAmount === null || row.currencyCode === null
        ? null
        : {
            annualAmount: row.annualAmount,
            currencyCode: row.currencyCode,
            annualAmountUsd: row.annualAmountUsd,
          },
    bandPosition: row.bandPosition,
  };
}

function toHistoryEntry(row: SalaryHistoryRow): SalaryHistoryEntry {
  return {
    id: row.id,
    annualAmount: row.annualAmount,
    currencyCode: row.currencyCode,
    effectiveFrom: row.effectiveFrom,
    reason: row.reason,
    changedBy: row.changedByName,
    previous:
      row.previousAmount === null || row.previousCurrencyCode === null
        ? null
        : {
            annualAmount: row.previousAmount,
            currencyCode: row.previousCurrencyCode,
          },
    changePercent: row.changePercent,
    state: row.state,
  };
}
