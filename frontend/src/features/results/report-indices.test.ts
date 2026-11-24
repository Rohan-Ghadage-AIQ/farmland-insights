import { describe, expect, it } from 'vitest';
import {
  REPORT_INDEX_GROUPS,
  SCALE_COLOURS,
  bandOf,
  scaleColour,
  type IndexBands,
} from './report-indices';

const UP: IndexBands = { domain: [0, 1], cuts: [0.3, 0.6], higherIsBetter: true };
const DOWN: IndexBands = { domain: [-1, 1], cuts: [-0.3, 0], higherIsBetter: false };

describe('report index bands', () => {
  it('rates values on both sides of each cut', () => {
    expect([0.29, 0.3, 0.59, 0.6].map((v) => bandOf(UP, v))).toEqual([
      'bad',
      'medium',
      'medium',
      'good',
    ]);
    expect([-0.31, -0.3, 0, 0.01].map((v) => bandOf(DOWN, v))).toEqual([
      'good',
      'good',
      'medium',
      'bad',
    ]);
  });

  it('keeps red at the poor end whichever way the index runs, and clamps out-of-range values', () => {
    expect(scaleColour(UP, -5)).toBe(SCALE_COLOURS[0]);
    expect(scaleColour(UP, 5)).toBe(SCALE_COLOURS.at(-1));
    expect(scaleColour(DOWN, 1)).toBe(SCALE_COLOURS[0]);
    expect(scaleColour(DOWN, -1)).toBe(SCALE_COLOURS.at(-1));
  });

  it('covers the requested sections in order', () => {
    expect(REPORT_INDEX_GROUPS.map((g) => [g.title, g.indices.map((i) => i.key)])).toEqual([
      ['Radar (RVI, RSM)', ['rvi', 'rsm']],
      ['Crop Health (NDVI, EVI, SAVI, NDRE)', ['ndvi', 'evi', 'savi', 'ndre']],
      [
        'Irrigation (NDWI, Farmonaut NDWI, NDMI, Evapotranspiration)',
        ['ndwi', 'ndwi_farmonaut', 'ndmi', 'et_actual'],
      ],
    ]);
  });
});
