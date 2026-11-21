import { Body, Controller, Get, QueryMethod } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import {
  type EmployeeListResponse,
  type EmployeeQuery,
  employeeListResponseSchema,
  employeeQuerySchema,
  type FilterOptionsResponse,
  filterOptionsResponseSchema,
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
