import { describe, expect, it } from 'vitest';
import { hasAnySatelliteMetric } from './satellite';
import { makeCell } from './test-support';

describe('hasAnySatelliteMetric', () => {
  it('is false for an empty cell list', () => {
    expect(hasAnySatelliteMetric([])).toBe(false);
  });

  it('is false when no cell has raw_metrics at all', () => {
    const cells = [makeCell(1), makeCell(2)];
    expect(hasAnySatelliteMetric(cells)).toBe(false);
  });

  it('is false when cells only carry farm-level (weather) metrics', () => {
    // t2m, rh, soil_moist are farm-scope: broadcast from the centroid, not satellite-derived (ADR-005).
    const cells = [makeCell(1, { metrics: { t2m: 24.8, rh: 55, soil_moist: 0.2 } })];
    expect(hasAnySatelliteMetric(cells)).toBe(false);
  });

  it('is true when at least one cell has a cell-scope (satellite) metric', () => {
    const cells = [
      makeCell(1, { metrics: { t2m: 24.8 } }),
      makeCell(2, { metrics: { ndvi: 0.64 } }),
    ];
    expect(hasAnySatelliteMetric(cells)).toBe(true);
  });

  it('ignores a satellite metric key with a non-finite value', () => {
    const cells = [makeCell(1, { metrics: { ndvi: Number.NaN } })];
    expect(hasAnySatelliteMetric(cells)).toBe(false);
  });

  it('ignores metric keys the dictionary does not know', () => {
    const cells = [makeCell(1, { metrics: { mystery_metric: 1 } })];
    expect(hasAnySatelliteMetric(cells)).toBe(false);
  });
});
