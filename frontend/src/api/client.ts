import type { z } from 'zod';
import { abortedError, networkError, parseApiError, timeoutError, unknownError } from './errors';

/**
 * The one `fetch` wrapper. It owns the base URL, the Bearer header, timeout and abort, JSON
 * parsing, Zod validation and `ApiError` mapping. Nothing here logs, and no error it throws
 * contains the token, the request body or the response body.
 */

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface ApiClientConfig {
  /** Prefix for every path. Relative (e.g. "/api/v1"): the backend has no CORS, so calls stay same-origin. */
  readonly baseUrl?: string;
  /** Read per request, so a renewed token is picked up straight away. */
  readonly getToken?: () => string | undefined;
  /** Called when an authenticated request gets 401/403 (the session is invalid). */
  readonly onAuthFailure?: () => void;
  readonly timeoutMs?: number;
}

export interface RequestConfig<S extends z.ZodType> {
  readonly method?: 'GET' | 'POST';
  /** Path under the base URL, starting with "/". */
  readonly path: string;
  readonly body?: unknown;
  readonly schema: S;
  /** Send the Bearer token. Defaults to true; public endpoints pass false. */
  readonly auth?: boolean;
  /** Caller cancellation (e.g. the Cancel button or TanStack Query's signal). */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface ApiClient {
  request<S extends z.ZodType>(config: RequestConfig<S>): Promise<z.output<S>>;
}

function buildUrl(baseUrl: string, path: string): URL {
  // Resolved against the page origin so the same relative URL works in the browser (via the
  // Vite proxy) and in Node-based tests, where fetch cannot resolve relative URLs.
  return new URL(baseUrl.replace(/\/+$/, '') + path, window.location.origin);
}

async function readJson(response: Response): Promise<unknown> {
  return JSON.parse(await response.text()) as unknown;
}

export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const { baseUrl = '', getToken, onAuthFailure, timeoutMs: defaultTimeout } = config;

  return {
    async request<S extends z.ZodType>({
      method = 'GET',
      path,
      body,
      schema,
      auth = true,
      signal,
      timeoutMs = defaultTimeout ?? DEFAULT_TIMEOUT_MS,
    }: RequestConfig<S>): Promise<z.output<S>> {
      if (signal?.aborted === true) throw abortedError();

      const token = auth ? getToken?.() : undefined;
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token !== undefined) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      const controller = new AbortController();
      const state = { timedOut: false };
      const timer = setTimeout(() => {
        state.timedOut = true;
        controller.abort();
      }, timeoutMs);
      const forwardAbort = (): void => {
        controller.abort();
      };
      signal?.addEventListener('abort', forwardAbort, { once: true });

      try {
        const response = await fetch(buildUrl(baseUrl, path), {
          method,
          headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await parseApiError(response);
          if (error.kind === 'auth' && token !== undefined) onAuthFailure?.();
          throw error;
        }

        let json: unknown;
        try {
          json = await readJson(response);
        } catch (error) {
          // An abort while reading the body must still surface as abort/timeout.
          if (controller.signal.aborted) throw error;
          throw unknownError('The server sent a response that could not be read.', response.status);
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw unknownError(
            'The server response was not in the expected format.',
            response.status,
          );
        }
        return parsed.data;
      } catch (error) {
        if (state.timedOut) throw timeoutError(timeoutMs);
        if (controller.signal.aborted) throw abortedError();
        if (error instanceof Error && error.name === 'ApiError') throw error;
        throw networkError(error);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}
