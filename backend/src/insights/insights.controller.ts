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
  type GenderGapQuery,
  type GenderGapResponse,
  type PayInsightsResponse,
  type PayQuery,
  genderGapQuerySchema,
  genderGapResponseSchema,
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

  @QueryMethod('gender-gap')
  @ApiOperation({
    summary: 'The gender pay gap, level by level',
    description:
      "The median pay of women and of men at each level and overall, in US dollars a year, for current employees, and the gap between them: the women's median against the men's as a percentage of the men's (negative when women are paid less). The filters narrow the people, which is how to compare like with like (for example one country). A level is only compared when women and men each number at least 5, so no median can single someone out; the number of levels left out is `hiddenLevels`. People of another gender, and people with no salary or exchange rate, are not in the comparison and are counted as `otherGender` and `excluded`.",
  })
  @ApiOkResponse({
    standardSchema: genderGapResponseSchema,
    description: 'The medians and the gap, level by level.',
  })
  @ApiBadRequestResponse({ description: 'The body is invalid.' })
  genderGap(
    @Body({ schema: genderGapQuerySchema }) query: GenderGapQuery,
  ): Promise<GenderGapResponse> {
    return this.insights.genderGap(query);
  }
}
