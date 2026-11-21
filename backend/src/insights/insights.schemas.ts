import { z } from 'zod';

/**
 * Request and response shapes for pay insights. Each schema is the one source for validation,
 * TypeScript types and the Swagger document.
 */

export const PAY_GROUPINGS = ['country', 'department', 'level'] as const;

/** A filter: at least one value, and a person matches if they match ANY of them. */
const anyOf = <T extends z.ZodType>(value: T, what: string) =>
  z
    .array(value)
    .min(1)
    .max(100)
    .optional()
    .describe(`${what} Several values match any of them.`);

export const payQuerySchema = z
  .object({
    groupBy: z
      .enum(PAY_GROUPINGS)
      .default('country')
      .describe('What to compare: countries, departments or levels.'),
    countries: anyOf(
      z
        .string()
        .length(2)
        .transform((code) => code.toUpperCase()),
      'Only people in these countries (ISO 3166-1 alpha-2 codes, for example `IN`).',
    ),
    departments: anyOf(
      z.string().min(1).max(100),
      'Only people in these departments (names).',
    ),
    levels: anyOf(z.int().min(1), 'Only people at these levels.'),
  })
  .meta({
    example: {
      groupBy: 'level',
      countries: ['IN', 'US'],
      departments: ['Engineering'],
    },
  });
export type PayQuery = z.output<typeof payQuerySchema>;

const figuresShape = {
  headcount: z.int().describe('How many people the figures are about.'),
  p25Usd: z
    .string()
    .describe(
      'A quarter of them are paid this much or less, in US dollars a year. A decimal string.',
    ),
  medianUsd: z
    .string()
    .describe(
      'Half of them are paid this much or less (halfway between the two middle people when the number is even), in US dollars a year.',
    ),
  p75Usd: z
    .string()
    .describe(
      'Three quarters of them are paid this much or less, in US dollars a year.',
    ),
  totalAnnualUsd: z
    .string()
    .describe(
      'The sum of their annual salaries, in US dollars: what they cost a year.',
    ),
};

export const payInsightsResponseSchema = z.object({
  groupBy: z.enum(PAY_GROUPINGS),
  asOf: z
    .string()
    .describe(
      'YYYY-MM-DD: the day "current salary" and the exchange rates refer to.',
    ),
  currency: z.literal('USD'),
  minimumGroupSize: z
    .int()
    .describe(
      'A group of fewer people than this is never shown, so that nobody can be picked out from a figure.',
    ),
  overall: z
    .object(figuresShape)
    .nullable()
    .describe(
      'The figures for everyone who matches the filters together; null when that is fewer than `minimumGroupSize` people.',
    ),
  groups: z
    .array(
      z.object({
        key: z
          .string()
          .describe('A country code, a department name, or a level number.'),
        label: z.string(),
        ...figuresShape,
      }),
    )
    .describe(
      'The groups big enough to show: countries and departments by name, levels by number.',
    ),
  hiddenGroups: z
    .int()
    .describe(
      'Groups left out because they have fewer than `minimumGroupSize` people.',
    ),
  excluded: z
    .int()
    .describe(
      'Current employees who match but are left out of every figure: they have no salary yet, or no exchange rate for its currency.',
    ),
});
export type PayInsightsResponse = z.infer<typeof payInsightsResponseSchema>;
