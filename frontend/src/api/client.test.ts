import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { server } from '@/test/msw/server';
import { createApiClient } from './client';
import { isApiError, type ApiError } from './errors';

const okSchema = z.object({ value: z.number() });

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
}

describe('createApiClient', () => {
  describe('success path', () => {
    it('GETs a relative path, parses JSON and validates it with the schema', async () => {
      server.use(http.get('*/thing', () => HttpResponse.json({ value: 7 })));
      const client = createApiClient();

      const result = await client.request({ path: '/thing', schema: okSchema, auth: false });

      expect(result).toEqual({ value: 7 });
    });

    it('applies schema defaults and strips unknown fields', async () => {
      server.use(http.get('*/thing', () => HttpResponse.json({ extra: 1 })));
      const client = createApiClient();

      const result = await client.request({
        path: '/thing',
        schema: z.object({ value: z.number().default(3) }),
        auth: false,
      });

      expect(result).toEqual({ value: 3 });
    });

    it('prefixes the configured base URL', async () => {
      let seen = '';
      server.use(
        http.get('*/api/v1/thing', ({ request }) => {
          seen = new URL(request.url).pathname;
          return HttpResponse.json({ value: 1 });
        }),
      );
      const client = createApiClient({ baseUrl: '/api/v1/' });

      await client.request({ path: '/thing', schema: okSchema, auth: false });

      expect(seen).toBe('/api/v1/thing');
    });

    it('sends a JSON body with the right content type', async () => {
      let received: unknown;
      let contentType: string | null = null;
      server.use(
        http.post('*/echo', async ({ request }) => {
          received = await request.json();
          contentType = request.headers.get('content-type');
          return HttpResponse.json({ value: 2 });
        }),
      );
      const client = createApiClient();

      await client.request({
        method: 'POST',
        path: '/echo',
        body: { a: 1 },
        schema: okSchema,
        auth: false,
      });

      expect(received).toEqual({ a: 1 });
      expect(contentType).toMatch(/application\/json/);
    });
  });

  describe('Authorization header', () => {
    function captureAuth() {
      const seen: { header: string | null | undefined } = { header: undefined };
      server.use(
        http.get('*/secure', ({ request }) => {
          seen.header = request.headers.get('authorization');
          return HttpResponse.json({ value: 1 });
        }),
      );
      return seen;
    }

    it('sends the Bearer token from the session accessor by default', async () => {
      const seen = captureAuth();
      const client = createApiClient({ getToken: () => 'tok-123' });

      await client.request({ path: '/secure', schema: okSchema });

      expect(seen.header).toBe('Bearer tok-123');
    });

    it('reads the token per request, so a renewed token is used straight away', async () => {
      const seen = captureAuth();
      let token = 'old';
      const client = createApiClient({ getToken: () => token });

      token = 'new';
      await client.request({ path: '/secure', schema: okSchema });

      expect(seen.header).toBe('Bearer new');
    });

    it('omits the header when there is no token', async () => {
      const seen = captureAuth();
      const client = createApiClient({ getToken: () => undefined });

      await client.request({ path: '/secure', schema: okSchema });

      expect(seen.header).toBeNull();
    });

    it('omits the header for public endpoints (auth: false) even when signed in', async () => {
      const seen = captureAuth();
      const client = createApiClient({ getToken: () => 'tok-123' });

      await client.request({ path: '/secure', schema: okSchema, auth: false });

      expect(seen.header).toBeNull();
    });
  });

  describe('HTTP errors become ApiError', () => {
    it.each([
      [400, { error: 'bad_request', detail: 'bad polygon', details: {} }, 'domain'],
      [404, { detail: 'User not found.' }, 'notFound'],
      [422, { detail: [{ loc: ['body', 'x'], msg: 'm', type: 't' }] }, 'validation'],
      [429, { detail: 'slow down' }, 'rateLimited'],
      [500, { error: 'internal_server_error', detail: 'x' }, 'server'],
    ] as const)('maps %i to kind %s', async (status, body, kind) => {
      server.use(http.get('*/thing', () => HttpResponse.json(body, { status })));
      const client = createApiClient();

      const error = await failureOf(
        client.request({ path: '/thing', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe(kind);
    });

    it('survives a non-JSON error body', async () => {
      server.use(
        http.get('*/thing', () => new HttpResponse('<html>Bad Gateway</html>', { status: 502 })),
      );
      const client = createApiClient();

      const error = await failureOf(
        client.request({ path: '/thing', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe('server');
    });
  });

  describe('401 / 403 handling', () => {
    it.each([401, 403])(
      'calls onAuthFailure once for a %i on an authenticated request',
      async (status) => {
        server.use(http.get('*/secure', () => HttpResponse.json({ detail: 'no' }, { status })));
        const onAuthFailure = vi.fn();
        const client = createApiClient({ getToken: () => 'tok', onAuthFailure });

        const error = await failureOf(client.request({ path: '/secure', schema: okSchema }));

        expect(error.kind).toBe('auth');
        expect(onAuthFailure).toHaveBeenCalledTimes(1);
      },
    );

    it('does not treat a 401 from a public endpoint as an invalid session', async () => {
      server.use(http.post('*/login', () => HttpResponse.json({ detail: 'no' }, { status: 401 })));
      const onAuthFailure = vi.fn();
      const client = createApiClient({ getToken: () => 'tok', onAuthFailure });

      await failureOf(
        client.request({ method: 'POST', path: '/login', schema: okSchema, auth: false }),
      );

      expect(onAuthFailure).not.toHaveBeenCalled();
    });

    it('does not call onAuthFailure for other errors', async () => {
      server.use(http.get('*/secure', () => HttpResponse.json({ detail: 'x' }, { status: 400 })));
      const onAuthFailure = vi.fn();
      const client = createApiClient({ getToken: () => 'tok', onAuthFailure });

      await failureOf(client.request({ path: '/secure', schema: okSchema }));

      expect(onAuthFailure).not.toHaveBeenCalled();
    });
  });

  describe('transport failures', () => {
    it('maps a network failure to kind "network" and keeps the cause', async () => {
      server.use(http.get('*/thing', () => HttpResponse.error()));
      const client = createApiClient();

      const error = await failureOf(
        client.request({ path: '/thing', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe('network');
      expect(error.cause).toBeDefined();
    });

    it('maps a caller abort mid-request to kind "aborted"', async () => {
      server.use(
        http.get('*/slow', async () => {
          await delay(500);
          return HttpResponse.json({ value: 1 });
        }),
      );
      const client = createApiClient();
      const controller = new AbortController();

      const pending = failureOf(
        client.request({
          path: '/slow',
          schema: okSchema,
          auth: false,
          signal: controller.signal,
        }),
      );
      setTimeout(() => {
        controller.abort();
      }, 20);

      expect((await pending).kind).toBe('aborted');
    });

    it('does not send anything when the signal is already aborted', async () => {
      const hits = vi.fn();
      server.use(
        http.get('*/thing', () => {
          hits();
          return HttpResponse.json({ value: 1 });
        }),
      );
      const client = createApiClient();
      const controller = new AbortController();
      controller.abort();

      const error = await failureOf(
        client.request({
          path: '/thing',
          schema: okSchema,
          auth: false,
          signal: controller.signal,
        }),
      );

      expect(error.kind).toBe('aborted');
      expect(hits).not.toHaveBeenCalled();
    });

    it('maps a slow response to kind "timeout" with the limit', async () => {
      server.use(
        http.get('*/slow', async () => {
          await delay(500);
          return HttpResponse.json({ value: 1 });
        }),
      );
      const client = createApiClient({ timeoutMs: 30 });

      const error = await failureOf(
        client.request({ path: '/slow', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe('timeout');
      expect(error.kind === 'timeout' && error.timeoutMs).toBe(30);
    });

    it('lets a single request override the timeout', async () => {
      server.use(
        http.get('*/slow', async () => {
          await delay(60);
          return HttpResponse.json({ value: 1 });
        }),
      );
      const client = createApiClient({ timeoutMs: 20 });

      const result = await client.request({
        path: '/slow',
        schema: okSchema,
        auth: false,
        timeoutMs: 2000,
      });

      expect(result).toEqual({ value: 1 });
    });

    it('stops the timer after success so nothing fires later', async () => {
      server.use(http.get('*/thing', () => HttpResponse.json({ value: 1 })));
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      const client = createApiClient({ timeoutMs: 10_000 });

      await client.request({ path: '/thing', schema: okSchema, auth: false });

      expect(clear).toHaveBeenCalled();
    });

    it('stops listening to the caller signal after the request settles', async () => {
      server.use(http.get('*/thing', () => HttpResponse.json({ value: 1 })));
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const client = createApiClient();

      await client.request({
        path: '/thing',
        schema: okSchema,
        auth: false,
        signal: controller.signal,
      });

      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });

  describe('bad 2xx responses', () => {
    it('maps malformed JSON on a 200 to kind "unknown"', async () => {
      server.use(
        http.get(
          '*/thing',
          () =>
            new HttpResponse('{"value": ', {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      );
      const client = createApiClient();

      const error = await failureOf(
        client.request({ path: '/thing', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe('unknown');
      expect(error.kind === 'unknown' && error.status).toBe(200);
    });

    it('maps an empty 200 body to kind "unknown"', async () => {
      server.use(http.get('*/thing', () => new HttpResponse(null, { status: 200 })));
      const client = createApiClient();

      const error = await failureOf(
        client.request({ path: '/thing', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe('unknown');
    });

    it('maps a body that fails schema validation to kind "unknown" without echoing the body', async () => {
      server.use(http.get('*/thing', () => HttpResponse.json({ value: 'secret-value-123' })));
      const client = createApiClient();

      const error = await failureOf(
        client.request({ path: '/thing', schema: okSchema, auth: false }),
      );

      expect(error.kind).toBe('unknown');
      expect(error.message).not.toContain('secret-value-123');
      expect(JSON.stringify(error)).not.toContain('secret-value-123');
    });
  });

  describe('privacy', () => {
    it('never writes to the console and never puts the token or bodies in an error', async () => {
      const spies = (['debug', 'info', 'log', 'warn', 'error'] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      server.use(
        http.post('*/secure', () =>
          HttpResponse.json({ detail: 'Internal Server Error' }, { status: 500 }),
        ),
      );
      const client = createApiClient({ getToken: () => 'tok-secret-999' });

      const error = await failureOf(
        client.request({
          method: 'POST',
          path: '/secure',
          body: { password: 'hunter2' },
          schema: okSchema,
        }),
      );

      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      const serialised = JSON.stringify(error) + error.message + String(error.stack);
      expect(serialised).not.toContain('tok-secret-999');
      expect(serialised).not.toContain('hunter2');
    });
  });
});
