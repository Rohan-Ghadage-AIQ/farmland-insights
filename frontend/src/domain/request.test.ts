import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_SIZE,
  GRID_SIZE_PRESETS,
  buildAnalysisRequest,
  inputsHash,
  isValidGridSize,
  type AnalysisInputs,
} from './request';
import {
  parseIsoDate,
  type CropCategoryKey,
  type FarmFeatureCollection,
  type IsoDate,
} from './types';

function date(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error('bad date');
  return parsed;
}

const WHEAT = 'cereals_c3_temperate' as CropCategoryKey;
const FRUIT = 'fruits_tropical' as CropCategoryKey;

const FARM: FarmFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 1,
      properties: { name: 'North field' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77, 28],
            [77.01, 28],
            [77.01, 28.01],
            [77, 28.01],
            [77, 28],
          ],
        ],
      },
    },
  ],
};

function inputs(overrides: Partial<AnalysisInputs> = {}): AnalysisInputs {
  return {
    farm: FARM,
    startDate: date('2026-10-01'),
    endDate: date('2026-10-31'),
    crop: WHEAT,
    gridSize: 50,
    ...overrides,
  };
}

describe('grid size rules', () => {
  it('defaults to 50 metres with presets 10, 20, 50 and 100', () => {
    expect(DEFAULT_GRID_SIZE).toBe(50);
    expect(GRID_SIZE_PRESETS).toEqual([10, 20, 50, 100]);
  });

  it('accepts only whole numbers above zero', () => {
    expect(isValidGridSize(1)).toBe(true);
    expect(isValidGridSize(50)).toBe(true);
    expect(isValidGridSize(0)).toBe(false);
    expect(isValidGridSize(-5)).toBe(false);
    expect(isValidGridSize(12.5)).toBe(false);
    expect(isValidGridSize(Number.NaN)).toBe(false);
    expect(isValidGridSize(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('buildAnalysisRequest', () => {
  it('maps the inputs to the API request shape', () => {
    const request = buildAnalysisRequest(inputs());
    expect(request).toEqual({
      farm_geojson: FARM,
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      crop_category: 'cereals_c3_temperate',
      grid_size: 50,
    });
  });

  it('strips foreign members from the farm so the backend does not reject it', () => {
    const dirty = { ...FARM, name: 'x', bbox: [0, 0, 1, 1] } as unknown as FarmFeatureCollection;
    const request = buildAnalysisRequest(inputs({ farm: dirty }));
    expect(Object.keys(request.farm_geojson).sort()).toEqual(['features', 'type']);
  });

  it('does not mutate the farm it was given', () => {
    const snapshot = structuredClone(FARM);
    buildAnalysisRequest(inputs());
    expect(FARM).toEqual(snapshot);
  });

  it('rejects an invalid grid size instead of sending it', () => {
    expect(() => buildAnalysisRequest(inputs({ gridSize: 0 }))).toThrow(RangeError);
    expect(() => buildAnalysisRequest(inputs({ gridSize: 2.5 }))).toThrow(/grid size/i);
  });
});

describe('inputsHash', () => {
  const hash = (overrides: Partial<AnalysisInputs> = {}) =>
    inputsHash(buildAnalysisRequest(inputs(overrides)));

  it('is stable for equal inputs and has a fixed shape', () => {
    expect(hash()).toBe(hash());
    expect(hash()).toMatch(/^[0-9a-f]{14}$/);
  });

  it('is the same regardless of object key order', () => {
    const request = buildAnalysisRequest(inputs());
    const reordered = {
      grid_size: request.grid_size,
      crop_category: request.crop_category,
      end_date: request.end_date,
      start_date: request.start_date,
      farm_geojson: {
        features: request.farm_geojson.features.map((f) => ({
          geometry: f.geometry,
          type: f.type,
        })),
        type: request.farm_geojson.type,
      },
    };
    expect(inputsHash(reordered)).toBe(inputsHash(request));
  });

  it('changes when the dates, crop or grid size change', () => {
    const base = hash();
    expect(hash({ startDate: date('2026-10-02') })).not.toBe(base);
    expect(hash({ endDate: date('2026-11-01') })).not.toBe(base);
    expect(hash({ crop: FRUIT })).not.toBe(base);
    expect(hash({ gridSize: 51 })).not.toBe(base);
  });

  it('changes when a coordinate moves, even slightly', () => {
    const moved: FarmFeatureCollection = structuredClone(FARM);
    const ring = moved.features[0]?.geometry.coordinates[0];
    if (!ring || ring.length < 3) throw new Error('test setup');
    ring[2] = [77.01, 28.010001];
    expect(hash({ farm: moved })).not.toBe(hash());
  });

  it('ignores feature properties and ids, which do not affect the analysis', () => {
    const renamed: FarmFeatureCollection = structuredClone(FARM);
    const feature = renamed.features[0];
    if (!feature) throw new Error('test setup');
    feature.properties = { name: 'Renamed' };
    feature.id = 'other';
    expect(hash({ farm: renamed })).toBe(hash());
  });

  it('changes when the feature order changes', () => {
    const first = FARM.features[0];
    if (!first) throw new Error('test setup');
    const second = structuredClone(first);
    const ring = second.geometry.coordinates[0];
    if (!ring) throw new Error('test setup');
    ring[0] = [78, 28];
    ring[4] = [78, 28];
    const ab: FarmFeatureCollection = { type: 'FeatureCollection', features: [first, second] };
    const ba: FarmFeatureCollection = { type: 'FeatureCollection', features: [second, first] };
    expect(hash({ farm: ab })).not.toBe(hash({ farm: ba }));
  });
});
