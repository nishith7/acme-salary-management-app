import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
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
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  type ApplyQuery,
  applyQuerySchema,
  type SalaryUpdateReportResponse,
  type SalaryUpdateResultResponse,
  salaryUpdateFileSchema,
  salaryUpdateReportSchema,
  salaryUpdateResultSchema,
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
      'A CSV of everyone who can still be given a salary (not those who have left), with their current salary, and three empty columns to fill in for the people getting a change: `New annual salary`, `Effective from` (YYYY-MM-DD, or day-month-year such as 01-12-2026, as a spreadsheet saves it) and `Reason`. Rows left empty are ignored.',
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

  // 200 and not 201: an update that finds nothing to add creates nothing, and says so.
  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply a bulk salary update',
    description:
      "Send the same CSV that was previewed, as the request body with the content type `text/csv`. It is checked again, on the data as it is now, with exactly the preview's rules. Every row that passes is added to its person's salary history, all under one import and as the signed-in user; rows with errors are skipped, and a row already at the salary asked for adds nothing, so sending the same file again adds nothing the second time. Either all the salaries are added or none are. When nothing would be added, nothing is saved and `importId` is null. A file that cannot be read at all is refused with 400.",
  })
  @ApiConsumes('text/csv')
  @ApiBody({ schema: { type: 'string' }, description: 'The CSV file.' })
  @ApiOkResponse({
    standardSchema: salaryUpdateResultSchema,
    description: 'How many salaries were added, and how many rows were not.',
  })
  @ApiBadRequestResponse({
    description:
      'The body is empty, too large, not sent as `text/csv`, or a file that cannot be read (a missing column, too many rows).',
  })
  apply(
    @Body({ schema: salaryUpdateFileSchema }) csv: string,
    @Query({ schema: applyQuerySchema }) query: ApplyQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalaryUpdateResultResponse> {
    return this.salaryUpdates.apply(csv, query.fileName, user.id);
  }
}
