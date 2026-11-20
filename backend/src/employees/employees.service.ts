import { Injectable } from '@nestjs/common';
import type { EmployeeRow } from './employees.repository.js';
import { EmployeesRepository } from './employees.repository.js';
import type {
  EmployeeListItem,
  EmployeeListResponse,
  EmployeeQuery,
} from './employees.schemas.js';

@Injectable()
export class EmployeesService {
  constructor(private readonly employees: EmployeesRepository) {}

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
