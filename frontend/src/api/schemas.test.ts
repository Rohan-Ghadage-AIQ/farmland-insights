import { describe, expect, it } from 'vitest';
import {
  analysisResponseSchema,
  authTokenResponseSchema,
  healthResponseSchema,
  whoAmIResponseSchema,
} from './schemas';

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [77.1, 28.6],
      [77.10051, 28.6],
      [77.10051, 28.60045],
      [77.1, 28.60045],
      [77.1, 28.6],
    ],
  ],
} as const;

function feature(overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature',
    id: 1,
    geometry: polygon,
    properties: {
      grid_id: 1,
      raw_metrics: { ndvi: 0.64, t2m: 24.8 },
      cpi_scores: {
        Structural: 0.71,
        Chlorophyll: 0.64,
        Water_Drought: 0.58,
        Environmental: 0.69,
        Agro_Meteo: 0.61,
      },
      advisories: { ndvi: 'Routine scout for pests' },
    },
    ...overrides,
  };
}

function analysis(features: unknown[] = [feature()]) {
  return { type: 'FeatureCollection', features };
}

describe('healthResponseSchema', () => {
  it('accepts only {status:"ok"}', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: 'degraded' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('authTokenResponseSchema', () => {
  const valid = {
    user_id: 'u_1',
    email: 'a@b.co',
    access_token: 'tok',
    token_type: 'bearer',
    expires_in_minutes: 480,
  };

  it('accepts a valid token response', () => {
    expect(authTokenResponseSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['empty access token', { ...valid, access_token: '' }],
    ['missing access token', { ...valid, access_token: undefined }],
    ['string expiry', { ...valid, expires_in_minutes: '480' }],
    ['zero expiry', { ...valid, expires_in_minutes: 0 }],
    ['negative expiry', { ...valid, expires_in_minutes: -5 }],
    ['missing user id', { ...valid, user_id: undefined }],
  ])('rejects %s', (_label, value) => {
    expect(authTokenResponseSchema.safeParse(value).success).toBe(false);
  });

  it('defaults token_type to "bearer" like the backend model does', () => {
    const rest = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'token_type'));

    expect(authTokenResponseSchema.parse(rest).token_type).toBe('bearer');
  });

  it('ignores extra fields instead of failing on a harmless backend addition', () => {
    expect(authTokenResponseSchema.parse({ ...valid, extra: 1 })).toEqual(valid);
  });
});

describe('whoAmIResponseSchema', () => {
  it('normalises absent email and org to null so consumers never see undefined', () => {
    expect(whoAmIResponseSchema.parse({ user_id: 'u_1' })).toEqual({
      user_id: 'u_1',
      email: null,
      active_org_id: null,
    });
  });

  it('keeps provided values and accepts explicit nulls', () => {
    expect(
      whoAmIResponseSchema.parse({ user_id: 'u', email: 'a@b.co', active_org_id: 'o' }),
    ).toEqual({ user_id: 'u', email: 'a@b.co', active_org_id: 'o' });
    expect(
      whoAmIResponseSchema.parse({ user_id: 'u', email: null, active_org_id: null }).email,
    ).toBeNull();
  });

  it('requires a user id', () => {
    expect(whoAmIResponseSchema.safeParse({ email: 'a@b.co' }).success).toBe(false);
  });
});

describe('analysisResponseSchema: API_CONTRACT sections 1 and 4', () => {
  it('accepts a normal response', () => {
    const parsed = analysisResponseSchema.parse(analysis());

    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0]?.properties.raw_metrics.ndvi).toBe(0.64);
  });

  it('accepts a string or integer grid_id (rule 6)', () => {
    const parsed = analysisResponseSchema.parse(
      analysis([
        feature(),
        feature({
          id: 'g-2',
          properties: { ...feature().properties, grid_id: 'g-2' },
        }),
      ]),
    );

    expect(parsed.features.map((f) => f.properties.grid_id)).toEqual([1, 'g-2']);
  });

  it('accepts derived indices alongside measurements in raw_metrics (rule 1)', () => {
    const parsed = analysisResponseSchema.parse(
      analysis([
        feature({
          properties: {
            ...feature().properties,
            raw_metrics: { ndvi: 0.5, swdi: 0.2, spi: -1.1, payout: 0, crti: 12.5, gdd: 480 },
          },
        }),
      ]),
    );

    expect(Object.keys(parsed.features[0]?.properties.raw_metrics ?? {})).toEqual([
      'ndvi',
      'swdi',
      'spi',
      'payout',
      'crti',
      'gdd',
    ]);
  });

  it('accepts a 200 with no satellite data: weather-only metrics and 0.0 CPI scores (section 3)', () => {
    const parsed = analysisResponseSchema.parse(
      analysis([
        feature({
          properties: {
            grid_id: 1,
            raw_metrics: { t2m: 24, rh: 60 },
            cpi_scores: {
              Structural: 0,
              Chlorophyll: 0,
              Water_Drought: 0.4,
              Environmental: 0.7,
              Agro_Meteo: 0.5,
            },
            advisories: {},
          },
        }),
      ]),
    );

    expect(parsed.features[0]?.properties.cpi_scores.Structural).toBe(0);
  });

  it('defaults missing raw_metrics and advisories to empty objects and a missing id to null', () => {
    const parsed = analysisResponseSchema.parse(
      analysis([
        {
          type: 'Feature',
          geometry: polygon,
          properties: { grid_id: 3, cpi_scores: feature().properties.cpi_scores },
        },
      ]),
    );
    const first = parsed.features[0];

    expect(first?.properties.raw_metrics).toEqual({});
    expect(first?.properties.advisories).toEqual({});
    expect(first?.id).toBeNull();
  });

  it('keeps advisories for metrics that have no value (rule 3 is applied by the domain layer)', () => {
    const parsed = analysisResponseSchema.parse(
      analysis([
        feature({
          properties: {
            ...feature().properties,
            raw_metrics: {},
            advisories: { spi: 'Critical action text' },
          },
        }),
      ]),
    );

    expect(parsed.features[0]?.properties.advisories).toEqual({ spi: 'Critical action text' });
  });

  it('accepts MultiPolygon cells (clipped edge cells, section 1)', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [polygon.coordinates, polygon.coordinates],
    };

    const parsed = analysisResponseSchema.parse(analysis([feature({ geometry: multi })]));

    expect(parsed.features[0]?.geometry.type).toBe('MultiPolygon');
  });

  it('accepts [lng, lat, alt] positions', () => {
    const withAlt = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0, 5],
          [1, 0, 5],
          [1, 1, 5],
          [0, 0, 5],
        ],
      ],
    };

    expect(
      analysisResponseSchema.safeParse(analysis([feature({ geometry: withAlt })])).success,
    ).toBe(true);
  });

  it.each([
    ['no features', analysis([])],
    ['wrong collection type', { type: 'Feature', features: [feature()] }],
    [
      'a missing CPI key',
      analysis([
        feature({ properties: { ...feature().properties, cpi_scores: { Structural: 1 } } }),
      ]),
    ],
    [
      'a null CPI score (the backend never sends null)',
      analysis([
        feature({
          properties: {
            ...feature().properties,
            cpi_scores: {
              Structural: null,
              Chlorophyll: 0,
              Water_Drought: 0,
              Environmental: 0,
              Agro_Meteo: 0,
            },
          },
        }),
      ]),
    ],
    [
      'a string metric value',
      analysis([
        feature({ properties: { ...feature().properties, raw_metrics: { ndvi: '0.6' } } }),
      ]),
    ],
    [
      'a non-string advisory',
      analysis([feature({ properties: { ...feature().properties, advisories: { ndvi: 3 } } })]),
    ],
    [
      'an unsupported geometry',
      analysis([feature({ geometry: { type: 'Point', coordinates: [0, 0] } })]),
    ],
    [
      'a missing grid_id',
      analysis([feature({ properties: { cpi_scores: feature().properties.cpi_scores } })]),
    ],
    ['a non-object body', 'oops'],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(analysisResponseSchema.safeParse(body).success).toBe(false);
  });
});
