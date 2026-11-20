import { describe, expect, it } from 'vitest';
import {
  abortedError,
  authError,
  isApiError,
  locToFieldPath,
  networkError,
  parseApiError,
  timeoutError,
  unknownError,
  userMessage,
} from './errors';

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

describe('parseApiError: every shape in API_CONTRACT section 2', () => {
  describe('400', () => {
    it('maps a DomainError body to kind "domain" with detail and technical details', async () => {
      const error = await parseApiError(
        jsonResponse(400, {
          error: 'bad_request',
          detail: 'invalid polygon geometry',
          details: { url: 'https://api.open-meteo.com/v1/forecast', body: 'Bad Gateway' },
        }),
      );

      expect(error.kind).toBe('domain');
      if (error.kind !== 'domain') return;
      expect(error.status).toBe(400);
      expect(error.detail).toBe('invalid polygon geometry');
      expect(error.details).toEqual({
        url: 'https://api.open-meteo.com/v1/forecast',
        body: 'Bad Gateway',
      });
      expect(error.fieldErrors).toEqual({});
    });

    it('treats a non-object `details` as an empty object', async () => {
      const error = await parseApiError(
        jsonResponse(400, { error: 'bad_request', detail: 'nope', details: null }),
      );

      expect(error.kind === 'domain' && error.details).toEqual({});
    });

    it('maps an auth-endpoint string detail to kind "domain"', async () => {
      const error = await parseApiError(jsonResponse(400, { detail: 'Email already in use.' }));

      expect(error.kind).toBe('domain');
      expect(error.kind === 'domain' && error.detail).toBe('Email already in use.');
    });

    it('maps PropelAuth field_to_errors (object detail) to field errors, tolerating several shapes', async () => {
      const error = await parseApiError(
        jsonResponse(400, {
          detail: {
            email: ['Email is invalid'],
            password: [{ message: 'Password too short' }],
            other: 'A plain string',
            junk: [42],
            empty: [],
          },
        }),
      );

      expect(error.kind).toBe('domain');
      if (error.kind !== 'domain') return;
      expect(error.fieldErrors).toEqual({
        email: 'Email is invalid',
        password: 'Password too short',
        other: 'A plain string',
      });
      expect(error.detail).toBe('Email is invalid');
    });

    it('falls back to an empty detail when the body has nothing usable', async () => {
      const error = await parseApiError(jsonResponse(400, { detail: { x: [] } }));

      expect(error.kind === 'domain' && error.detail).toBe('');
    });
  });

  describe('401 / 403', () => {
    it.each([401, 403])('maps %i to kind "auth" with the status preserved', async (status) => {
      const error = await parseApiError(jsonResponse(status, { detail: 'Invalid token' }));

      expect(error.kind).toBe('auth');
      if (error.kind !== 'auth') return;
      expect(error.status).toBe(status);
      expect(error.detail).toBe('Invalid token');
    });

    it('tolerates an unknown body shape (bodies are UNVERIFIED in the contract)', async () => {
      const error = await parseApiError(jsonResponse(401, { detail: { nested: true } }));

      expect(error.kind).toBe('auth');
      expect(error.kind === 'auth' && error.detail).toBe('');
    });
  });

  describe('404', () => {
    it('maps "User not found." to kind "notFound"', async () => {
      const error = await parseApiError(jsonResponse(404, { detail: 'User not found.' }));

      expect(error.kind).toBe('notFound');
      expect(error.kind === 'notFound' && error.detail).toBe('User not found.');
    });
  });

  describe('422', () => {
    it('maps FastAPI issues to field paths, stripping the leading "body"', async () => {
      const error = await parseApiError(
        jsonResponse(422, {
          detail: [
            {
              loc: ['body', 'grid_size'],
              msg: 'Input should be greater than 0',
              type: 'greater_than',
              input: -1,
            },
            {
              loc: ['body', 'farm_geojson', 'features', 0, 'geometry'],
              msg: 'Field required',
              type: 'missing',
            },
            {
              loc: ['body', 'grid_size'],
              msg: 'A second message for the same field',
              type: 'x',
            },
          ],
        }),
      );

      expect(error.kind).toBe('validation');
      if (error.kind !== 'validation') return;
      expect(error.status).toBe(422);
      expect(error.issues).toHaveLength(3);
      expect(error.issues[0]).toEqual({
        loc: ['body', 'grid_size'],
        path: 'grid_size',
        field: 'grid_size',
        message: 'Input should be greater than 0',
        type: 'greater_than',
      });
      expect(error.issues[1]?.path).toBe('farm_geojson.features.0.geometry');
      expect(error.issues[1]?.field).toBe('farm_geojson');
      // The first message wins for each top-level field.
      expect(error.fieldErrors).toEqual({
        grid_size: 'Input should be greater than 0',
        farm_geojson: 'Field required',
      });
    });

    it('never copies the offending input value into the error', async () => {
      const error = await parseApiError(
        jsonResponse(422, {
          detail: [{ loc: ['body', 'password'], msg: 'bad', type: 't', input: 'hunter2-secret' }],
        }),
      );

      expect(JSON.stringify(error)).not.toContain('hunter2-secret');
    });

    it('keeps issues that have no field (loc is just "body") but gives them no field key', async () => {
      const error = await parseApiError(
        jsonResponse(422, {
          detail: [{ loc: ['body'], msg: 'Input should be a valid dictionary', type: 'dict_type' }],
        }),
      );

      if (error.kind !== 'validation') throw new Error('expected validation');
      expect(error.issues[0]?.field).toBeUndefined();
      expect(error.issues[0]?.path).toBe('');
      expect(error.fieldErrors).toEqual({});
    });

    it('skips malformed issue entries and survives a non-array detail', async () => {
      const malformed = await parseApiError(
        jsonResponse(422, {
          detail: [null, 'text', { loc: 'nope', msg: 5 }, { loc: ['body', 'a'], msg: 'ok' }],
        }),
      );
      const notArray = await parseApiError(jsonResponse(422, { detail: 'Unprocessable' }));

      expect(malformed.kind === 'validation' && malformed.issues).toEqual([
        { loc: ['body', 'a'], path: 'a', field: 'a', message: 'ok', type: 'unknown' },
      ]);
      expect(notArray.kind).toBe('validation');
      expect(notArray.kind === 'validation' && notArray.issues).toEqual([]);
    });
  });

  describe('429', () => {
    it('maps to kind "rateLimited" and reads Retry-After seconds when present', async () => {
      const error = await parseApiError(
        jsonResponse(429, { detail: 'Too many requests' }, { 'retry-after': '12' }),
      );

      expect(error.kind).toBe('rateLimited');
      if (error.kind !== 'rateLimited') return;
      expect(error.detail).toBe('Too many requests');
      expect(error.retryAfterSeconds).toBe(12);
    });

    it('leaves retryAfterSeconds undefined for a missing or non-numeric header', async () => {
      const missing = await parseApiError(jsonResponse(429, { detail: 'x' }));
      const bad = await parseApiError(
        jsonResponse(429, { detail: 'x' }, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }),
      );

      expect(missing.kind === 'rateLimited' && missing.retryAfterSeconds).toBeUndefined();
      expect(bad.kind === 'rateLimited' && bad.retryAfterSeconds).toBeUndefined();
    });
  });

  describe('500', () => {
    it('maps the unhandled-exception shape to kind "server" with its code', async () => {
      const error = await parseApiError(
        jsonResponse(500, { error: 'internal_server_error', detail: 'Internal Server Error' }),
      );

      expect(error.kind).toBe('server');
      if (error.kind !== 'server') return;
      expect(error.status).toBe(500);
      expect(error.code).toBe('internal_server_error');
      expect(error.detail).toBe('Internal Server Error');
    });

    it('maps the auth-endpoint 500 shape ({detail}) and other 5xx statuses', async () => {
      const authStyle = await parseApiError(jsonResponse(500, { detail: 'boom' }));
      const gateway = await parseApiError(textResponse(502, '<html>Bad Gateway</html>'));

      expect(authStyle.kind === 'server' && authStyle.code).toBeUndefined();
      expect(authStyle.kind === 'server' && authStyle.detail).toBe('boom');
      expect(gateway.kind).toBe('server');
      expect(gateway.kind === 'server' && gateway.status).toBe(502);
    });
  });

  describe('anything else', () => {
    it('maps unmapped statuses to kind "unknown" with the status', async () => {
      const error = await parseApiError(jsonResponse(418, { detail: 'teapot' }));

      expect(error.kind).toBe('unknown');
      expect(error.kind === 'unknown' && error.status).toBe(418);
      expect(error.kind === 'unknown' && error.detail).toBe('teapot');
    });
  });

  describe('malformed bodies', () => {
    it.each([
      ['empty body', ''],
      ['invalid JSON', '{not json'],
      ['HTML', '<html><body>Oops</body></html>'],
      ['JSON null', 'null'],
      ['JSON array', '[1,2,3]'],
      ['JSON string', '"just a string"'],
    ])('still classifies by status when the body is %s', async (_label, body) => {
      expect((await parseApiError(textResponse(400, body))).kind).toBe('domain');
      expect((await parseApiError(textResponse(401, body))).kind).toBe('auth');
      expect((await parseApiError(textResponse(404, body))).kind).toBe('notFound');
      expect((await parseApiError(textResponse(422, body))).kind).toBe('validation');
      expect((await parseApiError(textResponse(429, body))).kind).toBe('rateLimited');
      expect((await parseApiError(textResponse(500, body))).kind).toBe('server');
      expect((await parseApiError(textResponse(418, body))).kind).toBe('unknown');
    });

    it('survives a body that cannot be read at all', async () => {
      const unreadable = {
        status: 500,
        headers: new Headers(),
        text: () => Promise.reject(new Error('stream broke')),
      } as unknown as Response;

      const error = await parseApiError(unreadable);

      expect(error.kind).toBe('server');
    });
  });
});

