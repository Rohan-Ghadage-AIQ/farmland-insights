import { performance } from 'node:perf_hooks';
import { it } from 'vitest';
import { farmClusterStats, flattenToCsv, groupAdvisories } from '@/domain';
import { buildGridLayerData, getGridLayerData } from '@/features/map/grid-source';
import type { LayerSpec } from '@/features/map/types';
import { makeLargeAnalysisResponse } from '../fixtures/large-analysis';

/**
 * Measures the pure, hot-path functions a hover/selection/re-render or an export touches, at the
 * spec's 10,000-cell scale (`tests/fixtures/large-analysis.ts`).
 *
 * Vitest 5 dropped the built-in `bench()`/`vitest bench` benchmarking mode (confirmed by running
 * it here: `bench` is not exported by the installed `vitest@5.0.5`), so this uses plain
 * `performance.now()` timing inside ordinary `it()` blocks instead — still real, wall-clock
 * measurements of the actual compiled functions, just without tinybench's statistics.
 *
 * Run: `npx vitest run --config tests/perf/vitest.perf.config.ts`
 * Read the numbers from this command's stdout (printed per case); see `docs/BENCHMARKS.md`.
 *
 * This file is read-only with respect to `src/`: it imports and calls existing exports, it does
 * not modify them.
 */

interface Timing {
  readonly name: string;
  readonly iterations: number;
  readonly meanMs: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

function timeIt(name: string, iterations: number, fn: () => void): Timing {
  // Warm up the JIT so the first (often slowest) call doesn't dominate the average.
  for (let i = 0; i < 3; i += 1) fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const median = samples[Math.floor(samples.length / 2)] ?? 0;
  const timing: Timing = {
    name,
    iterations,
    meanMs: mean,
    medianMs: median,
    minMs: samples[0] ?? 0,
    maxMs: samples[samples.length - 1] ?? 0,
  };
  console.log(
    `[perf] ${name}: mean=${timing.meanMs.toFixed(3)}ms median=${timing.medianMs.toFixed(3)}ms ` +
      `min=${timing.minMs.toFixed(3)}ms max=${timing.maxMs.toFixed(3)}ms (n=${String(iterations)})`,
  );
  return timing;
}

const response = makeLargeAnalysisResponse({ count: 10_000, seed: 1 });
const cells = response.features;

const metricLayer: LayerSpec = { kind: 'metric', metric: 'ndvi' };
const cpiLayer: LayerSpec = {
  kind: 'cpi',
  cluster: 'Structural',
  clusterMetricKeys: ['ndvi', 'evi', 'savi'],
};

it('buildGridLayerData (metric layer, uncached — one full 10k-cell response pass)', () => {
  timeIt('buildGridLayerData/metric', 20, () => {
    buildGridLayerData(response, metricLayer);
  });
});

it('buildGridLayerData (cpi layer, uncached — one full 10k-cell response pass)', () => {
  timeIt('buildGridLayerData/cpi', 20, () => {
    buildGridLayerData(response, cpiLayer);
  });
});

it('getGridLayerData (memoised — what a hover/selection re-render actually pays)', () => {
  // Same response + layer identity every call: after the first call this is a pure cache hit
  // (WeakMap.get + Map.get), which is exactly the "does hover recompute per-cell stats?" question.
  timeIt('getGridLayerData/cache-hit', 2000, () => {
    getGridLayerData(response, metricLayer);
  });
});

it('farmClusterStats (farm summary panel, 10k cells)', () => {
  timeIt('farmClusterStats', 20, () => {
    farmClusterStats(cells);
  });
});

it('groupAdvisories (advisory grouping, 10k cells)', () => {
  timeIt('groupAdvisories', 20, () => {
    groupAdvisories(cells);
  });
});

it('flattenToCsv (CSV export, 10k cells)', () => {
  timeIt('flattenToCsv', 20, () => {
    flattenToCsv(cells);
  });
});
