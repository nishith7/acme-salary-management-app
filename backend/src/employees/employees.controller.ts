import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  QueryMethod,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  type EmployeeExportQuery,
  type EmployeeListResponse,
  type EmployeeProfile,
  type EmployeeQuery,
  type EmployeeSummary,
  type EmployeeSummaryQuery,
  employeeExportQuerySchema,
  employeeIdSchema,
  employeeListResponseSchema,
  employeeProfileSchema,
  employeeQuerySchema,
  employeeSummaryQuerySchema,
  employeeSummaryResponseSchema,
  type FilterOptionsResponse,
  filterOptionsResponseSchema,
  type SalaryChangeRequest,
  salaryChangeRequestSchema,
} from './employees.schemas.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('Employees')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'The access token is missing, invalid or expired.',
})
@ApiForbiddenResponse({ description: 'The user is not an HR admin.' })
@Roles('HR_ADMIN')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  // Declared before any `employees/:id` route added later, so "filter-options" is never read as an id.
  @Get('filter-options')
  @ApiOperation({
    summary: 'List the values the directory filters accept',
    description:
      'Every country (code and name) and every department, by name, for the dropdowns of the employee directory. Small reference data, so it is not paged.',
  })
  @ApiOkResponse({
    standardSchema: filterOptionsResponseSchema,
    description: 'The countries and departments, each ordered by name.',
  })
  filterOptions(): Promise<FilterOptionsResponse> {
    return this.employees.filterOptions();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one employee with their salary history',
    description:
      'The employee as the directory shows them (current salary in local currency and US dollars, pay band position) plus every salary they have been on, newest first. Each step carries the salary before it, the change as a percentage (not across a currency change), the reason, who recorded it and whether it is in force today, scheduled or replaced.',
  })
  @ApiOkResponse({
    standardSchema: employeeProfileSchema,
    description: 'The employee and their salary history.',
  })
  @ApiBadRequestResponse({ description: 'The id is not a UUID.' })
  @ApiNotFoundResponse({ description: 'There is no employee with this id.' })
  get(
    @Param('id', { schema: employeeIdSchema }) id: string,
  ): Promise<EmployeeProfile> {
    return this.employees.get(id);
  }

  // A download, so the browser can save it: the same filters as the list, in the same body,
  // but everyone who matches and not one page. QUERY like the list, for the same reason.
  @QueryMethod('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="employees.csv"')
  @ApiOperation({
    summary: 'Export employees as CSV',
    description:
      'Everyone who matches the filters (same body as the list, without paging), in the sort order, as a CSV file: employee, department, country, status, and the salary in force today in local currency and US dollars with the date it started and the pay band. Opens correctly in Excel (UTF-8 with a byte order mark; text that a spreadsheet could run as a formula is defused).',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'The CSV file.',
    schema: { type: 'string' },
  })
  @ApiBadRequestResponse({ description: 'The body is invalid.' })
  exportCsv(
    @Body({ schema: employeeExportQuerySchema }) query: EmployeeExportQuery,
  ): Promise<string> {
    return this.employees.exportCsv(query);
  }

  // The cards above the table: the list's filters in the same body (no paging, no sort), one
  // small answer. QUERY like the list, for the same reason.
  @QueryMethod('summary')
  @ApiOperation({
    summary: 'Summarise the employees who match the filters',
    description:
      'How many people match the filters (the same body as the list, without paging or sort), and the total, median and average annual salary in US dollars of the current employees among them, the same figures as the Pay insights page. People who have left, and people with no salary or exchange rate, are counted in `headcount` but not in the money. The money is null for fewer than 5 people (the privacy rule).',
  })
  @ApiOkResponse({
    standardSchema: employeeSummaryResponseSchema,
    description: 'The headcount and the money figures.',
  })
  @ApiBadRequestResponse({ description: 'The body is invalid.' })
  summary(
    @Body({ schema: employeeSummaryQuerySchema }) query: EmployeeSummaryQuery,
  ): Promise<EmployeeSummary> {
    return this.employees.summary(query);
  }

  @Post(':id/salary-changes')
  @ApiOperation({
    summary: 'Record a salary change',
    description:
      "Appends a new salary to the employee's history (nothing is edited or deleted; a mistake is fixed with a later `CORRECTION`), recorded as the signed-in user. The currency is the one in force on the effective date (a first salary uses the country's). A future date schedules the change. Returns the updated profile.",
  })
  @ApiCreatedResponse({
    standardSchema: employeeProfileSchema,
    description: 'The employee with the new salary in their history.',
  })
  @ApiBadRequestResponse({
    description:
      'The body or id is invalid, the date is before the joining date, or `HIRE` is used for a later change (or not used for the first salary).',
  })
  @ApiNotFoundResponse({ description: 'There is no employee with this id.' })
  @ApiConflictResponse({
    description: 'The employee has left, so no new salary can be recorded.',
  })
  recordSalaryChange(
    @Param('id', { schema: employeeIdSchema }) id: string,
    @Body({ schema: salaryChangeRequestSchema }) body: SalaryChangeRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmployeeProfile> {
    return this.employees.recordSalaryChange(id, body, user.id);
  }

  // The HTTP QUERY method: a safe, read-only request like GET, but the filters
  // travel in a JSON body, so there can be many of them and each can hold
  // several values without a long, hard-to-read URL.
  @QueryMethod()
  @ApiOperation({
    summary: 'List and search employees',
    description:
      'The employee directory, one page at a time. Uses the HTTP `QUERY` method: a safe, read-only request that carries its filters in a JSON body. Send `{}` for everyone. Different filters must all match; several values within one filter match any of them. Each employee comes with the salary in force today, in local currency and in US dollars, and where it sits against the salary band for their country and level.',
  })
  @ApiOkResponse({
    standardSchema: employeeListResponseSchema,
    description: 'One page of employees and the total across all pages.',
  })
  @ApiBadRequestResponse({
    description:
      'The body is invalid, for example an unknown status or a page size above 100.',
  })
  list(
    @Body({ schema: employeeQuerySchema }) query: EmployeeQuery,
  ): Promise<EmployeeListResponse> {
    return this.employees.list(query);
  }
}
