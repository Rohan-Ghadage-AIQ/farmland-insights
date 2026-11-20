import { formatIndex } from '@/domain';
import type { ClusterKey } from '@/domain';

export interface ClusterBarDatum {
  readonly cluster: ClusterKey;
  readonly label: string;
  /** null means "No data" for this cluster (ADR-003): never shown as a score of 0. */
  readonly value: number | null;
  readonly min?: number | null;
  readonly max?: number | null;
  /** A second value to mark on the same 0..1 track, e.g. the farm mean on a single cell's bar. */
  readonly referenceValue?: number | null;
}

export interface ClusterBarChartProps {
  readonly data: readonly ClusterBarDatum[];
  /** Label for the reference tick, e.g. "Farm mean". Required to explain a referenceValue. */
  readonly referenceLabel?: string;
}

const toPercent = (value: number): string =>
  `${String(Math.round(Math.max(0, Math.min(1, value)) * 100))}%`;

function accessibleName(datum: ClusterBarDatum, referenceLabel: string | undefined): string {
  if (datum.value === null) return `${datum.label}: No data`;
  const parts = [`${datum.label}: ${formatIndex(datum.value)}`];
  if (
    datum.min !== null &&
    datum.min !== undefined &&
    datum.max !== null &&
    datum.max !== undefined
  ) {
    parts.push(`range ${formatIndex(datum.min)} to ${formatIndex(datum.max)}`);
  }
  if (
    datum.referenceValue !== null &&
    datum.referenceValue !== undefined &&
    referenceLabel !== undefined
  ) {
    parts.push(`${referenceLabel} ${formatIndex(datum.referenceValue)}`);
  }
  return parts.join(', ');
}

/**
 * Five horizontal 0..1 bars, one per CPI cluster. In farm-summary mode each bar shows the mean
 * with a min-max whisker; in cell-detail mode it shows the cell's own score with a reference tick
 * for the farm mean. A cluster with no data (ADR-003) renders as a muted "No data" row, never 0.
 */
export function ClusterBarChart({ data, referenceLabel }: ClusterBarChartProps) {
  return (
    <ul aria-label="CPI cluster scores" className="flex flex-col gap-3">
      {data.map((datum) => (
        <li
          key={datum.cluster}
          aria-label={accessibleName(datum, referenceLabel)}
          className="flex flex-col gap-1"
        >
          <div className="flex items-center justify-between gap-2 text-sm text-fg-muted">
            <span>{datum.label}</span>
            {datum.value === null ? (
              <span className="text-fg-muted italic">No data</span>
            ) : (
              <span className="font-medium tabular-nums text-fg">{formatIndex(datum.value)}</span>
            )}
          </div>
          <div className="relative h-2 rounded-full bg-surface-muted" data-testid="cluster-track">
            {datum.value !== null ? (
              <div
                data-testid="cluster-bar-fill"
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: toPercent(datum.value) }}
              />
            ) : null}
            {datum.min !== null && datum.min !== undefined ? (
              <span
                data-testid="cluster-whisker-min"
                aria-hidden="true"
                className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg-muted"
                style={{ left: toPercent(datum.min) }}
              />
            ) : null}
            {datum.max !== null && datum.max !== undefined ? (
              <span
                data-testid="cluster-whisker-max"
                aria-hidden="true"
                className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg-muted"
                style={{ left: toPercent(datum.max) }}
              />
            ) : null}
            {datum.referenceValue !== null && datum.referenceValue !== undefined ? (
              <span
                data-testid="cluster-reference-tick"
                aria-hidden="true"
                className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-fg"
                style={{ left: toPercent(datum.referenceValue) }}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
