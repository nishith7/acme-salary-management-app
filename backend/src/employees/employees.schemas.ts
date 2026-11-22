import { z } from 'zod';
import {
  EmployeeStatus,
  SalaryChangeReason,
} from '../generated/prisma/enums.js';

/**
 * Request and response shapes for the employee directory. Each schema is the
 * one source for validation, TypeScript types and the Swagger document.
 */

export const TENURE_BANDS = ['0-1', '1-3', '3-5', '5+'] as const;
export const BAND_POSITIONS = ['BELOW', 'WITHIN', 'ABOVE'] as const;
export const SORT_FIELDS = [
  'fullName',
  'employeeCode',
  'jobTitle',
  'level',
  'department',
  'country',
  'joiningDate',
  'salaryUsd',
] as const;

/** A filter: at least one value, and an employee matches if they match ANY of them. */
const anyOf = <T extends z.ZodType>(value: T, what: string) =>
  z
    .array(value)
    .min(1)
    .max(100)
    .optional()
    .describe(`${what} Several values match any of them.`);

export const employeeQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Matches part of the name or of the employee code, in any case. `%` and `_` are ordinary characters.',
      ),
    statuses: anyOf(z.enum(EmployeeStatus), 'Employment status.'),
    countries: anyOf(
      z
        .string()
        .length(2)
        .transform((code) => code.toUpperCase()),
      'Country codes (ISO 3166-1 alpha-2), for example `IN`.',
    ),
    departments: anyOf(z.string().min(1).max(100), 'Department names.'),
    jobTitles: anyOf(
      z.string().min(1).max(100),
      'Job titles, exactly as stored.',
    ),
    levels: anyOf(z.int().min(1), 'Levels; 1 is the most junior.'),
    tenureBands: anyOf(
      z.enum(TENURE_BANDS),
      'Whole years of service (up to the last day for someone who left): `0-1` is under 1 year, `1-3` is 1 to under 3, `3-5` is 3 to under 5, `5+` is 5 or more.',
    ),
    bandPositions: anyOf(
      z.enum(BAND_POSITIONS),
      'Where the current salary sits against the salary band for the person’s country and level. People with no band or no salary are left out when this is used.',
    ),
    sortBy: z
      .enum(SORT_FIELDS)
      .default('fullName')
      .describe(
        'The column to sort by. `salaryUsd` puts people with no salary last.',
      ),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    page: z.int().min(1).default(1).describe('The page number, starting at 1.'),
    pageSize: z
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe('Employees per page, at most 100.'),
  })
  .meta({
    // What Swagger pre-fills in "Try it out". Every filter is present so the
    // shape is visible; delete the ones you do not need, or send {} for everyone.
    example: {
      search: 'an',
      statuses: ['ACTIVE'],
      countries: ['IN', 'US'],
      departments: ['Engineering'],
      jobTitles: ['Senior Software Engineer'],
      levels: [3, 4],
      tenureBands: ['1-3', '3-5'],
      bandPositions: ['BELOW', 'WITHIN'],
      sortBy: 'joiningDate',
      sortOrder: 'desc',
      page: 1,
      pageSize: 25,
    },
  });
export type EmployeeQuery = z.output<typeof employeeQuerySchema>;

/** The export takes the same filters and sort as the list, but is never paged: it is everyone who matches. */
export const employeeExportQuerySchema = employeeQuerySchema
  .omit({ page: true, pageSize: true })
  .meta({
    example: {
      statuses: ['ACTIVE'],
      countries: ['IN', 'US'],
      departments: ['Engineering'],
      sortBy: 'fullName',
      sortOrder: 'asc',
    },
  });
export type EmployeeExportQuery = z.output<typeof employeeExportQuerySchema>;

export const employeeSchema = z.object({
  id: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  jobTitle: z.string(),
  level: z.int(),
  department: z.string(),
  country: z.object({ code: z.string(), name: z.string() }),
  joiningDate: z.string().describe('YYYY-MM-DD'),
  status: z.enum(EmployeeStatus),
  terminatedOn: z
    .string()
    .nullable()
    .describe('YYYY-MM-DD; null while the person is active.'),
  tenureBand: z.enum(TENURE_BANDS),
  currentSalary: z
    .object({
      annualAmount: z
        .string()
        .describe(
          'Annual gross, in `currencyCode`. A decimal string, never a float.',
        ),
      currencyCode: z.string(),
      annualAmountUsd: z
        .string()
        .nullable()
        .describe(
          'The same amount in US dollars; null if there is no exchange rate.',
        ),
    })
    .nullable()
    .describe(
      'The salary in force today; null if the person has no salary record.',
    ),
  bandPosition: z
    .enum(BAND_POSITIONS)
    .nullable()
    .describe(
      'Null when there is no salary or no band for the person’s country and level.',
    ),
});
export type EmployeeListItem = z.infer<typeof employeeSchema>;

