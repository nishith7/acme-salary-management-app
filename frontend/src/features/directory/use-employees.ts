import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { employeesApi } from '../../api/index.ts';
import type { EmployeeQuery } from '../../api/employees.ts';

/**
 * One page of the directory for the given paging, sorting and (later) filters. The key
 * starts with "employees", so everything cached for the directory can be dropped together.
 * While the next page loads the previous one stays on screen, so paging does not flash.
 */
export function useEmployees(query: EmployeeQuery) {
  return useQuery({
    queryKey: ['employees', query],
    queryFn: ({ signal }) => employeesApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}
