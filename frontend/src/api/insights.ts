import type { ApiClient } from './client.ts';

// Shapes of the pay insights, written by hand from
// backend/src/insights/insights.schemas.ts. Keep the two in step.

export const PAY_GROUPINGS = ['country', 'department', 'level'] as const;
export type PayGrouping = (typeof PAY_GROUPINGS)[number];

/**
 * The body of `QUERY /insights/pay`. A filter that is present must have at least one value,
 * so leave it out instead of sending an empty list.
 */
export interface PayQuery {
  groupBy?: PayGrouping;
  countries?: string[];
  departments?: string[];
  levels?: number[];
}

/** Pay figures for some people, in US dollars a year, as decimal strings. */
export interface PayFigures {
  headcount: number;
  p25Usd: string;
  medianUsd: string;
  p75Usd: string;
  /** The sum of their annual salaries: what they cost a year. */
  totalAnnualUsd: string;
}

export interface PayGroup extends PayFigures {
  /** A country code, a department name, or a level number. */
  key: string;
  label: string;
}

export interface PayInsights {
  groupBy: PayGrouping;
  /** YYYY-MM-DD: the day "current salary" and the exchange rates refer to. */
  asOf: string;
  currency: 'USD';
  /** A group with fewer people than this is never shown. */
  minimumGroupSize: number;
  /** Everyone who matches together; null when that is fewer than `minimumGroupSize`. */
  overall: PayFigures | null;
  groups: PayGroup[];
  /** Groups left out because they were too small to show safely. */
  hiddenGroups: number;
  /** Current employees left out of every figure: no salary, or no exchange rate. */
  excluded: number;
}

export function createInsightsApi(client: ApiClient) {
  return {
    /**
     * How current employees are paid, grouped by country, department or level. Uses the
     * HTTP QUERY method like the directory: a read-only request with its filters in a body.
     */
    async pay(query: PayQuery, signal?: AbortSignal): Promise<PayInsights> {
      const { data } = await client.http.request<PayInsights>({
        method: 'QUERY',
        url: '/insights/pay',
        data: query,
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      return data;
    },
  };
}
