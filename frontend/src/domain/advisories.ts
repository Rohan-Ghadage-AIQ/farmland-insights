import { gridIdOf, hasMetricValue } from './cpi';
import { CLUSTER_KEYS, METRIC_KEYS, getMetric, isMetricKey } from './metrics';
import type { ClusterKey, GridAnalysisFeature, GridId } from './types';

export interface AdvisoryItem {
  metric: string;
  /** Null for a metric the dictionary does not know. */
  cluster: ClusterKey | null;
  text: string;
  cellIds: GridId[];
  /** "Applies to `cellCount` of `totalCells` cells". */
  cellCount: number;
  totalCells: number;
}

export interface AdvisoryClusterGroup {
  cluster: ClusterKey;
  items: AdvisoryItem[];
}

export interface GroupedAdvisories {
  /** Advisories whose metric has a value, grouped by cluster in API order. */
  clusters: AdvisoryClusterGroup[];
  /** Advisories for metrics with a value that the dictionary does not know. */
  other: AdvisoryItem[];
  /** Advisories whose metric has no value: the backend sent its "critical" text for missing data (ADR-004). */
  noData: AdvisoryItem[];
}

function metricOrder(metric: string): number {
  const index = isMetricKey(metric) ? METRIC_KEYS.indexOf(metric) : -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function byCoverage(a: AdvisoryItem, b: AdvisoryItem): number {
  return (
    b.cellCount - a.cellCount ||
    metricOrder(a.metric) - metricOrder(b.metric) ||
    a.metric.localeCompare(b.metric) ||
    a.text.localeCompare(b.text)
  );
}

/** Collects one item per (metric, text) pair, in the order cells are given. */
function collect(
  cells: readonly GridAnalysisFeature[],
  keep: (cell: GridAnalysisFeature, metric: string) => boolean,
): AdvisoryItem[] {
  const items = new Map<string, AdvisoryItem>();
  for (const cell of cells) {
    const id = gridIdOf(cell);
    for (const [metric, text] of Object.entries(cell.properties.advisories ?? {})) {
      if (!keep(cell, metric)) continue;
      const key = JSON.stringify([metric, text]);
      const existing = items.get(key);
      if (existing) {
        existing.cellIds.push(id);
        existing.cellCount += 1;
      } else {
        items.set(key, {
          metric,
          cluster: isMetricKey(metric) ? getMetric(metric).cluster : null,
          text,
          cellIds: [id],
          cellCount: 1,
          totalCells: cells.length,
        });
      }
    }
  }
  return [...items.values()].sort(byCoverage);
}

/**
 * Groups advisories by cluster and de-duplicates the same text across cells.
 * The backend returns the critical action for metrics it had no value for, so those are split
 * off per cell into `noData` and never shown as recommendations.
 */
export function groupAdvisories(cells: readonly GridAnalysisFeature[]): GroupedAdvisories {
  const withValue = collect(cells, hasMetricValue);
  return {
    clusters: CLUSTER_KEYS.map((cluster) => ({
      cluster,
      items: withValue.filter((item) => item.cluster === cluster),
    })),
    other: withValue.filter((item) => item.cluster === null),
    noData: collect(cells, (cell, metric) => !hasMetricValue(cell, metric)),
  };
}

/** The most widespread recommended actions across all clusters, never including no-data advisories. */
export function topAdvisories(
  grouped: GroupedAdvisories,
  limit: number = Number.POSITIVE_INFINITY,
): AdvisoryItem[] {
  return grouped.clusters
    .flatMap((group) => group.items)
    .sort(byCoverage)
    .slice(0, limit);
}
