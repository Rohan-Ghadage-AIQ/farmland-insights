import type { FarmFeatureCollection } from '@/domain';

/**
 * The "Load sample field" fixture (spec 3.3.1). A typed mirror of `farm_geojson` from
 * `SAMPLE_FARM_ANALYSIS_REQUEST` in `app/utils/payloads.py`; `sample-field.test.ts` fails if the
 * two drift apart.
 */
export const SAMPLE_FIELD: FarmFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'farm-1',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [77.1, 28.6],
            [77.11, 28.6],
            [77.11, 28.61],
            [77.1, 28.61],
            [77.1, 28.6],
          ],
        ],
      },
      properties: {},
    },
  ],
};
