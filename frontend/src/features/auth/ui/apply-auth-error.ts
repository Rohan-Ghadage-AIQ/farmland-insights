import { userMessage, type ApiError, type MessageContext } from '@/api';

/** Sets one form field's error message (adapts react-hook-form's `setError`). */
export type FormErrorSetter = (field: string, message: string) => void;

export interface ApplyAuthErrorResult {
  /** Non-null when the error should be shown as an inline banner, not (only) on a field. */
  readonly bannerMessage: string | null;
}

/**
 * Routes an auth `ApiError` to form fields where the contract gives us a field to point at (422
 * `loc`, PropelAuth `field_to_errors` on a 400, a 404 "User not found." on email), and falls back
 * to a banner message for everything else (429, 5xx, network, timeout, an already-expired
 * session). `fields` is the set of field names the calling form actually has.
 */
export function applyAuthFormError(
  error: ApiError,
  setError: FormErrorSetter,
  fields: readonly string[],
  context: MessageContext = {},
): ApplyAuthErrorResult {
  if (error.kind === 'validation' || error.kind === 'domain') {
    const matched = Object.entries(error.fieldErrors).filter(([field]) => fields.includes(field));
    for (const [field, message] of matched) setError(field, message);
    return { bannerMessage: matched.length > 0 ? null : userMessage(error, context) };
  }

  if (error.kind === 'notFound' && fields.includes('email')) {
    setError('email', error.detail === '' ? 'User not found.' : error.detail);
    return { bannerMessage: null };
  }

  return { bannerMessage: userMessage(error, context) };
}
