import { useQuery } from '@tanstack/react-query';
import { employeesApi } from '../../api/index.ts';

/**
 * One employee with their salary history. The key starts with "employees", so a change to
 * the directory's data drops this too, and so does ending a session.
 */
export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employees', 'profile', id],
    queryFn: ({ signal }) => employeesApi.get(id, signal),
  });
}
