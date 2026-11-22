import { z } from 'zod';
import { SalaryChangeReason } from '../generated/prisma/enums.js';
import { MAX_ROWS } from './salary-update.rules.js';

/**
 * The bulk salary update's request and response shapes. Each schema is the one source for
 * validation, TypeScript types and the Swagger document.
 */

/**
 * The file itself, sent as the request body with the type `text/csv`. Not a JSON field: the
 * browser reads the file as text and posts that, so there is no multipart upload to handle.
 */
export const salaryUpdateFileSchema = z
  .string()
  .min(1, 'The file is empty.')
  .max(
    6_000_000,
    'The file is too large: one update takes at most 20,000 rows (about 2.5 MB).',
  );

const changeSchema = z.object({
  annualAmount: z
    .string()
    .describe(
      'The new salary as typed in the file, trimmed. A decimal string.',
    ),
  currencyCode: z
    .string()
    .describe(
      'The currency the person is paid in (their current salary’s, or their country’s for a first salary). Never read from the file.',
    ),
  effectiveFrom: z.string().describe('YYYY-MM-DD'),
  reason: z.enum(SalaryChangeReason),
  previousAmount: z
    .string()
    .nullable()
    .describe('The salary in force today; null for a first salary.'),
  changePercent: z
    .string()
    .nullable()
    .describe(
      'The change as a percentage with one decimal, for example "8.1" or "-2.5". Null for a first salary.',
    ),
});

export const salaryUpdateRowSchema = z.object({
  line: z.int().describe('The line of the file the row starts on.'),
  employeeCode: z.string(),
  fullName: z
    .string()
    .nullable()
    .describe('Null when no employee has this Employee ID.'),
  outcome: z
    .enum(['WILL_UPDATE', 'UNCHANGED', 'ERROR'])
    .describe(
      '`WILL_UPDATE` would be applied, `UNCHANGED` is already the person’s salary, `ERROR` is refused.',
    ),
  errors: z.array(z.string()).describe('Every problem found in the row.'),
  warnings: z
    .array(z.string())
    .describe(
      'Things worth a second look in a row that will be applied, such as an unusually large raise.',
    ),
  change: changeSchema
    .nullable()
    .describe('What would be recorded; present only for `WILL_UPDATE`.'),
});
export type SalaryUpdateRowResponse = z.infer<typeof salaryUpdateRowSchema>;

export const salaryUpdateReportSchema = z.object({
  fileProblems: z
    .array(z.string())
    .describe(
      `What is wrong with the file as a whole (a missing column, more than ${MAX_ROWS.toLocaleString('en-US')} rows, an unclosed quote). When there are any, no row is checked.`,
    ),
  notices: z
    .array(z.string())
    .describe(
      'How the file was read, when it is worth knowing and stops nothing: for example that dates written day-month-year (01-05-2026) were read as such, with the date they became.',
    ),
  rows: z
    .array(salaryUpdateRowSchema)
    .describe(
      'One entry per row that asked for a change, in file order. A row with the salary, date and reason all empty is not a request and is only counted.',
    ),
  summary: z.object({
    rows: z.int().describe('Rows that asked for a change.'),
    willUpdate: z.int(),
    unchanged: z.int(),
    errors: z.int(),
    withWarnings: z
      .int()
      .describe('Rows that will be applied but carry a warning.'),
    notRequested: z
      .int()
      .describe('Rows left empty, so nobody asked for a change.'),
  }),
});
export type SalaryUpdateReportResponse = z.infer<
  typeof salaryUpdateReportSchema
>;

/** The query string of the apply endpoint. */
export const applyQuerySchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default('salary-update.csv')
    .describe(
      'The name of the file that was uploaded, kept with the import so it can be found later.',
    ),
});
export type ApplyQuery = z.output<typeof applyQuerySchema>;

export const salaryUpdateResultSchema = z.object({
  importId: z
    .uuid()
    .nullable()
    .describe(
      'The import that now holds the salaries added; null when nothing was added, in which case nothing was saved at all.',
    ),
  applied: z.int().describe('Salaries added.'),
  unchanged: z
    .int()
    .describe('Rows already at the salary asked for, so nothing was added.'),
  skipped: z
    .int()
    .describe('Rows refused because of an error, so nothing was added.'),
});
export type SalaryUpdateResultResponse = z.infer<
  typeof salaryUpdateResultSchema
>;
