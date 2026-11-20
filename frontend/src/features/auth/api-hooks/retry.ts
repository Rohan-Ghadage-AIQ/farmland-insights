import { isApiError } from '@/api';

/** A transient failure is worth exactly one more try. Everything else a retry cannot fix. */
const MAX_RETRIES = 1;

/** `retry` option for queries: retry network, timeout and 5xx once; never 4xx, auth or aborts. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES || !isApiError(error)) return false;
  return error.kind === 'network' || error.kind === 'timeout' || error.kind === 'server';
}
