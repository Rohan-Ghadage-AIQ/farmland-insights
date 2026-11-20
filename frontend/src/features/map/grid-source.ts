import type { AnalysisResponse, FarmGeometry, GridCellFeature, LayerSpec } from './types';

/** The feature property MapLibre promotes to the feature id, so `setFeatureState` can target cells. */
export const GRID_PROMOTE_ID = 'gridId';

// `CellValue` is a `type` alias, not an interface: only aliases are assignable to GeoJSON's open
// (index-signature) `properties` type. The feature arrays are mutable for a similar reason:
// MapLibre's GeoJSON types do not accept readonly ones.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- see comment above
export type CellValue = {
  readonly gridId: string | number;
  /** The number painted for the active layer, or null when the cell has no data for it. */
  readonly value: number | null;
  readonly noData: boolean;
};

export interface GridFeature {
  readonly type: 'Feature';
  readonly geometry: FarmGeometry;
  readonly properties: CellValue;
}

export interface GridFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: GridFeature[];
}

export interface GridLayerData {
  readonly geojson: GridFeatureCollection;
  /** Finite values only, in cell order. Feed this to the domain functions. */
  readonly values: readonly number[];
  readonly cellCount: number;
  readonly noDataCount: number;
  /** O(1) lookup by `String(gridId)`, used by hover so it never re-scans the response. */
  readonly byId: ReadonlyMap<string, CellValue>;
}

/** Stable identity of a layer, used as a cache key. */
export function layerKey(layer: LayerSpec): string {
  return layer.kind === 'cpi' ? `cpi:${layer.cluster}` : `metric:${layer.metric}`;
}

const readMetric = (
  metrics: Readonly<Record<string, number>> | undefined,
  key: string,
): number | null => {
  if (metrics === undefined || !Object.hasOwn(metrics, key)) return null;
  const value = metrics[key];
  return value !== undefined && Number.isFinite(value) ? value : null;
};

/**
 * The value a cell contributes to a layer, or null for "No data".
 *
 * The backend fills missing CPI scores with 0.0, so a score alone cannot tell "critical" from
 * "no data". A CPI cluster only has data when the cell carries at least one of that cluster's raw
 * metrics (API_CONTRACT D4 / ADR-003). With no known metric keys we cannot verify, so it is no-data.
 */
export function computeCellValue(
  properties: GridCellFeature['properties'],
  layer: LayerSpec,
): number | null {
  if (layer.kind === 'metric') {
    return readMetric(properties.raw_metrics, layer.metric);
  }
  const hasClusterData = layer.clusterMetricKeys.some(
    (key) => readMetric(properties.raw_metrics, key) !== null,
  );
  if (!hasClusterData) return null;
  const score = properties.cpi_scores[layer.cluster];
  return Number.isFinite(score) ? score : null;
}

/** Converts an analysis response to the GeoJSON the map source needs, for one layer. */
export function buildGridLayerData(response: AnalysisResponse, layer: LayerSpec): GridLayerData {
  const features: GridFeature[] = [];
  const values: number[] = [];
  const byId = new Map<string, CellValue>();
  let noDataCount = 0;

  for (const cell of response.features) {
    const value = computeCellValue(cell.properties, layer);
    const properties: CellValue = {
      gridId: cell.properties.grid_id,
      value,
      noData: value === null,
    };
    if (value === null) noDataCount += 1;
    else values.push(value);
    byId.set(String(properties.gridId), properties);
    features.push({ type: 'Feature', geometry: cell.geometry, properties });
  }

  return {
    geojson: { type: 'FeatureCollection', features },
    values,
    cellCount: features.length,
    noDataCount,
    byId,
  };
}

// Keyed by response identity so a new analysis frees the old entries automatically.
const cache = new WeakMap<AnalysisResponse, Map<string, GridLayerData>>();

/**
 * Memoised `buildGridLayerData`. The layer values are computed once per response and layer; hover
 * and selection only touch feature-state and the `byId` lookup, never this.
 */
export function getGridLayerData(response: AnalysisResponse, layer: LayerSpec): GridLayerData {
  const key = layerKey(layer);
  let perLayer = cache.get(response);
  if (perLayer === undefined) {
    perLayer = new Map();
    cache.set(response, perLayer);
  }
  let data = perLayer.get(key);
  if (data === undefined) {
    data = buildGridLayerData(response, layer);
    perLayer.set(key, data);
  }
  return data;
}
