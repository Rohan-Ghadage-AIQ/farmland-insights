/**
 * The one error model for everything that talks to the backend (API_CONTRACT section 2).
 *
 * `ApiError` is an `Error` carrying a `kind` discriminant, so components narrow with
 * `switch (error.kind)` and never read raw response bodies. `parseApiError` is the one
 * place that turns a failed `Response` into an `ApiError`; it never throws, whatever the
 * body looks like.
 */

export type ErrorLoc = readonly (string | number)[];

export interface ValidationIssue {
  /** FastAPI `loc` exactly as received, e.g. ["body","grid_size"]. */
  readonly loc: ErrorLoc;
  /** `loc` without the leading "body", dot-joined, e.g. "farm_geojson.features.0". */
  readonly path: string;
  /** Top-level form field the issue belongs to, when there is one. */
  readonly field: string | undefined;
  readonly message: string;
  readonly type: string;
}

export type ApiErrorFields =
  | {
      readonly kind: 'validation';
      readonly status: 422;
      readonly issues: readonly ValidationIssue[];
      /** First message per top-level field. */
      readonly fieldErrors: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'domain';
      readonly status: 400;
      readonly detail: string;
      /** Technical details. May hold upstream URLs or text: show only under "Technical details". */
      readonly details: Readonly<Record<string, unknown>>;
      /** Per-field messages from PropelAuth `field_to_errors` (auth endpoints). */
      readonly fieldErrors: Readonly<Record<string, string>>;
    }
  | { readonly kind: 'auth'; readonly status: 401 | 403; readonly detail: string }
  | { readonly kind: 'notFound'; readonly status: 404; readonly detail: string }
  | {
      readonly kind: 'rateLimited';
      readonly status: 429;
      readonly detail: string;
      readonly retryAfterSeconds: number | undefined;
    }
  | {
      readonly kind: 'server';
      readonly status: number;
      readonly detail: string;
      /** `error` field of the body, e.g. "internal_server_error". */
      readonly code: string | undefined;
    }
  | { readonly kind: 'network' }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'timeout'; readonly timeoutMs: number }
  | {
      readonly kind: 'unknown';
      readonly status: number | undefined;
      readonly detail: string;
    };

export type ApiErrorKind = ApiErrorFields['kind'];
export type ApiError = Error & ApiErrorFields;

function createApiError(fields: ApiErrorFields, message: string, cause?: unknown): ApiError {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  return Object.assign(error, { name: 'ApiError' }, fields);
}

export function isApiError(value: unknown): value is ApiError {
  return (
    value instanceof Error &&
    value.name === 'ApiError' &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

export function networkError(cause?: unknown): ApiError {
  return createApiError({ kind: 'network' }, 'Network request failed', cause);
}

export function abortedError(): ApiError {
  return createApiError({ kind: 'aborted' }, 'Request was aborted');
}

export function timeoutError(timeoutMs: number): ApiError {
  return createApiError({ kind: 'timeout', timeoutMs }, `Request timed out after ${timeoutMs} ms`);
}

/** For when the app knows locally that there is no valid session (no request was made). */
export function authError(status: 401 | 403 = 401): ApiError {
  return createApiError({ kind: 'auth', status, detail: '' }, 'Not authorised');
}

/**
 * The server answered, but not in a way this version of the app can use (for example it ignored a
 * field it does not know). Shown to the user as `detail`, so write it as plain advice.
 */
export function incompatibleServerError(detail: string): ApiError {
  return createApiError(
    { kind: 'domain', status: 400, detail, details: {}, fieldErrors: {} },
    detail,
  );
}

export function unknownError(detail: string, status?: number): ApiError {
  return createApiError({ kind: 'unknown', status, detail }, detail);
}

// ---------------------------------------------------------------------------------------------
// Body parsing (tolerant: every helper accepts `unknown` and returns a safe default)
// ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text === '' ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function firstMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value as unknown[]) {
      const found = firstMessage(entry);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isRecord(value) && typeof value.message === 'string') return value.message;
  return undefined;
}

function fieldErrorsFromObject(detail: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(detail)) {
    const message = firstMessage(value);
    if (message !== undefined) result[field] = message;
  }
  return result;
}

function detailString(body: unknown): string {
  return isRecord(body) && typeof body.detail === 'string' ? body.detail : '';
}

/** "body.farm_geojson.features.0" style paths: the leading "body" adds nothing for forms. */
export function locToFieldPath(loc: ErrorLoc): string {
  const rest = loc[0] === 'body' ? loc.slice(1) : loc;
  return rest.map(String).join('.');
}

