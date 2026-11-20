import { useEffect } from 'react';
import {
  CLUSTERS,
  clusterScore,
  formatMetricValue,
  gridIdOf,
  groupAdvisories,
  hasMetricValue,
  metricsInCluster,
  getMetric,
  type ClusterKey,
  type GridAnalysisFeature,
} from '@/domain';
import { Badge, Button } from '@/components/ui';
import { ClusterBarChart, type ClusterBarDatum } from './ClusterBarChart';

export interface CellDetailPanelProps {
  readonly cell: GridAnalysisFeature;
  /** The farm mean per cluster, for the reference tick (farmClusterStats, computed by the caller). */
  readonly farmMeans: Record<ClusterKey, number | null>;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
  readonly hasPrevious?: boolean;
  readonly hasNext?: boolean;
}

function listMetricsForCluster(cluster: ClusterKey, cell: GridAnalysisFeature) {
  return metricsInCluster(cluster).filter((key) => hasMetricValue(cell, key));
}

export function CellDetailPanel({
  cell,
  farmMeans,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: CellDetailPanelProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && ['INPUT', 'TEXTAREA'].includes(target.tagName);
      if (typing) return;
      if (event.key === ']') onNext?.();
      else if (event.key === '[') onPrevious?.();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [onNext, onPrevious]);

  const gridId = gridIdOf(cell);
  const cpiData: ClusterBarDatum[] = CLUSTERS.map(({ key, label }) => ({
    cluster: key,
    label,
    value: clusterScore(cell, key),
    referenceValue: farmMeans[key],
  }));

  const rawMetricsPresent = Object.keys(cell.properties.raw_metrics ?? {}).length > 0;
  const grouped = groupAdvisories([cell]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-md font-semibold text-fg">Cell {gridId}</h3>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Previous cell"
          >
            ← Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next cell"
          >
            Next →
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h4 className="text-base font-semibold text-fg">CPI by cluster</h4>
        <ClusterBarChart data={cpiData} referenceLabel="Farm mean" />
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-fg">Raw metrics</h4>
        {rawMetricsPresent ? (
          CLUSTERS.map(({ key, label }) => {
            const keys = listMetricsForCluster(key, cell);
            if (keys.length === 0) return null;
            return (
              <div key={key} className="flex flex-col gap-2">
                <h5 className="text-sm font-medium text-fg-muted">{label}</h5>
                <ul className="flex flex-col gap-1">
                  {keys.map((metricKey) => {
                    const meta = getMetric(metricKey);
                    const value = cell.properties.raw_metrics?.[metricKey];
                    return (
                      <li
                        key={metricKey}
                        className="flex items-center justify-between gap-2 text-base"
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="text-fg">{meta.fullName}</span>
                          <abbr
                            title={meta.fullName}
                            className="cursor-help text-xs text-fg-muted no-underline decoration-dotted"
                          >
                            {meta.label}
                          </abbr>
                          <Badge tone="neutral">
                            {meta.kind === 'measured' ? 'Measured' : 'Derived'}
                          </Badge>
                          {meta.scaleUnverified ? (
                            <abbr
                              title={
                                meta.note ??
                                'The code’s scale does not match this metric’s thresholds.'
                              }
                              className="cursor-help text-xs text-warning no-underline decoration-dotted"
                            >
                              Unverified scale
                            </abbr>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-fg">
                          {formatMetricValue(metricKey, value)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        ) : (
          <p className="text-base text-fg-muted">No raw metrics for this cell.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-base font-semibold text-fg">Advisories</h4>
        {grouped.clusters.every((group) => group.items.length === 0) ? (
          <p className="text-base text-fg-muted">No advisories for this cell.</p>
        ) : (
          grouped.clusters.map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.cluster} className="flex flex-col gap-1">
                  <h5 className="text-sm font-medium text-fg-muted">
                    {CLUSTERS.find((option) => option.key === group.cluster)?.label}
                  </h5>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <li key={`${item.metric}|${item.text}`} className="text-base text-fg">
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )
        )}
        {grouped.noData.length > 0 ? (
          <div role="group" aria-label="No data" className="flex flex-col gap-1 opacity-70">
            <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">No data</p>
            <ul className="flex flex-col gap-1">
              {grouped.noData.map((item) => (
                <li key={`${item.metric}|${item.text}`} className="text-base text-fg-muted">
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
