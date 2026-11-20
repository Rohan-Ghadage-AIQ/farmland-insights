import { describe, expect, it, vi } from 'vitest';
import { authError, type ApiError, type ApiErrorFields } from '@/api';
import { applyAuthFormError } from './apply-auth-error';

/** Builds a minimal ApiError for a given set of fields, without going through parseApiError. */
function fakeError(fields: ApiErrorFields): ApiError {
  return Object.assign(new Error('test error'), { name: 'ApiError' }, fields);
}

describe('applyAuthFormError', () => {
  const fields = ['email', 'password'] as const;

  it('sets a field error for each matching 422 field and reports no banner', () => {
    const error = fakeError({
      kind: 'validation',
      status: 422,
      issues: [],
      fieldErrors: { email: 'Not a valid email address.' },
    });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, fields);

    expect(setError).toHaveBeenCalledWith('email', 'Not a valid email address.');
    expect(result.bannerMessage).toBeNull();
  });

  it('falls back to a banner when a 422 has no field-matching errors', () => {
    const error = fakeError({ kind: 'validation', status: 422, issues: [], fieldErrors: {} });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, fields);

    expect(setError).not.toHaveBeenCalled();
    expect(result.bannerMessage).toMatch(/check the highlighted fields/i);
  });

  it('maps a 400 PropelAuth field_to_errors entry onto the matching field', () => {
    const error = fakeError({
      kind: 'domain',
      status: 400,
      detail: 'Email already in use',
      details: {},
      fieldErrors: { email: 'Email already in use' },
    });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, fields);

    expect(setError).toHaveBeenCalledWith('email', 'Email already in use');
    expect(result.bannerMessage).toBeNull();
  });

  it('shows a 400 with no field errors as an inline banner', () => {
    const error = fakeError({
      kind: 'domain',
      status: 400,
      detail: 'That request could not be processed.',
      details: {},
      fieldErrors: {},
    });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, fields);

    expect(setError).not.toHaveBeenCalled();
    expect(result.bannerMessage).toBe('That request could not be processed.');
  });

  it('maps a 404 "User not found." onto the email field', () => {
    const error = fakeError({ kind: 'notFound', status: 404, detail: 'User not found.' });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, fields);

    expect(setError).toHaveBeenCalledWith('email', 'User not found.');
    expect(result.bannerMessage).toBeNull();
  });

  it('shows 404 as a banner when the form has no email field', () => {
    const error = fakeError({ kind: 'notFound', status: 404, detail: 'User not found.' });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, []);

    expect(setError).not.toHaveBeenCalled();
    expect(result.bannerMessage).not.toBeNull();
  });

  it('shows the 429 copy as a banner', () => {
    const error = fakeError({
      kind: 'rateLimited',
      status: 429,
      detail: '',
      retryAfterSeconds: 30,
    });
    const setError = vi.fn();

    const result = applyAuthFormError(error, setError, fields);

    expect(setError).not.toHaveBeenCalled();
    expect(result.bannerMessage).toMatch(/too many requests.*30 seconds/i);
  });

  it('shows a plain banner for an auth (session expired) error', () => {
    const setError = vi.fn();
    const result = applyAuthFormError(authError(), setError, fields);
    expect(setError).not.toHaveBeenCalled();
    expect(result.bannerMessage).toMatch(/session expired/i);
  });
});
