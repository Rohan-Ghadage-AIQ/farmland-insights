// Public surface of the map feature.
//
// MapView and DrawControl are deliberately NOT re-exported directly: importing them statically
// would pull MapLibre and Terra Draw into the initial bundle. Use MapViewLazy / DrawControlLazy.
// Everything exported here is light (pure logic and presentational components).

export { MapViewLazy, DrawControlLazy } from './lazy';
export type { MapViewProps } from './MapView';
export type { DrawControlProps } from './DrawControl';

export { GridOverlay, type GridOverlayProps, type HoverInfo } from './GridOverlay';
export { useMapActions } from './map-context';
export {
  parseCoordinates,
  formatCoordinates,
  type Coordinates,
  type CoordinateParseResult,
} from './coordinates';
export type { MapActions, FitBoundsOptions, CellPointerEvent, LngLat } from './map-actions';

export { Legend, type LegendProps } from './Legend';
export {
  HoverTooltip,
  tooltipPlacement,
  type HoverTooltipProps,
  type TooltipRow,
} from './HoverTooltip';
export {
  LayerSwitcher,
  cycleLayer,
  groupMetricsForPicker,
  toLayerSpec,
  type LayerSelection,
  type LayerSwitcherProps,
  type MetricGroup,
} from './LayerSwitcher';

export { getClusterOptions, getMetricOptions } from './domain-options';
export { buildLegendModel, type LegendInput, type LegendModel } from './legend-model';
export { getLayerModel, getEmptyLayerModel, type LayerModel } from './layer-model';
// Type only: './draw' imports Terra Draw at runtime, which must stay in the lazy chunk.
export type { DrawState } from './draw';
export type { BasemapConfig, BasemapKind } from './basemap';

export type {
  AnalysisResponse,
  Bounds,
  ClusterKey,
  ClusterOption,
  FarmFeatureCollection,
  GridCellFeature,
  LayerSpec,
  MetricOption,
  Theme,
} from './types';
