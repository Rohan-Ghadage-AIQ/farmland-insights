import { useId, useState } from 'react';
import type { BasemapKind } from './basemap';
import { BasemapToggle } from './BasemapToggle';
import { MIN_GRID_OPACITY, clampGridOpacity, type MapLayerState } from './layer-visibility';

export interface LayerPanelProps {
  readonly state: MapLayerState;
  readonly onChange: (next: MapLayerState) => void;
  readonly basemaps: readonly BasemapKind[];
  readonly basemapKind: BasemapKind;
  readonly onBasemapChange: (kind: BasemapKind) => void;
}

const ROW = 'flex items-center gap-2';
const CHECKBOX = 'accent-accent size-4 shrink-0';

/**
 * The map's layer list: switch the basemap (satellite or streets), the grid cells and the farm
 * boundary on or off, choose which basemap, and fade the grid so the imagery shows through.
 * Presentational: the caller owns the state and applies it to the map.
 */
export function LayerPanel({
  state,
  onChange,
  basemaps,
  basemapKind,
  onBasemapChange,
}: LayerPanelProps) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const opacityPercent = Math.round(clampGridOpacity(state.gridOpacity) * 100);

  return (
    <section
      aria-label="Map layers"
      className="bg-surface text-fg border-border rounded-panel shadow-float w-60 border text-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="hover:bg-surface-muted flex w-full items-center justify-between rounded-panel px-3 py-2 font-medium"
      >
        <span>Layers</span>
        <span aria-hidden="true" className="text-fg-muted">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <div id={bodyId} className="border-border flex flex-col gap-2.5 border-t px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <label className={ROW}>
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={state.basemap}
                onChange={(event) => {
                  onChange({ ...state, basemap: event.target.checked });
                }}
              />
              Basemap (satellite or streets)
            </label>
            <BasemapToggle options={basemaps} value={basemapKind} onChange={onBasemapChange} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={ROW}>
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={state.grid}
                onChange={(event) => {
                  onChange({ ...state, grid: event.target.checked });
                }}
              />
              Grid cells
            </label>
            <label className="text-fg-muted flex items-center gap-2 pl-6 text-xs">
              <span className="w-12 shrink-0">Opacity</span>
              <input
                type="range"
                aria-label="Grid opacity"
                className="accent-accent h-4 min-w-0 flex-1"
                min={Math.round(MIN_GRID_OPACITY * 100)}
                max={100}
                step={5}
                value={opacityPercent}
                disabled={!state.grid}
                onChange={(event) => {
                  onChange({ ...state, gridOpacity: Number(event.target.value) / 100 });
                }}
              />
              <span className="w-9 text-right tabular-nums">{opacityPercent}%</span>
            </label>
          </div>

          <label className={ROW}>
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={state.boundary}
              onChange={(event) => {
                onChange({ ...state, boundary: event.target.checked });
              }}
            />
            Farm boundary
          </label>
        </div>
      ) : null}
    </section>
  );
}
