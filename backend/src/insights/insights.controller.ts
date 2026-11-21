import { Body, Controller, QueryMethod } from '@nestjs/common';
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
  type PayInsightsResponse,
  type PayQuery,
  payInsightsResponseSchema,
  payQuerySchema,
} from './insights.schemas.js';
import { InsightsService } from './insights.service.js';

@ApiTags('Insights')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'The access token is missing, invalid or expired.',
})
@ApiForbiddenResponse({ description: 'The user is not an HR admin.' })
@Roles('HR_ADMIN')
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  // QUERY like the directory: a safe, read-only request whose filters travel in a JSON body.
  @QueryMethod('pay')
  @ApiOperation({
    summary: 'How current employees are paid, by country, department or level',
    description:
      'For current employees, in US dollars a year (each salary converted at the rate in force today): the median, the 25th and 75th percentiles, the headcount and the total cost of every group, and the same for everyone together. Send `{}` for countries; `groupBy` picks countries, departments or levels, and the filters narrow the people. Groups of fewer than 5 people are never shown (their number is reported as `hiddenGroups`), so no figure can single someone out. Employees with no salary, or no exchange rate for its currency, are left out and counted as `excluded`.',
  })
  @ApiOkResponse({
    standardSchema: payInsightsResponseSchema,
    description: 'The figures, group by group.',
  })
  @ApiBadRequestResponse({
    description: 'The body is invalid, for example an unknown `groupBy`.',
  })
  pay(
    @Body({ schema: payQuerySchema }) query: PayQuery,
  ): Promise<PayInsightsResponse> {
    return this.insights.pay(query);
  }
}