describe('authError', () => {
  it('builds a kind "auth" error for a missing local session, defaulting to 401', () => {
    const error = authError();

    expect(error.kind).toBe('auth');
    expect(error.kind === 'auth' && error.status).toBe(401);
    expect(userMessage(error)).toBe('Your session expired. Please sign in again.');
    expect(isApiError(error)).toBe(true);
  });
});

describe('error constructors', () => {
  it('builds real Error instances that narrow by kind', () => {
    const errors = [networkError(), abortedError(), timeoutError(5000), unknownError('weird', 200)];

    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
      expect(isApiError(error)).toBe(true);
    }
    expect(errors.map((e) => e.kind)).toEqual(['network', 'aborted', 'timeout', 'unknown']);
    const timeout = timeoutError(5000);
    expect(timeout.kind === 'timeout' && timeout.timeoutMs).toBe(5000);
  });

  it('keeps the original cause on a network error without exposing it as a message', () => {
    const cause = new TypeError('Failed to fetch');
    const error = networkError(cause);

    expect(error.cause).toBe(cause);
  });

  it('isApiError rejects plain errors and other values', () => {
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ kind: 'network' })).toBe(false);
    expect(isApiError('network')).toBe(false);
  });
});

describe('locToFieldPath', () => {
  it('drops a leading "body" and joins the rest with dots', () => {
    expect(locToFieldPath(['body', 'farm_geojson', 'features', 0])).toBe('farm_geojson.features.0');
  });

  it('keeps non-body prefixes (query, path) so nothing is mis-attributed', () => {
    expect(locToFieldPath(['query', 'page'])).toBe('query.page');
  });

  it('returns an empty path for just "body" or an empty loc', () => {
    expect(locToFieldPath(['body'])).toBe('');
    expect(locToFieldPath([])).toBe('');
  });
});

