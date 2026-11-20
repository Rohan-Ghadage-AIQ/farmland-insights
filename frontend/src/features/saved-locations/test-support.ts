/**
 * Fixtures for the saved-locations tests. Import this module only from `*.test.ts(x)` files.
 */
import type { FarmFeatureCollection } from '@/domain';
import type { SavedLocation, SavedRun } from './types';

/** A small, valid square field near Mehsana. */
export function squareFarm(west = 72.4, south = 23.6, size = 0.005): FarmFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [west + size, south],
              [west + size, south + size],
              [west, south + size],
              [west, south],
            ],
          ],
        },
        properties: {},
      },
    ],
  };
}

export function makeLocation(overrides: Partial<SavedLocation> = {}): SavedLocation {
  return {
    id: 'loc-1',
    name: 'North field',
    savedAt: Date.UTC(2026, 10, 17, 9, 30),
    farm: squareFarm(),
    inputs: { crop: 'Wheat', startDate: '2026-11-01', endDate: '2026-11-07', gridSize: 50 },
    run: null,
    ...overrides,
  };
}

/** A finished analysis with no cells, enough to check that results travel with a location. */
export function makeRun(): SavedRun {
  return {
    request: {
      farm_geojson: squareFarm(),
      start_date: '2026-11-01',
      end_date: '2026-11-07',
      crop_category: 'cereals_c3_temperate',
      grid_size: 50,
    },
    response: { type: 'FeatureCollection', features: [] },
  };
}
