import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import { session } from '@/lib/session';
import { createApiClient, type ApiClient } from './client';
import { ANALYZE_TIMEOUT_MS, createEndpoints } from './endpoints';
import { isApiError } from './errors';
import { endpoints } from './instance';
import type { AnalysisRequest } from './schemas';

const tokenBody = {
  user_id: 'u_1',
  email: 'farmer@example.com',
  access_token: 'tok-abc',
  token_type: 'bearer',
  expires_in_minutes: 480,
};

const cpi = {
  Structural: 0.5,
  Chlorophyll: 0.5,
  Water_Drought: 0.5,
  Environmental: 0.5,
  Agro_Meteo: 0.5,
};

const analysisBody = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 1,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: { grid_id: 1, raw_metrics: { ndvi: 0.5 }, cpi_scores: cpi, advisories: {} },
    },
  ],
};

const analysisRequest: AnalysisRequest = {
  farm_geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  },
  start_date: '2026-01-01',
  end_date: '2026-02-01',
  crop_category: 'cereals_c3_temperate',
  grid_size: 50,
};

afterEach(() => {
  session.signOut();
});

describe('createEndpoints', () => {
  it('health: GET /health, public', async () => {
    let auth: string | null = 'unset';
    server.use(
      http.get('*/health', ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    const api = createEndpoints(createApiClient({ getToken: () => 'tok' }));

    await expect(api.health()).resolves.toEqual({ status: 'ok' });
    expect(auth).toBeNull();
  });

  it('register: POSTs the body to /api/v1/auth/register and returns the token response', async () => {
    let received: unknown;
    server.use(
      http.post('*/api/v1/auth/register', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(tokenBody);
      }),
    );
    const api = createEndpoints(createApiClient());

    const result = await api.register({
      email: 'farmer@example.com',
      password: 'pw',
      duration_in_minutes: 480,
    });

    expect(received).toEqual({
      email: 'farmer@example.com',
      password: 'pw',
      duration_in_minutes: 480,
    });
    expect(result.access_token).toBe('tok-abc');
  });

  it('token: POSTs to /api/v1/auth/token and surfaces a 404 as notFound', async () => {
    server.use(
      http.post('*/api/v1/auth/token', () =>
        HttpResponse.json({ detail: 'User not found.' }, { status: 404 }),
      ),
    );
    const api = createEndpoints(createApiClient());

    const error = await api
      .token({ email: 'nobody@example.com', duration_in_minutes: 480 })
      .catch((e: unknown) => e);

    expect(isApiError(error) && error.kind).toBe('notFound');
  });

  it('whoami: GET /api/v1/auth/whoami with the Bearer token, normalising nulls', async () => {
    let auth: string | null = null;
    server.use(
      http.get('*/api/v1/auth/whoami', ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ user_id: 'u_1' });
      }),
    );
    const api = createEndpoints(createApiClient({ getToken: () => 'tok-abc' }));

    const result = await api.whoami();

    expect(auth).toBe('Bearer tok-abc');
    expect(result).toEqual({ user_id: 'u_1', email: null, active_org_id: null });
  });

  it('analyze: POSTs the request, authenticated, and validates the response', async () => {
    let received: unknown;
    let auth: string | null = null;
    server.use(
      http.post('*/api/v1/analyze', async ({ request }) => {
        received = await request.json();
        auth = request.headers.get('authorization');
        return HttpResponse.json(analysisBody);
      }),
    );
    const api = createEndpoints(createApiClient({ getToken: () => 'tok-abc' }));

    const result = await api.analyze(analysisRequest);

    expect(received).toEqual(analysisRequest);
    expect(auth).toBe('Bearer tok-abc');
    expect(result.features).toHaveLength(1);
  });

  it('analyze: uses the long analysis timeout and forwards the caller signal', async () => {
    const request = vi.fn().mockResolvedValue(analysisBody);
    const client: ApiClient = { request };
    const controller = new AbortController();

    await createEndpoints(client).analyze(analysisRequest, controller.signal);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/analyze',
        timeoutMs: ANALYZE_TIMEOUT_MS,
        signal: controller.signal,
      }),
    );
    expect(ANALYZE_TIMEOUT_MS).toBeGreaterThan(60_000);
  });

  it('analyze: a 400 DomainError surfaces as kind "domain"', async () => {
    server.use(
      http.post('*/api/v1/analyze', () =>
        HttpResponse.json(
          { error: 'bad_request', detail: 'Weather data unavailable', details: {} },
          { status: 400 },
        ),
      ),
    );
    const api = createEndpoints(createApiClient({ getToken: () => 'tok' }));

    const error = await api.analyze(analysisRequest).catch((e: unknown) => e);

    expect(isApiError(error) && error.kind).toBe('domain');
  });
});

describe('default endpoints wired to the session', () => {
  it('sends the session token and clears the session on a 401', async () => {
    session.setSession(tokenBody);
    server.use(
      http.get('*/api/v1/auth/whoami', ({ request }) =>
        request.headers.get('authorization') === 'Bearer tok-abc'
          ? HttpResponse.json({ detail: 'expired' }, { status: 401 })
          : HttpResponse.json({ detail: 'missing token' }, { status: 500 }),
      ),
    );
    const events: unknown[] = [];
    const off = session.onEvent((event) => events.push(event));

    const error = await endpoints.whoami().catch((e: unknown) => e);
    off();

    expect(isApiError(error) && error.kind).toBe('auth');
    expect(session.getSession()).toBeNull();
    expect(events).toEqual([{ type: 'expired', reason: 'unauthorized' }]);
  });
});