describe('userMessage: plain-language, actionable copy', () => {
  it('asks the user to sign in again for an auth error', async () => {
    const error = await parseApiError(jsonResponse(401, { detail: 'whatever' }));

    expect(userMessage(error)).toBe('Your session expired. Please sign in again.');
  });

  it('says the server cannot be reached for a network error, and what to do', () => {
    expect(userMessage(networkError())).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('distinguishes a cancelled analysis from a generic cancelled request', () => {
    expect(userMessage(abortedError(), { action: 'analyze' })).toBe('Analysis cancelled.');
    expect(userMessage(abortedError())).toBe('Request cancelled.');
  });

  it('gives timeout advice specific to analysis', () => {
    expect(userMessage(timeoutError(1000), { action: 'analyze' })).toMatch(/smaller area/i);
    expect(userMessage(timeoutError(1000))).toBe('The request took too long. Please try again.');
  });

  it('shows the server detail for a 400 domain error so the user can act on it', async () => {
    const error = await parseApiError(
      jsonResponse(400, { error: 'bad_request', detail: 'invalid polygon geometry', details: {} }),
    );

    expect(userMessage(error)).toBe('invalid polygon geometry');
  });

  it('falls back to generic copy for a 400 with no usable detail', async () => {
    const error = await parseApiError(textResponse(400, ''));

    expect(userMessage(error)).toMatch(/check what you entered/i);
  });

  it('points to the fields for a 422', async () => {
    const error = await parseApiError(
      jsonResponse(422, { detail: [{ loc: ['body', 'a'], msg: 'x', type: 't' }] }),
    );

    expect(userMessage(error)).toMatch(/check the highlighted fields/i);
  });

  it('explains a missing account at sign-in, and stays generic elsewhere', async () => {
    const error = await parseApiError(jsonResponse(404, { detail: 'User not found.' }));

    expect(userMessage(error, { action: 'signIn' })).toMatch(/no account with that email/i);
    expect(userMessage(error)).toBe("We couldn't find what you were looking for.");
  });

  it('includes a wait time for rate limiting only when the server gave one', async () => {
    const withWait = await parseApiError(
      jsonResponse(429, { detail: 'x' }, { 'retry-after': '30' }),
    );
    const without = await parseApiError(jsonResponse(429, { detail: 'x' }));

    expect(userMessage(withWait)).toBe('Too many requests. Try again in 30 seconds.');
    expect(userMessage(without)).toBe('Too many requests. Try again in a moment.');
  });

  it('uses singular "second" for a one-second wait', async () => {
    const error = await parseApiError(jsonResponse(429, { detail: 'x' }, { 'retry-after': '1' }));

    expect(userMessage(error)).toBe('Too many requests. Try again in 1 second.');
  });

  it('blames the server (not the user) for a 500 and suggests retry', async () => {
    const error = await parseApiError(
      jsonResponse(500, { error: 'internal_server_error', detail: 'x' }),
    );

    expect(userMessage(error)).toMatch(/something went wrong on our side/i);
    expect(userMessage(error)).toMatch(/try again/i);
  });

  it('never leaks the raw server detail for a 500 or unknown status', async () => {
    const server = await parseApiError(jsonResponse(500, { detail: 'Traceback: secret path' }));
    const unknown = await parseApiError(jsonResponse(418, { detail: 'secret teapot' }));

    expect(userMessage(server)).not.toContain('secret');
    expect(userMessage(unknown)).not.toContain('secret');
    expect(userMessage(unknown)).toMatch(/unexpected/i);
  });
});
