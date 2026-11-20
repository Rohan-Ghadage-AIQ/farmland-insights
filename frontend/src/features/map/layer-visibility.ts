import { BASEMAP_ID, BASEMAP_LABELS_ID } from './basemap';
import { FILL_OPACITY, LAYER_IDS } from './layers';

/** What the user has switched on or off in the map's layer panel. */
export interface MapLayerState {
  /** The basemap imagery or streets, labels included. */
  readonly basemap: boolean;
  /** The analysis grid cells: fills, outlines, highlights and the click target. */
  readonly grid: boolean;
  /** The farm boundary, both the saved outline and the drawing tool's own polygon. */
  readonly boundary: boolean;
  /** Opacity of the grid fill, 0 to 1. */
  readonly gridOpacity: number;
}

export const DEFAULT_LAYER_STATE: MapLayerState = {
  basemap: true,
  grid: true,
  boundary: true,
  gridOpacity: FILL_OPACITY,
};

export type LayerGroup = 'basemap' | 'grid' | 'boundary';

export const MIN_GRID_OPACITY = 0.2;

const BASEMAP_LAYERS: ReadonlySet<string> = new Set([BASEMAP_ID, BASEMAP_LABELS_ID]);
const GRID_LAYERS: ReadonlySet<string> = new Set([
  LAYER_IDS.gridNoData,
  LAYER_IDS.gridFill,
  LAYER_IDS.gridHit,
  LAYER_IDS.gridOutline,
  LAYER_IDS.highlightCasing,
  LAYER_IDS.highlight,
]);
const BOUNDARY_LAYERS: ReadonlySet<string> = new Set([LAYER_IDS.farmCasing, LAYER_IDS.farmOutline]);
/** The drawing tool (Terra Draw) names every layer it adds `td-...`. */
const DRAW_LAYER_PREFIX = 'td-';

/** Which switch controls a map layer, or null for layers the panel does not manage. */
export function layerGroupOf(layerId: string): LayerGroup | null {
  if (BASEMAP_LAYERS.has(layerId)) return 'basemap';
  if (GRID_LAYERS.has(layerId)) return 'grid';
  if (BOUNDARY_LAYERS.has(layerId) || layerId.startsWith(DRAW_LAYER_PREFIX)) return 'boundary';
  return null;
}

export function clampGridOpacity(value: number): number {
  if (!Number.isFinite(value)) return FILL_OPACITY;
  return Math.min(1, Math.max(MIN_GRID_OPACITY, value));
}

/** The slice of the MapLibre map this module touches, so it can be tested without WebGL. */
export interface LayerStateMap {
  getStyle(): { readonly layers?: readonly { readonly id: string }[] } | undefined;
  getLayer(layerId: string): unknown;
  getLayoutProperty(layerId: string, name: string): unknown;
  setLayoutProperty(layerId: string, name: string, value: string): unknown;
  setPaintProperty(layerId: string, name: string, value: number): unknown;
}

/**
 * Pushes the panel's state onto the map. Safe to call as often as you like: MapLibre ignores a
 * property that already has the wanted value, so it settles after one pass. Layers that do not
 * exist yet (no analysis, drawing tool not started) are simply skipped and picked up by the next
 * call, which the caller makes on every style change.
 */
export function applyLayerState(map: LayerStateMap, state: MapLayerState): void {
  const layers = map.getStyle()?.layers ?? [];
  for (const { id } of layers) {
    const group = layerGroupOf(id);
    if (group === null) continue;
    const wanted = state[group] ? 'visible' : 'none';
    // A layer with no `visibility` set is visible.
    const current = map.getLayoutProperty(id, 'visibility') ?? 'visible';
    if (current !== wanted) map.setLayoutProperty(id, 'visibility', wanted);
  }
  const opacity = clampGridOpacity(state.gridOpacity);
  for (const id of [LAYER_IDS.gridFill, LAYER_IDS.gridNoData]) {
    if (map.getLayer(id) !== undefined) map.setPaintProperty(id, 'fill-opacity', opacity);
  }
}
