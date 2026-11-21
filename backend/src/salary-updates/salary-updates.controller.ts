import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import {
  type SalaryUpdateReportResponse,
  salaryUpdateFileSchema,
  salaryUpdateReportSchema,
} from './salary-updates.schemas.js';
import { SalaryUpdatesService } from './salary-updates.service.js';

@ApiTags('Salary updates')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'The access token is missing, invalid or expired.',
})
@ApiForbiddenResponse({ description: 'The user is not an HR admin.' })
@Roles('HR_ADMIN')
@Controller('salary-updates')
export class SalaryUpdatesController {
  constructor(private readonly salaryUpdates: SalaryUpdatesService) {}

  @Get('template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="salary-update-template.csv"',
  )
  @ApiOperation({
    summary: 'Download the template for a bulk salary update',
    description:
      'A CSV of everyone who can still be given a salary (not those who have left), with their current salary, and three empty columns to fill in for the people getting a change: `New annual salary`, `Effective from` (YYYY-MM-DD) and `Reason`. Rows left empty are ignored.',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'The CSV file.', schema: { type: 'string' } })
  template(): Promise<string> {
    return this.salaryUpdates.template();
  }

  // 200 and not 201: a preview creates nothing.
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check a bulk salary update file without saving anything',
    description:
      'Send the CSV as the request body with the content type `text/csv`. Every row that asks for a change is checked against the person it names, with the same rules as a single salary change (nobody who has left, not before the joining date, `HIRE` only for a first salary) plus the format of the amount, date and reason, and duplicate Employee IDs. The answer lists each row as `WILL_UPDATE`, `UNCHANGED` or `ERROR` with every problem found, warnings about unusually large raises or decreases, and a summary. A file that cannot be read at all (a missing column, too many rows) comes back with `fileProblems` and no rows. Nothing is saved.',
  })
  @ApiConsumes('text/csv')
  @ApiBody({ schema: { type: 'string' }, description: 'The CSV file.' })
  @ApiOkResponse({
    standardSchema: salaryUpdateReportSchema,
    description: 'What would happen, row by row.',
  })
  @ApiBadRequestResponse({
    description: 'The body is empty, too large, or not sent as `text/csv`.',
  })
  preview(
    @Body({ schema: salaryUpdateFileSchema }) csv: string,
  ): Promise<SalaryUpdateReportResponse> {
    return this.salaryUpdates.preview(csv);
  }
}
