import type { ClusterKey, ClusterOption, LayerSpec, MetricKey, MetricOption } from './types';

/** What the user picked. Convert to a `LayerSpec` with `toLayerSpec` before painting. */
export type LayerSelection =
  | { readonly kind: 'cpi'; readonly cluster: ClusterKey }
  | { readonly kind: 'metric'; readonly metric: MetricKey };

export interface MetricGroup {
  readonly label: string;
  readonly metrics: readonly MetricOption[];
}

/**
 * Raw metrics grouped by cluster, and within each cluster split into "Varies by cell" and
 * "Farm-level" (the same value in every cell). Per-cell metrics come first because they make
 * useful maps. Empty groups are dropped.
 */
export function groupMetricsForPicker(
  clusters: readonly ClusterOption[],
  metrics: readonly MetricOption[],
): MetricGroup[] {
  const groups: MetricGroup[] = [];
  for (const cluster of clusters) {
    const inCluster = metrics.filter((m) => m.cluster === cluster.key);
    const cell = inCluster.filter((m) => m.scope === 'cell');
    const farm = inCluster.filter((m) => m.scope === 'farm');
    if (cell.length > 0)
      groups.push({ label: `${cluster.label} Â· Varies by cell`, metrics: cell });
    if (farm.length > 0) groups.push({ label: `${cluster.label} Â· Farm-level`, metrics: farm });
  }
  return groups;
}

/** Adds the cluster's metric keys, which the "No data" rule needs. */
export function toLayerSpec(
  selection: LayerSelection,
  clusters: readonly ClusterOption[],
): LayerSpec {
  if (selection.kind === 'metric') return { kind: 'metric', metric: selection.metric };
  const cluster = clusters.find((c) => c.key === selection.cluster);
  return { kind: 'cpi', cluster: selection.cluster, clusterMetricKeys: cluster?.metricKeys ?? [] };
}

/** The `L` shortcut: CPI clusters, then per-cell metrics, then back to the start. */
export function cycleLayer(
  current: LayerSelection,
  clusters: readonly ClusterOption[],
  metrics: readonly MetricOption[],
): LayerSelection {
  const sequence: LayerSelection[] = [
    ...clusters.map((c): LayerSelection => ({ kind: 'cpi', cluster: c.key })),
    ...metrics
      .filter((m) => m.scope === 'cell')
      .map((m): LayerSelection => ({ kind: 'metric', metric: m.key })),
  ];
  const index = sequence.findIndex((s) =>
    s.kind === 'cpi'
      ? current.kind === 'cpi' && current.cluster === s.cluster
      : current.kind === 'metric' && current.metric === s.metric,
  );
  return sequence[(index + 1) % sequence.length] ?? current;
}

export interface LayerSwitcherProps {
  readonly clusters: readonly ClusterOption[];
  readonly metrics: readonly MetricOption[];
  readonly value: LayerSelection;
  readonly onChange: (selection: LayerSelection) => void;
}

const SEGMENT_ON = 'bg-accent text-accent-fg px-3 py-1.5';
const SEGMENT_OFF = 'text-fg hover:bg-surface-muted px-3 py-1.5';
const SELECT_CLASS =
  'bg-surface text-fg border-border rounded-control mt-1 w-full border px-2 py-1.5 text-sm';

const optionLabel = (metric: MetricOption): string =>
  metric.unit === '' ? metric.label : `${metric.label} (${metric.unit})`;

/** Picks what the grid shows: a CPI cluster, or a raw metric grouped by cluster. */
export function LayerSwitcher({ clusters, metrics, value, onChange }: LayerSwitcherProps) {
  const groups = groupMetricsForPicker(clusters, metrics);
  const firstMetric = groups[0]?.metrics[0] ?? metrics[0];
  const selectedMetric =
    value.kind === 'metric' ? metrics.find((m) => m.key === value.metric) : undefined;

  const chooseCpi = (): void => {
    if (value.kind === 'cpi') return;
    const cluster = selectedMetric?.cluster ?? clusters[0]?.key;
    if (cluster !== undefined) onChange({ kind: 'cpi', cluster });
  };

  const chooseMetric = (): void => {
    if (value.kind === 'metric' || firstMetric === undefined) return;
    onChange({ kind: 'metric', metric: firstMetric.key });
  };

  return (
    <div
      role="group"
      aria-label="Map layer"
      className="bg-surface border-border rounded-panel shadow-float w-64 border p-3 text-sm"
    >
      <div className="border-border rounded-control flex overflow-hidden border">
        <button
          type="button"
          aria-pressed={value.kind === 'cpi'}
          onClick={chooseCpi}
          className={value.kind === 'cpi' ? SEGMENT_ON : SEGMENT_OFF}
        >
          CPI
        </button>
        <button
          type="button"
          aria-pressed={value.kind === 'metric'}
          onClick={chooseMetric}
          disabled={firstMetric === undefined}
          className={value.kind === 'metric' ? SEGMENT_ON : SEGMENT_OFF}
        >
          Raw metric
        </button>
      </div>

      {value.kind === 'cpi' ? (
        <label className="mt-3 block">
          <span className="text-fg-muted text-xs">Cluster</span>
          <select
            className={SELECT_CLASS}
            value={value.cluster}
            onChange={(event) => {
              const cluster = clusters.find((c) => c.key === event.target.value);
              if (cluster !== undefined) onChange({ kind: 'cpi', cluster: cluster.key });
            }}
          >
            {clusters.map((cluster) => (
              <option key={cluster.key} value={cluster.key}>
                {cluster.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="text-fg-muted text-xs">Metric</span>
            <select
              className={SELECT_CLASS}
              value={value.metric}
              onChange={(event) => {
                const picked = metrics.find((m) => m.key === event.target.value);
                if (picked !== undefined) onChange({ kind: 'metric', metric: picked.key });
              }}
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.metrics.map((metric) => (
                    <option key={metric.key} value={metric.key}>
                      {optionLabel(metric)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {selectedMetric?.scope === 'farm' ? (
            <p className="text-fg-muted mt-2 text-xs">
              Same for every cell. Weather is measured at the farm centre.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
