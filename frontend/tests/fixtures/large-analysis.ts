/**
 * A shared, deterministic analysis-response generator for large-dataset and performance tests
 * across tracks (the map's 10k-cell hover check, the results table and export paths, etc.).
 * Not a Vitest spec itself: see `src/features/results/large-analysis-fixture.test.ts`, which runs
 * under `src/**` and exercises this module by its real path.
 */
import {
  CLUSTER_KEYS,
  METRIC_KEYS,
  getMetric,
  metricsInCluster,
  type ClusterKey,
  type FarmAnalysisResponse,
  type GridAnalysisFeature,
  type MetricKey,
} from '@/domain';

export interface LargeAnalysisFixtureOptions {
  /** Total number of grid cells. Defaults to 10,000, matching the spec's performance benchmark. */
  readonly count?: number;
  /** Any integer: the same seed always produces the same response. */
  readonly seed?: number;
  /** Lower-left corner of the grid, in degrees (lng, lat). */
  readonly gridOrigin?: readonly [number, number];
  /** Cell side length, in degrees. */
  readonly cellSizeDeg?: number;
  /** Fraction (0..1) of (cell, cluster) pairs with no metrics at all, simulating a failed data source. */
  readonly missingClusterRate?: number;
  /** Fraction (0..1) of cells with a completely empty `raw_metrics` (ADR-003's edge case). */
  readonly emptyMetricsRate?: number;
}

// A small, dependency-free PRNG (mulberry32), so the fixture needs no seeded-random package and
// stays reproducible across Node versions and platforms.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plausible value ranges per metric, loosely based on the documented parameter reference. */
const METRIC_RANGES: Record<MetricKey, readonly [number, number]> = {
  ndvi: [0.1, 0.9],
  evi: [0.05, 0.8],
  savi: [0.1, 0.85],
  rvi: [0.1, 0.9],
  dprvi: [0.1, 0.9],
  dpsvi: [0.1, 0.9],
  csi: [0, 1],
  gndvi: [0.1, 0.85],
  ndre: [0, 0.6],
  ndmi: [-0.2, 0.6],
  ndwi: [-0.6, 0.2],
  ndwi_farmonaut: [0.0, 0.6],
  rsm: [0, 1],
  swdi: [-5, 5],
  cmi: [-50, 100],
  ai_dm: [0, 60],
  vci: [0, 100],
  tci: [0, 100],
  vhi: [0, 100],
  nddi: [-1, 1],
  spi: [-3, 3],
  spei: [-3, 3],
  rfdi: [0, 1],
  t2m: [10, 42],
  lst: [10, 48],
  rh: [15, 95],
  soil_moist: [0.05, 0.45],
  soil_temp: [10, 38],
  crti: [0, 500],
  gdd: [0, 2000],
  rwi: [-3, 3],
  payout: [0, 1],
  precip: [0, 6],
  et_actual: [0, 6],
};

function randomInRange(random: () => number, [min, max]: readonly [number, number]): number {
  return min + random() * (max - min);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A score correlated with the metric values that fed it, so "needs attention" cells are not pure noise. */
function scoreFromMetrics(random: () => number, metricValues: readonly number[]): number {
  if (metricValues.length === 0) return 0;
  const noise = (random() - 0.5) * 0.2;
  const base = metricValues.reduce((sum, v) => sum + v, 0) / metricValues.length;
  return Math.min(1, Math.max(0, base + noise));
}

function normalise(value: number, [min, max]: readonly [number, number]): number {
  return max === min ? 0.5 : (value - min) / (max - min);
}

/**
 * Builds a `FarmAnalysisResponse` with `count` cells laid out on a regular, navigable grid, with
 * realistic per-metric ranges, occasional missing clusters and empty `raw_metrics` (so consumers
 * exercise the same "No data" and empty-metrics paths a real run can produce), and farm-level
 * metrics (per the domain's `scope: 'farm'`) broadcasting one value to every cell, as the backend
 * does. Deterministic for a given `seed`.
 */
export function makeLargeAnalysisResponse(
  options: LargeAnalysisFixtureOptions = {},
): FarmAnalysisResponse {
  const {
    count = 10_000,
    seed = 1,
    gridOrigin = [77, 28],
    cellSizeDeg = 0.001,
    missingClusterRate = 0.03,
    emptyMetricsRate = 0.02,
  } = options;

  const random = mulberry32(seed);
  const cols = Math.ceil(Math.sqrt(count));
  const [originX, originY] = gridOrigin;

  // Farm-level metrics are one value broadcast to every cell (ADR-005): drawn once, up front.
  const farmLevelValues = new Map<MetricKey, number>();
  for (const key of METRIC_KEYS) {
    if (getMetric(key).scope === 'farm') {
      farmLevelValues.set(key, roundTo(randomInRange(random, METRIC_RANGES[key]), 3));
    }
  }

  const features: GridAnalysisFeature[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const gridId = index + 1;
    const x = originX + col * cellSizeDeg;
    const y = originY - row * cellSizeDeg; // row 0 is the northmost band (see grid-navigation.ts)

    const rawMetrics: Record<string, number> = {};
    const cpiScores: Record<ClusterKey, number> = {
      Structural: 0,
      Chlorophyll: 0,
      Water_Drought: 0,
      Environmental: 0,
      Agro_Meteo: 0,
    };
    const advisories: Record<string, string> = {};

    const emptyCell = random() < emptyMetricsRate;
    if (!emptyCell) {
      for (const cluster of CLUSTER_KEYS) {
        const hasCluster = random() >= missingClusterRate;
        const clusterValues: number[] = [];
        for (const metricKey of metricsInCluster(cluster)) {
          if (!hasCluster) continue;
          const meta = getMetric(metricKey);
          const range = METRIC_RANGES[metricKey];
          const value =
            meta.scope === 'farm'
              ? (farmLevelValues.get(metricKey) ?? roundTo(randomInRange(random, range), 3))
              : roundTo(randomInRange(random, range), 3);
          rawMetrics[metricKey] = value;
          clusterValues.push(normalise(value, range));
        }
        cpiScores[cluster] = hasCluster ? scoreFromMetrics(random, clusterValues) : 0;
        if (hasCluster && cpiScores[cluster] < 0.4 && clusterValues.length > 0) {
          const [firstMetric] = metricsInCluster(cluster);
          if (firstMetric !== undefined) {
            advisories[firstMetric] =
              `Routine scout recommended for ${getMetric(firstMetric).label}`;
          }
        }
      }
    }

    features.push({
      type: 'Feature',
      id: gridId,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [x, y],
            [x + cellSizeDeg, y],
            [x + cellSizeDeg, y + cellSizeDeg],
            [x, y + cellSizeDeg],
            [x, y],
          ],
        ],
      },
      properties: {
        grid_id: gridId,
        ...(emptyCell ? {} : { raw_metrics: rawMetrics }),
        cpi_scores: cpiScores,
        ...(Object.keys(advisories).length > 0 ? { advisories } : {}),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
