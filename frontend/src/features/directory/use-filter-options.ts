import { useQuery } from '@tanstack/react-query';
import { employeesApi } from '../../api/index.ts';

/**
 * The countries and departments the filter dropdowns offer. They change only when someone
 * edits reference data, so one load per visit is plenty. The key does not start with
 * "employees": reloading the directory after a change must not refetch these as well.
 */
export function useFilterOptions() {
  return useQuery({
    queryKey: ['employee-filter-options'],
    queryFn: ({ signal }) => employeesApi.filterOptions(signal),
    staleTime: 10 * 60 * 1000,
  });
}
