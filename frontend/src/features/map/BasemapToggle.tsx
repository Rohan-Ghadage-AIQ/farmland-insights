import type { BasemapKind } from './basemap';

const LABELS: Record<BasemapKind, string> = {
  streets: 'Streets',
  satellite: 'Satellite',
  hybrid: 'Hybrid',
};

export interface BasemapToggleProps {
  readonly options: readonly BasemapKind[];
  readonly value: BasemapKind;
  readonly onChange: (kind: BasemapKind) => void;
}

/** A small segmented control. Renders nothing when there is only one basemap to choose from. */
export function BasemapToggle({ options, value, onChange }: BasemapToggleProps) {
  if (options.length < 2) return null;
  return (
    <div
      role="group"
      aria-label="Basemap"
      className="bg-surface border-border flex overflow-hidden rounded-control border text-sm shadow-float"
    >
      {options.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={kind === value}
          onClick={() => {
            onChange(kind);
          }}
          className={
            kind === value
              ? 'bg-accent text-accent-fg px-3 py-1.5'
              : 'text-fg hover:bg-surface-muted px-3 py-1.5'
          }
        >
          {LABELS[kind]}
        </button>
      ))}
    </div>
  );
}
