import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { insightsApi } from '../../api/index.ts';
import { toPayQuery, type PayChoices } from './pay-query.ts';

/**
 * Pay figures for the chosen grouping and filters. The key starts with "insights", so ending
 * a session drops it with everything else. While a new choice loads, the previous figures
 * stay on screen, so switching between countries and departments does not flash empty.
 */
export function usePayInsights(choices: PayChoices) {
  const query = toPayQuery(choices);
  return useQuery({
    queryKey: ['insights', 'pay', query],
    queryFn: ({ signal }) => insightsApi.pay(query, signal),
    placeholderData: keepPreviousData,
  });
}
