import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { insightsApi } from '../../api/index.ts';
import { toGenderGapQuery, type PayChoices } from './pay-query.ts';

/**
 * The gender pay gap for the chosen filters. Like the pay figures, it keeps the previous answer
 * on screen while a new choice loads.
 */
export function useGenderGap(choices: PayChoices) {
  const query = toGenderGapQuery(choices);
  return useQuery({
    queryKey: ['insights', 'gender-gap', query],
    queryFn: ({ signal }) => insightsApi.genderGap(query, signal),
    placeholderData: keepPreviousData,
  });
}
