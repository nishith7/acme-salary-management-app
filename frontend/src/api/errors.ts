import axios from 'axios';

/**
 * What every failed API call throws, so screens never see an axios error.
 * `status` is the HTTP status, or 0 when there was no answer at all (network
 * down, timeout) or the failure was not an HTTP one.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The API's error body is `{ statusCode, message }`; `message` is a list for validation errors. */
function messageFrom(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const { message } = data;
    if (typeof message === 'string' && message !== '') {
      return message;
    }
    if (Array.isArray(message)) {
      const parts = message.filter((m): m is string => typeof m === 'string');
      if (parts.length > 0) {
        return parts.join('; ');
      }
    }
  }
  return `The request failed (HTTP ${status}).`;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return new ApiError(
        error.response.status,
        messageFrom(error.response.data, error.response.status),
        { cause: error },
      );
    }
    return new ApiError(
      0,
      'Could not reach the server. Check your connection and try again.',
      { cause: error },
    );
  }
  return new ApiError(
    0,
    error instanceof Error ? error.message : 'Something went wrong.',
    { cause: error },
  );
}
