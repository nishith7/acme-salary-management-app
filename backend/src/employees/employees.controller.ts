import { Body, Controller, Get, Param, QueryMethod } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import {
  type EmployeeListResponse,
  type EmployeeProfile,
  type EmployeeQuery,
  employeeIdSchema,
  employeeListResponseSchema,
  employeeProfileSchema,
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
