import type {
  ExpressionSpecification,
  FillLayerSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';
import {
  colorAt,
  getNoDataPattern,
  sampleScale,
  type ColorScale,
  type ValueDomain,
} from './color-scales';
import { GRID_PROMOTE_ID } from './grid-source';
import type { FarmFeatureCollection, GeoJsonCollection, Theme } from './types';

type FeatureCollection = GeoJsonCollection;

/**
 * Pure builders for the MapLibre sources and layers. They return plain style objects and never
 * touch a map, so they are testable without WebGL. Layers are installed once and then updated
 * with `setPaintProperty`, `setData` and `setFeatureState`; they are never re-created.
 */

export const GRID_SOURCE_ID = 'grid';
export const FARM_SOURCE_ID = 'farm';

export const LAYER_IDS = {
  gridNoData: 'grid-no-data',
  gridFill: 'grid-fill',
  gridHit: 'grid-hit',
  gridOutline: 'grid-outline',
  farmCasing: 'farm-casing',
  farmOutline: 'farm-outline',
  highlightCasing: 'grid-highlight-casing',
  highlight: 'grid-highlight',
} as const;

// A function, not a shared constant: MapLibre's GeoJSON types want mutable arrays.
const emptyCollection = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export const GRID_SOURCE_SPEC: GeoJSONSourceSpecification = {
  type: 'geojson',
  data: emptyCollection(),
  promoteId: GRID_PROMOTE_ID,
};

export const FARM_SOURCE_SPEC: GeoJSONSourceSpecification = {
  type: 'geojson',
  data: emptyCollection(),
};

/** The farm outline as source data. GeoJSON requires `properties`, which the API type makes optional. */
export function farmToGeoJson(farm: FarmFeatureCollection | null): FeatureCollection {
  if (farm === null) return emptyCollection();
  return {
    type: 'FeatureCollection',
    features: farm.features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: feature.properties ?? {},
    })),
  };
}

/**
 * Cells are fully opaque: the 3:1 mark-to-basemap contrast guarantee in DESIGN.md is computed for
 * opaque fills, and translucency would let busy basemap detail change the perceived value.
 */
export const FILL_OPACITY = 1;

/** Colour stops are densified so MapLibre's RGB interpolation stays close to the Lab ramp. */
const EXPRESSION_STEPS = 17;

/**
 * `fill-color` for the active layer. A flat domain gets one colour (a gradient over one value
 * would suggest variation that is not there).
 */
export function buildFillColor(
  scale: ColorScale,
  domain: ValueDomain,
): string | ExpressionSpecification {
  if (domain.flat || domain.max === domain.min) return colorAt(scale, 0.5);
  const colors = sampleScale(scale, EXPRESSION_STEPS);
  const span = domain.max - domain.min;
  const stops = colors.flatMap((color, i): (number | string)[] => [
    domain.min + (span * i) / (EXPRESSION_STEPS - 1),
    color,
  ]);
  return [
    'interpolate',
    ['linear'],
    ['to-number', ['get', 'value'], domain.min],
    ...stops,
  ] as ExpressionSpecification;
}

export function buildGridFillLayer(scale: ColorScale, domain: ValueDomain): FillLayerSpecification {
  return {
    id: LAYER_IDS.gridFill,
    type: 'fill',
    source: GRID_SOURCE_ID,
    filter: ['==', ['get', 'noData'], false],
    paint: {
      'fill-color': buildFillColor(scale, domain),
      'fill-opacity': FILL_OPACITY,
      // Antialiased polygon edges leave hairline seams between neighbouring cells.
      'fill-antialias': false,
    },
  };
}

export function buildGridNoDataLayer(patternImageId: string): FillLayerSpecification {
  return {
    id: LAYER_IDS.gridNoData,
    type: 'fill',
    source: GRID_SOURCE_ID,
    filter: ['==', ['get', 'noData'], true],
    paint: { 'fill-pattern': patternImageId, 'fill-opacity': 1 },
  };
}

/**
 * Invisible layer over every cell. Pointer events bind to this one layer, so moving between a
 * data cell and a no-data cell never produces a spurious mouseleave from a second layer.
 */
export function buildGridHitLayer(): FillLayerSpecification {
  return {
    id: LAYER_IDS.gridHit,
    type: 'fill',
    source: GRID_SOURCE_ID,
    paint: { 'fill-opacity': 0 },
  };
}

export function buildGridOutlineLayer(theme: Theme): LineLayerSpecification {
  return {
    id: LAYER_IDS.gridOutline,
    type: 'line',
    source: GRID_SOURCE_ID,
    paint: {
      'line-color': theme === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(11,18,32,0.55)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.25, 17, 1.25],
    },
  };
}

const FARM_STROKE: Record<Theme, { readonly line: string; readonly casing: string }> = {
  light: { line: '#111827', casing: '#ffffff' },
  dark: { line: '#ffffff', casing: '#0b1220' },
};

/** Farm boundary: a stroke plus a contrasting casing, so it reads on any cell colour. */
export function buildFarmOutlineLayers(
  theme: Theme,
): [LineLayerSpecification, LineLayerSpecification] {
  const { line, casing } = FARM_STROKE[theme];
  const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
  return [
    {
      id: LAYER_IDS.farmCasing,
      type: 'line',
      source: FARM_SOURCE_ID,
      layout,
      paint: { 'line-color': casing, 'line-width': 5 },
    },
    {
      id: LAYER_IDS.farmOutline,
      type: 'line',
      source: FARM_SOURCE_ID,
      layout,
      paint: { 'line-color': line, 'line-width': 2.5 },
    },
  ];
}

const featureFlag = (name: 'selected' | 'highlight' | 'hover'): ExpressionSpecification => [
  'boolean',
  ['feature-state', name],
  false,
];

const stateWidth = (
  selected: number,
  highlight: number,
  hover: number,
): ExpressionSpecification => [
  'case',
  featureFlag('selected'),
  selected,
  featureFlag('highlight'),
  highlight,
  featureFlag('hover'),
  hover,
  0,
];

/**
 * Hover, selection and "applies to these cells" highlights. Driven entirely by feature-state, so
 * changing them is a cheap per-feature update that never re-evaluates cell values. A dark casing
 * under a white line reads on every fill colour and on both themes.
 */
export function buildHighlightLayers(): [LineLayerSpecification, LineLayerSpecification] {
  const layout = { 'line-join': 'round' } as const;
  return [
    {
      id: LAYER_IDS.highlightCasing,
      type: 'line',
      source: GRID_SOURCE_ID,
      layout,
      paint: { 'line-color': '#111827', 'line-width': stateWidth(6, 4.5, 4) },
    },
    {
      id: LAYER_IDS.highlight,
      type: 'line',
      source: GRID_SOURCE_ID,
      layout,
      paint: { 'line-color': '#ffffff', 'line-width': stateWidth(3.5, 2.5, 2) },
    },
  ];
}

export interface GridLayersOptions {
  readonly theme: Theme;
  readonly scale: ColorScale;
  readonly domain: ValueDomain;
}

/** Every grid and farm layer in paint order, bottom first. */
export function buildGridLayers({ theme, scale, domain }: GridLayersOptions): LayerSpecification[] {
  return [
    buildGridNoDataLayer(getNoDataPattern(theme).id),
    buildGridFillLayer(scale, domain),
    buildGridHitLayer(),
    buildGridOutlineLayer(theme),
    ...buildFarmOutlineLayers(theme),
    ...buildHighlightLayers(),
  ];
}
