import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SalaryChangeRequest } from '../../api/employees.ts';
import { employeesApi } from '../../api/index.ts';

/**
 * Saves a new salary for one employee. The API answers with the updated profile, which goes
 * straight into the cache, so the panel shows the new history at once; the directory's pages
 * (their salary columns are now out of date) are marked stale and reloaded. Other people's
 * profiles are not affected, so those are left alone.
 */
export function useRecordSalaryChange(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SalaryChangeRequest) =>
      employeesApi.addSalaryChange(employeeId, request),
    onSuccess: (profile) => {
      queryClient.setQueryData(['employees', 'profile', employeeId], profile);
      void queryClient.invalidateQueries({
        queryKey: ['employees'],
        predicate: (query) => query.queryKey[1] !== 'profile',
      });
    },
  });
}
