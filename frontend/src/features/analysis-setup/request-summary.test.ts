import { describe, expect, it } from 'vitest';
import type { ApiError } from '@/api';
import type { FarmAnalysisRequest } from '@/domain';
import { buildRequestSummary } from './request-summary';

const request: FarmAnalysisRequest = {
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
        properties: {},
      },
    ],
  },
  start_date: '2026-10-01',
  end_date: '2026-10-30',
  crop_category: 'cereals_c3_temperate',
  grid_size: 50,
};

function serverError(): ApiError {
  const error = new Error('Server error 500') as ApiError;
  return Object.assign(error, {
    name: 'ApiError',
    kind: 'server' as const,
    status: 500,
    detail: 'boom',
    code: 'internal_server_error',
  });
}

describe('buildRequestSummary', () => {
  it('is valid JSON', () => {
    const summary = buildRequestSummary(request, serverError());
    expect(() => {
      JSON.parse(summary);
    }).not.toThrow();
  });

  it('includes the endpoint, status, code and inputs, but never a token', () => {
    const summary = buildRequestSummary(request, serverError());
    const parsed = JSON.parse(summary) as Record<string, unknown>;

    expect(parsed.endpoint).toBe('POST /api/v1/analyze');
    expect(parsed.status).toBe(500);
    expect(parsed.code).toBe('internal_server_error');
    expect(summary).toContain('cereals_c3_temperate');
    expect(summary).toContain('2026-10-01');
    expect(summary.toLowerCase()).not.toContain('bearer');
    expect(summary.toLowerCase()).not.toContain('token');
  });

  it('summarises the farm by feature count, not the full geometry', () => {
    const summary = buildRequestSummary(request, serverError());
    const parsed = JSON.parse(summary) as { request: { farm: { featureCount: number } } };

    expect(parsed.request.farm.featureCount).toBe(1);
    expect(summary).not.toContain('"coordinates"');
  });
});