export const salaryHistoryEntrySchema = z.object({
  id: z.uuid(),
  annualAmount: z
    .string()
    .describe(
      'Annual gross, in `currencyCode`. A decimal string, never a float.',
    ),
  currencyCode: z.string(),
  effectiveFrom: z.string().describe('YYYY-MM-DD'),
  reason: z
    .enum(SalaryChangeReason)
    .nullable()
    .describe(
      'Why it changed. Null for a salary loaded without a reason, for example from a spreadsheet.',
    ),
  changedBy: z
    .string()
    .nullable()
    .describe(
      'Name of the user who recorded it; null when the seed loaded it.',
    ),
  previous: z
    .object({ annualAmount: z.string(), currencyCode: z.string() })
    .nullable()
    .describe('The salary before this one in time; null for the first.'),
  changePercent: z
    .string()
    .nullable()
    .describe(
      'The change from `previous` as a percentage with one decimal, for example "8.1" or "-2.5". Null for the first salary, and when the currency changed (a percentage would mean nothing).',
    ),
  state: z
    .enum(['CURRENT', 'PAST', 'SCHEDULED'])
    .describe(
      '`CURRENT` is the salary in force today, `SCHEDULED` starts after today, `PAST` was replaced.',
    ),
});
export type SalaryHistoryEntry = z.infer<typeof salaryHistoryEntrySchema>;

export const employeeIdSchema = z.uuid();

export const salaryChangeRequestSchema = z
  .object({
    annualAmount: z
      .string()
      .regex(
        /^\d{1,12}(\.\d{1,2})?$/,
        'Use digits only, with a dot and at most two decimals, for example 52000 or 52000.50.',
      )
      .refine(
        (amount) => /[1-9]/.test(amount),
        'The amount must be above zero.',
      )
      .describe(
        'The new annual gross salary, as a decimal string (never a number, so no rounding), in the currency in force on the effective date.',
      ),
    effectiveFrom: z.iso
      .date()
      .describe(
        'The date it takes effect, YYYY-MM-DD. Not before the joining date; a future date schedules the change.',
      ),
    reason: z
      .enum(SalaryChangeReason)
      .describe(
        'Why it changed. `HIRE` is only for an employee with no salary yet; every later change is a promotion, merit increase, market adjustment or correction.',
      ),
  })
  .meta({
    example: {
      annualAmount: '52000.00',
      effectiveFrom: '2026-12-01',
      reason: 'MERIT',
    },
  });
export type SalaryChangeRequest = z.output<typeof salaryChangeRequestSchema>;

export const filterOptionsResponseSchema = z.object({
  countries: z
    .array(z.object({ code: z.string(), name: z.string() }))
    .describe('Every country, by name. Send `code` as a `countries` filter.'),
  departments: z
    .array(z.string())
    .describe('Every department, by name. Send it as a `departments` filter.'),
  levels: z
    .array(z.int())
    .describe(
      'The levels that exist, ascending. Send one as a `levels` filter.',
    ),
  jobTitles: z
    .array(z.string())
    .describe(
      'The job titles that exist, in order. Send one as a `jobTitles` filter, exactly as written.',
    ),
});
export type FilterOptionsResponse = z.infer<typeof filterOptionsResponseSchema>;

export const employeeProfileSchema = employeeSchema.extend({
  salaryHistory: z
    .array(salaryHistoryEntrySchema)
    .describe(
      'Every salary the employee has been on, newest first (the same order that picks the salary in force).',
    ),
});
export type EmployeeProfile = z.infer<typeof employeeProfileSchema>;

export const employeeListResponseSchema = z.object({
  items: z.array(employeeSchema),
  page: z.int(),
  pageSize: z.int(),
  total: z.int().describe('Employees matching the filters, across all pages.'),
});
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;
