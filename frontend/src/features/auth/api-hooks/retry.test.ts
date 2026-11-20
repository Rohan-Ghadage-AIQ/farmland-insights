import { describe, expect, it } from 'vitest';
import {
  abortedError,
  authError,
  networkError,
  timeoutError,
  unknownError,
  parseApiError,
} from '@/api';
import { shouldRetryQuery } from './retry';

async function errorWithStatus(status: number) {
  return parseApiError(new Response('{}', { status }));
}

describe('shouldRetryQuery', () => {
  it.each([
    ['network', networkError()],
    ['timeout', timeoutError(1000)],
  ])('retries a transient %s failure once', (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });

  it('retries a 5xx once', async () => {
    const error = await errorWithStatus(503);

    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });

  it.each([400, 404, 422, 429])('never retries a %i, which a retry cannot fix', async (status) => {
    expect(shouldRetryQuery(0, await errorWithStatus(status))).toBe(false);
  });

  it('never retries an auth failure (the session is already cleared)', () => {
    expect(shouldRetryQuery(0, authError())).toBe(false);
  });

  it('never retries a cancellation or an unreadable response', () => {
    expect(shouldRetryQuery(0, abortedError())).toBe(false);
    expect(shouldRetryQuery(0, unknownError('bad body', 200))).toBe(false);
  });

  it('does not retry things that are not ApiErrors (programming errors)', () => {
    expect(shouldRetryQuery(0, new Error('boom'))).toBe(false);
  });
});
