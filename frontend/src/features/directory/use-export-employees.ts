import { useMutation } from '@tanstack/react-query';
import type { EmployeeExportQuery } from '../../api/employees.ts';
import { employeesApi } from '../../api/index.ts';
import { saveBlob } from '../../lib/save-file.ts';
import { localIsoDate } from './salary-change-form.ts';

/** "employees-2026-11-21.csv": the day it was exported, on the user's own clock. */
export function exportFilename(now: Date): string {
  return `employees-${localIsoDate(now)}.csv`;
}

/**
 * Downloads everyone who matches the filters as a CSV file. Not a query: nothing is cached,
 * and each press fetches the directory afresh, so the file is as current as the screen.
 */
export function useExportEmployees() {
  return useMutation({
    mutationFn: (query: EmployeeExportQuery) => employeesApi.exportCsv(query),
    onSuccess: (file) => saveBlob(file, exportFilename(new Date())),
  });
}
