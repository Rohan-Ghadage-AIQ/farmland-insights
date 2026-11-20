import {
  CLUSTER_KEYS,
  clusterLabel,
  clusterScore,
  formatMetricValue,
  formatNumber,
  getMetric,
  gridIdOf,
  hasMetricValue,
  isMetricKey,
  metricsInCluster,
  NO_VALUE,
  type GridAnalysisFeature,
} from '@/domain';
import { ratingOf, type Rating } from '@/features/results';

export interface CellDetailRow {
  readonly label: string;
  readonly value: string;
}

export interface CellDetailGroup {
  readonly key: string;
  readonly title: string;
  /** The area's 0 to 1 score, formatted, or a dash with no data. Null for the "other" group. */
  readonly score: string | null;
  /** How the score reads (good, fair, needs attention), or null where there is no score. */
  readonly rating: Rating | null;
  readonly rows: readonly CellDetailRow[];
}

export interface CellAdvice {
  readonly label: string;
  readonly text: string;
}

export interface CellDetails {
  readonly id: string;
  readonly groups: readonly CellDetailGroup[];
  readonly advice: readonly CellAdvice[];
}

function labelOf(metric: string): string {
  return isMetricKey(metric) ? getMetric(metric).label : metric;
}

/**
 * Everything the map popup shows for one grid cell: each area's score and its parameter values,
 * then the advice that applies. Advice for a parameter the cell has no value for is left out,
 * because the backend sends its "critical" text for missing data (ADR-004).
 */
export function buildCellDetails(cell: GridAnalysisFeature): CellDetails {
  const raw = cell.properties.raw_metrics ?? {};

  const groups: CellDetailGroup[] = CLUSTER_KEYS.map((cluster) => {
    const score = clusterScore(cell, cluster);
    return {
      key: cluster,
      title: clusterLabel(cluster),
      score: score === null ? NO_VALUE : formatNumber(score, 2),
      rating: ratingOf(score),
      rows: metricsInCluster(cluster)
        .filter((metric) => hasMetricValue(cell, metric))
        .map((metric) => ({
          label: getMetric(metric).label,
          value: formatMetricValue(metric, raw[metric]),
        })),
    };
  });

  const other = Object.keys(raw)
    .filter((metric) => !isMetricKey(metric) && hasMetricValue(cell, metric))
    .sort()
    .map((metric) => ({ label: metric, value: formatNumber(raw[metric] ?? Number.NaN, 2) }));
  if (other.length > 0) {
    groups.push({
      key: 'other',
      title: 'Other parameters',
      score: null,
      rating: null,
      rows: other,
    });
  }

  const advice = Object.entries(cell.properties.advisories ?? {})
    .filter(([metric]) => hasMetricValue(cell, metric))
    .map(([metric, text]) => ({ label: labelOf(metric), text }));

  return { id: String(gridIdOf(cell)), groups, advice };
}