function parseIssue(raw: unknown): ValidationIssue | undefined {
  if (!isRecord(raw)) return undefined;
  const { loc, msg, type } = raw;
  if (!Array.isArray(loc) || typeof msg !== 'string') return undefined;
  const parts = loc as unknown[];
  if (!parts.every((part) => typeof part === 'string' || typeof part === 'number')) {
    return undefined;
  }
  const typedLoc = parts;
  const path = locToFieldPath(typedLoc);
  const stripped = typedLoc[0] === 'body' ? typedLoc.slice(1) : typedLoc;
  const first = stripped[0];
  return {
    loc: typedLoc,
    path,
    field: first === undefined ? undefined : String(first),
    message: msg,
    type: typeof type === 'string' ? type : 'unknown',
  };
}

function parseValidation(body: unknown): ApiError {
  const rawIssues = isRecord(body) && Array.isArray(body.detail) ? body.detail : [];
  const issues = (rawIssues as unknown[])
    .map(parseIssue)
    .filter((issue): issue is ValidationIssue => issue !== undefined);
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.field !== undefined && !(issue.field in fieldErrors)) {
      fieldErrors[issue.field] = issue.message;
    }
  }
  return createApiError(
    { kind: 'validation', status: 422, issues, fieldErrors },
    'Request validation failed',
  );
}

function parseDomain(body: unknown): ApiError {
  const raw = isRecord(body) ? body.detail : undefined;
  let detail = '';
  let fieldErrors: Record<string, string> = {};
  if (typeof raw === 'string') {
    detail = raw;
  } else if (isRecord(raw)) {
    fieldErrors = fieldErrorsFromObject(raw);
    detail = Object.values(fieldErrors)[0] ?? '';
  }
  const rawDetails = isRecord(body) ? body.details : undefined;
  const details = isRecord(rawDetails) ? rawDetails : {};
  return createApiError(
    { kind: 'domain', status: 400, detail, details, fieldErrors },
    detail === '' ? 'Bad request' : detail,
  );
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;
}

/**
 * Turns a non-2xx `Response` into an `ApiError`. Classification is by status; the body only
 * refines it, and any body (empty, HTML, JSON of the wrong shape) is tolerated.
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  const body = await readBody(response);
  const { status } = response;

  if (status === 422) return parseValidation(body);
  if (status === 400) return parseDomain(body);

  const detail = detailString(body);
  if (status === 401 || status === 403) {
    return createApiError({ kind: 'auth', status, detail }, 'Not authorised');
  }
  if (status === 404) {
    return createApiError({ kind: 'notFound', status, detail }, 'Not found');
  }
  if (status === 429) {
    return createApiError(
      { kind: 'rateLimited', status, detail, retryAfterSeconds: parseRetryAfter(response) },
      'Rate limited',
    );
  }
  if (status >= 500) {
    const code = isRecord(body) && typeof body.error === 'string' ? body.error : undefined;
    return createApiError({ kind: 'server', status, detail, code }, `Server error ${status}`);
  }
  return createApiError(
    { kind: 'unknown', status, detail },
    `Unexpected response status ${status}`,
  );
}

// ---------------------------------------------------------------------------------------------
// User-facing copy
// ---------------------------------------------------------------------------------------------

export interface MessageContext {
  /** What the user was doing, so the copy can be specific. */
  readonly action?: 'analyze' | 'signIn' | 'register';
}

function waitCopy(seconds: number | undefined): string {
  if (seconds === undefined) return 'a moment';
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/**
 * Plain-language, actionable copy for an error. Raw server text is shown only where the
 * contract says it is safe and useful (400 `detail`); 5xx and unknown details never leak.
 */
export function userMessage(error: ApiError, context: MessageContext = {}): string {
  switch (error.kind) {
    case 'auth':
      return 'Your session expired. Please sign in again.';
    case 'network':
      return "Can't reach the server. Check your connection and try again.";
    case 'aborted':
      return context.action === 'analyze' ? 'Analysis cancelled.' : 'Request cancelled.';
    case 'timeout':
      return context.action === 'analyze'
        ? 'The analysis took too long. Try a smaller area or a larger grid size, then run it again.'
        : 'The request took too long. Please try again.';
    case 'domain':
      return error.detail === ''
        ? "We couldn't process that. Check what you entered and try again."
        : error.detail;
    case 'validation':
      return 'Some details need fixing. Check the highlighted fields and try again.';
    case 'notFound':
      return context.action === 'signIn'
        ? "There's no account with that email. Check the address or create an account."
        : "We couldn't find what you were looking for.";
    case 'rateLimited':
      return `Too many requests. Try again in ${waitCopy(error.retryAfterSeconds)}.`;
    case 'server':
      return 'Something went wrong on our side. Please try again in a moment.';
    case 'unknown':
      return 'Something unexpected happened. Please try again.';
  }
}
