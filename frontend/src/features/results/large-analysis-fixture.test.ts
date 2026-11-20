import { describe, expect, it } from 'vitest';
// Shared across tracks (see frontend/tests/fixtures/large-analysis.ts); this test lives in src so
// it runs under Vitest's `src/**/*.test.ts` include glob, but the generator itself is not part of
// the results feature — only this test's path is.
import { makeLargeAnalysisResponse } from '../../../tests/fixtures/large-analysis';
import { METRIC_KEYS, isMetricKey, CLUSTER_KEYS, getMetric, gridIdOf } from '@/domain';
import { buildGridIndex, findNeighbor } from './grid-navigation';
import { nth } from './test-support';

describe('makeLargeAnalysisResponse', () => {
  it('defaults to 10,000 cells', () => {
    const response = makeLargeAnalysisResponse();
    expect(response.type).toBe('FeatureCollection');
    expect(response.features).toHaveLength(10_000);
  });

  it('honours a smaller count for fast tests', () => {
    const response = makeLargeAnalysisResponse({ count: 37 });
    expect(response.features).toHaveLength(37);
  });

  it('is deterministic for a given seed', () => {
    const a = makeLargeAnalysisResponse({ count: 50, seed: 42 });
    const b = makeLargeAnalysisResponse({ count: 50, seed: 42 });
    expect(a).toEqual(b);
  });

  it('produces different values for a different seed', () => {
    const a = makeLargeAnalysisResponse({ count: 50, seed: 1 });
    const b = makeLargeAnalysisResponse({ count: 50, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('gives every cell all five CPI scores, each in 0..1', () => {
    const response = makeLargeAnalysisResponse({ count: 200, seed: 7 });
    for (const cell of response.features) {
      for (const cluster of CLUSTER_KEYS) {
        const score = cell.properties.cpi_scores[cluster];
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('only uses metric keys the domain dictionary knows, with finite, in-range-ish values', () => {
    const response = makeLargeAnalysisResponse({ count: 300, seed: 3 });
    for (const cell of response.features) {
      for (const [key, value] of Object.entries(cell.properties.raw_metrics ?? {})) {
        expect(isMetricKey(key)).toBe(true);
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('covers every metric in the dictionary across the whole fixture', () => {
    const response = makeLargeAnalysisResponse({ count: 500, seed: 9 });
    const seen = new Set<string>();
    for (const cell of response.features) {
      Object.keys(cell.properties.raw_metrics ?? {}).forEach((key) => seen.add(key));
    }
    for (const key of METRIC_KEYS) {
      expect(seen.has(key)).toBe(true);
    }
  });

  it('gives some cells an empty raw_metrics, to exercise that edge case', () => {
    const response = makeLargeAnalysisResponse({ count: 500, seed: 11, emptyMetricsRate: 0.1 });
    const empty = response.features.filter(
      (cell) => Object.keys(cell.properties.raw_metrics ?? {}).length === 0,
    );
    expect(empty.length).toBeGreaterThan(0);
  });

  it('lays cells out on a real, navigable grid', () => {
    const response = makeLargeAnalysisResponse({ count: 400, seed: 5 }); // 20x20
    const index = buildGridIndex(response.features);
    expect(index.cellCount).toBe(400);
    const firstId = String(gridIdOf(nth(response.features, 0)));
    const right = findNeighbor(index, firstId, 'right');
    expect(right).not.toBeNull();
  });

  it('gives farm-level metrics (e.g. t2m) the same value across every cell, like the real backend', () => {
    const response = makeLargeAnalysisResponse({ count: 50, seed: 13 });
    const t2mValues = new Set(
      response.features
        .map((cell) => cell.properties.raw_metrics?.t2m)
        .filter((v) => v !== undefined),
    );
    expect(t2mValues.size).toBeLessThanOrEqual(1);
    expect(getMetric('t2m').scope).toBe('farm');
  });
});
