import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/index.ts';

/**
 * Retry a failed query twice, but never when the server understood the request and said
 * no (a 4xx): asking again gets the same answer, and a 401 here already went through the
 * API client's one silent refresh. Network errors and 5xx may be temporary, so those retry.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
