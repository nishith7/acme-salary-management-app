import { Injectable, NotFoundException } from '@nestjs/common';
import type { EmployeeRow, SalaryHistoryRow } from './employees.repository.js';
import { EmployeesRepository } from './employees.repository.js';
import type {
  EmployeeListItem,
  EmployeeListResponse,
  EmployeeProfile,
  EmployeeQuery,
  FilterOptionsResponse,
  SalaryHistoryEntry,
} from './employees.schemas.js';

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
