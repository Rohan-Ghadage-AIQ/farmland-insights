import type { GeoJSONSourceSpecification } from 'maplibre-gl';
import type {
  ClusterKey,
  FarmAnalysisResponse,
  FarmFeature,
  FarmFeatureCollection,
  GridAnalysisFeature,
  MetricKey,
} from '@/domain';

/** A GeoJSON FeatureCollection as MapLibre accepts it (mutable arrays, `properties` required). */
export type GeoJsonCollection = Extract<
  Exclude<GeoJSONSourceSpecification['data'], string>,
  { type: 'FeatureCollection' }
>;

/** UI theme. The basemap and the data colour scales both follow it. */
export type Theme = 'light' | 'dark';

/** Response and cluster types come from the domain layer, so the map and the rest of the app agree. */
export type AnalysisResponse = FarmAnalysisResponse;
export type GridCellFeature = GridAnalysisFeature;
export type FarmGeometry = FarmFeature['geometry'];
export type { ClusterKey, FarmFeature, FarmFeatureCollection, MetricKey };

/** `[west, south, east, north]` */
export type Bounds = readonly [number, number, number, number];

/**
 * What the grid layer paints. Cluster membership is passed in (see `domain-options.ts` for the
 * real dictionary) so the layer code stays testable with tiny fixtures.
 */
export type LayerSpec =
  | {
      readonly kind: 'cpi';
      readonly cluster: ClusterKey;
      /** Every raw-metric key that belongs to the cluster; used to detect "No data". */
      readonly clusterMetricKeys: readonly MetricKey[];
    }
  | {
      readonly kind: 'metric';
      readonly metric: MetricKey;
    };

/** Metric metadata supplied by the caller (from `src/domain`), as props. */
export interface MetricOption {
  readonly key: MetricKey;
  readonly label: string;
  /** Empty string when the metric has no unit. */
  readonly unit: string;
  /** Decimal places the legend and tooltip should show; defaults to 2 when omitted. */
  readonly decimals?: number;
  readonly cluster: ClusterKey;
  /** `cell` metrics vary per grid cell; `farm` metrics are one value broadcast to every cell. */
  readonly scope: 'cell' | 'farm';
}

export interface ClusterOption {
  readonly key: ClusterKey;
  readonly label: string;
  /** Raw-metric keys in this cluster, for the "No data" rule. */
  readonly metricKeys: readonly MetricKey[];
}
