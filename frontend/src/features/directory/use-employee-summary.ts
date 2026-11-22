import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { EmployeeSummaryQuery } from '../../api/employees.ts';
import { employeesApi } from '../../api/index.ts';

/**
 * The summary cards for the given filters. The key starts with "employees", so a salary change
 * or a bulk update, which refresh everything cached for the directory, refresh the cards too
 * and they never show last minute's total. While new filters load the previous figures stay on
 * screen (dimmed by the cards), so choosing a filter does not flash empty boxes.
 */
export function useEmployeeSummary(query: EmployeeSummaryQuery) {
  return useQuery({
    queryKey: ['employees', 'summary', query],
    queryFn: ({ signal }) => employeesApi.summary(query, signal),
    placeholderData: keepPreviousData,
  });
}
