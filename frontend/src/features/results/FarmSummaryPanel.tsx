import {
  ATTENTION_THRESHOLD,
  CLUSTERS,
  cellsNeedingAttention,
  farmClusterStats,
  formatCount,
  formatIndex,
  groupAdvisories,
  topAdvisories,
  type GridAnalysisFeature,
  type GridId,
} from '@/domain';
import { EmptyState } from '@/components/ui';
import { AdvisoryList } from './AdvisoryList';
import { ClusterBarChart, type ClusterBarDatum } from './ClusterBarChart';
import { hasAnySatelliteMetric } from './satellite';

export interface FarmSummaryPanelProps {
  readonly cells: readonly GridAnalysisFeature[];
  /** Click-to-highlight on a recommended action. */
  readonly onHighlight?: ((cellIds: readonly GridId[]) => void) | undefined;
}

/**
 * The inspector's default view: the five CPI clusters across the whole farm, how many cells need
 * attention, and the most widespread recommended actions. See docs/FRONTEND_BUILD_PROMPT.md 3.4.
 */
export function FarmSummaryPanel({ cells, onHighlight }: FarmSummaryPanelProps) {
  if (cells.length === 0) {
    return (
      <EmptyState
        title="No cells to summarize"
        description="Run an analysis to see the farm's CPI scores and recommended actions."
      />
    );
  }

  const stats = farmClusterStats(cells);
  const data: ClusterBarDatum[] = CLUSTERS.map(({ key, label }) => ({
    cluster: key,
    label,
    value: stats[key].mean,
    min: stats[key].min,
    max: stats[key].max,
  }));

  const attention = cellsNeedingAttention(cells);
  const grouped = groupAdvisories(cells);
  const top = topAdvisories(grouped);
  const satelliteAvailable = hasAnySatelliteMetric(cells);

  return (
    <div className="flex flex-col gap-6">
      {satelliteAvailable ? null : (
        <div
          role="status"
          className="rounded-panel border border-warning bg-warning-bg p-3 text-base text-warning"
        >
          Satellite data unavailable for this run. Only farm-level weather, if any, came back.
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-md font-semibold text-fg">CPI by cluster</h3>
        <ClusterBarChart data={data} />
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-fg">Cells needing attention</h3>
        <p className="text-base text-fg">
          {formatCount(attention.count)} of {formatCount(attention.total)} cells
        </p>
        <p className="text-sm text-fg-muted">
          A cell needs attention when any CPI cluster with data scores below{' '}
          {formatIndex(ATTENTION_THRESHOLD)}. This is an app heuristic, not a threshold from the
          backend.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-md font-semibold text-fg">Top recommended actions</h3>
        <AdvisoryList
          heading="Top recommended actions"
          items={top}
          noDataItems={grouped.noData}
          onHighlight={onHighlight}
        />
      </section>
    </div>
  );
}
