import { CLUSTER_KEYS, metricsInCluster } from './metrics';
import { toGridId, type ClusterKey, type GridAnalysisFeature, type GridId } from './types';

/**
 * A cell scoring below this in any cluster that has data is flagged. This is an app heuristic,
 * not a threshold from the backend.
 */
export const ATTENTION_THRESHOLD = 0.4;

export function gridIdOf(cell: GridAnalysisFeature): GridId {
  return toGridId(cell.properties.grid_id);
}

const CLUSTER_METRIC_SETS: Readonly<Record<ClusterKey, readonly string[]>> = {
  Structural: metricsInCluster('Structural'),
  Chlorophyll: metricsInCluster('Chlorophyll'),
  Water_Drought: metricsInCluster('Water_Drought'),
  Environmental: metricsInCluster('Environmental'),
  Agro_Meteo: metricsInCluster('Agro_Meteo'),
};

/** Whether the cell has a finite value for this metric key (known or not). */
export function hasMetricValue(cell: GridAnalysisFeature, metric: string): boolean {
  const raw = cell.properties.raw_metrics;
  return raw !== undefined && Object.hasOwn(raw, metric) && Number.isFinite(raw[metric]);
}

/**
 * Whether the backend gave this cell any metric of the cluster (ADR-003).
 * The score cannot answer this: missing inputs give 0.0, and 0.0 is also a real score.
 */
export function hasClusterData(cell: GridAnalysisFeature, cluster: ClusterKey): boolean {
  return CLUSTER_METRIC_SETS[cluster].some((metric) => hasMetricValue(cell, metric));
}

/** The cluster's score, or null when the cell has no data for it. */
export function clusterScore(cell: GridAnalysisFeature, cluster: ClusterKey): number | null {
  return hasClusterData(cell, cluster) ? cell.properties.cpi_scores[cluster] : null;
}

export interface ClusterStats {
  cluster: ClusterKey;
  mean: number | null;
  min: number | null;
  max: number | null;
  cellsWithData: number;
  totalCells: number;
}

/** Mean, min and max per cluster across cells that have data, so fake 0.0 scores never drag them down. */
export function farmClusterStats(
  cells: readonly GridAnalysisFeature[],
): Record<ClusterKey, ClusterStats> {
  const entries = CLUSTER_KEYS.map((cluster): [ClusterKey, ClusterStats] => {
    const scores = cells.flatMap((cell) => {
      const score = clusterScore(cell, cluster);
      return score === null ? [] : [score];
    });
    const stats: ClusterStats =
      scores.length === 0
        ? { cluster, mean: null, min: null, max: null, cellsWithData: 0, totalCells: cells.length }
        : {
            cluster,
            mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
            min: Math.min(...scores),
            max: Math.max(...scores),
            cellsWithData: scores.length,
            totalCells: cells.length,
          };
    return [cluster, stats];
  });
  return Object.fromEntries(entries) as Record<ClusterKey, ClusterStats>;
}

export interface AttentionSummary {
  count: number;
  total: number;
  gridIds: GridId[];
}

/** Cells where any cluster that has data scores below `threshold`. */
export function cellsNeedingAttention(
  cells: readonly GridAnalysisFeature[],
  threshold: number = ATTENTION_THRESHOLD,
): AttentionSummary {
  const gridIds = cells
    .filter((cell) =>
      CLUSTER_KEYS.some((cluster) => {
        const score = clusterScore(cell, cluster);
        return score !== null && score < threshold;
      }),
    )
    .map(gridIdOf);
  return { count: gridIds.length, total: cells.length, gridIds };
}
