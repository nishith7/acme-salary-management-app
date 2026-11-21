import { useMutation } from '@tanstack/react-query';
import { salaryUpdatesApi } from '../../api/index.ts';
import { saveBlob } from '../../lib/save-file.ts';

/**
 * Checks a file's text and says what would happen. A mutation and not a query: it is a
 * request the person makes with a file they chose, nothing to cache or refetch, and it saves
 * nothing on the server.
 */
export function usePreviewSalaryUpdate() {
  return useMutation({
    mutationFn: (csv: string) => salaryUpdatesApi.preview(csv),
  });
}

/** Downloads the CSV to fill in. */
export function useDownloadSalaryTemplate() {
  return useMutation({
    mutationFn: () => salaryUpdatesApi.template(),
    onSuccess: (file) => saveBlob(file, 'salary-update-template.csv'),
  });
}
