import type { LegendModel } from './legend-model';

export interface LegendProps {
  readonly model: LegendModel;
}

/** Hatch swatch that mirrors the map's no-data pattern (a diagonal stripe, transparent between). */
const hatch = (color: string): string =>
  `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 6px)`;

/** Presentational legend: a continuous colour bar with min/max, notes, and the no-data entry. */
export function Legend({ model }: LegendProps) {
  const { noData } = model;
  return (
    <div
      role="group"
      aria-label={`Legend: ${model.title}`}
      className="bg-surface text-fg border-border rounded-panel shadow-float w-56 border p-3 text-sm"
    >
      <p className="font-medium">
        {model.title}
        {model.unit === null ? null : (
          <span className="text-fg-muted ml-1 font-normal">{model.unit}</span>
        )}
      </p>

      <div
        data-legend-bar
        aria-hidden="true"
        className="border-border mt-2 h-3 w-full rounded-control border"
        style={{ backgroundImage: model.gradient }}
      />
      <div className="text-fg-muted mt-1 flex justify-between text-xs">
        <span>{model.min}</span>
        {model.midpoint === null ? null : (
          <span data-testid="legend-midpoint">{model.midpoint}</span>
        )}
        <span>{model.max}</span>
      </div>

      {model.clippedNote === null ? null : (
        <p className="text-fg-muted mt-2 text-xs">{model.clippedNote}</p>
      )}
      {model.flatNote === null ? null : (
        <p className="text-fg-muted mt-2 text-xs">{model.flatNote}</p>
      )}

      {noData === null ? null : (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span
            data-testid="legend-no-data-swatch"
            aria-hidden="true"
            className="border-border h-3 w-6 rounded-control border"
            style={{ backgroundImage: hatch(noData.color) }}
          />
          <span>{noData.label}</span>
          <span className="text-fg-muted">{`${String(noData.count)} ${noData.count === 1 ? 'cell' : 'cells'}`}</span>
        </div>
      )}
    </div>
  );
}
