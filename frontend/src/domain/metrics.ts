import type { ClusterKey } from './types';

/**
 * Metric dictionary. Encodes what the backend code actually does (API_CONTRACT section 5, ADR-001),
 * not what the docs say. If the backend changes, change this file and API_CONTRACT together.
 */

const CLUSTER_LABELS: Readonly<Record<ClusterKey, string>> = {
  Structural: 'Canopy structure',
  Chlorophyll: 'Chlorophyll',
  Water_Drought: 'Water & drought',
  Environmental: 'Environment',
  Agro_Meteo: 'Agro-meteorology',
};

/** In the order the API and the UI list them. */
export const CLUSTER_KEYS: readonly ClusterKey[] = [
  'Structural',
  'Chlorophyll',
  'Water_Drought',
  'Environmental',
  'Agro_Meteo',
];

export const CLUSTERS: readonly { key: ClusterKey; label: string }[] = CLUSTER_KEYS.map((key) => ({
  key,
  label: CLUSTER_LABELS[key],
}));

export function isClusterKey(value: string): value is ClusterKey {
  return CLUSTER_KEYS.some((key) => key === value);
}

export function clusterLabel(cluster: ClusterKey): string {
  return CLUSTER_LABELS[cluster];
}

export interface MetricMeta {
  key: MetricKey;
  /** Short label for tight spaces, usually the abbreviation. */
  label: string;
  /** Full name from the documentation's Parameter Reference (lst is not documented there). */
  fullName: string;
  cluster: ClusterKey;
  /** Unit as the code produces it; null for unitless indices. */
  unit: string | null;
  /** `derived` metrics are computed server-side from other metrics (API_CONTRACT 4.1). */
  kind: 'measured' | 'derived';
  /** `farm`: the same value in every cell (weather at the farm centroid). `cell`: varies per cell (ADR-005). */
  scope: 'farm' | 'cell';
  /** The code's scale does not match the metric's thresholds (ADR-006, BACKEND_REQUESTS #4). */
  scaleUnverified: boolean;
  /** Decimal places to display. */
  decimals: 0 | 1 | 2;
  /** Extra caveat shown with the metric, when the contract has one. */
  note?: string;
}

type Spec = Omit<MetricMeta, 'key' | 'scaleUnverified' | 'decimals'> & {
  scaleUnverified?: true;
  decimals?: 0 | 1 | 2;
};

const SPECS = {
  // Structural
  ndvi: {
    label: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  evi: {
    label: 'EVI',
    fullName: 'Enhanced Vegetation Index',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  savi: {
    label: 'SAVI',
    fullName: 'Soil Adjusted Vegetation Index',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  rvi: {
    label: 'RVI',
    fullName: 'Radar Vegetation Index (SAR)',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  dprvi: {
    label: 'DpRVI',
    fullName: 'Dual-Pol Radar Vegetation Index (SAR)',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  dpsvi: {
    label: 'DpSVI',
    fullName: 'Dual-Pol SAR Vegetation Index',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  csi: {
    label: 'CSI',
    fullName: 'Cross-pol Scattering Index (SAR)',
    cluster: 'Structural',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  // Chlorophyll
  gndvi: {
    label: 'GNDVI',
    fullName: 'Green Normalized Difference Vegetation Index',
    cluster: 'Chlorophyll',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  ndre: {
    label: 'NDRE',
    fullName: 'Normalized Difference Red Edge Index',
    cluster: 'Chlorophyll',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  // Water and drought
  ndmi: {
    label: 'NDMI',
    fullName: 'Normalized Difference Moisture Index',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  ndwi: {
    label: 'NDWI',
    fullName: 'Normalized Difference Water Index',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'measured',
    scope: 'cell',
    note: '(Green − NIR) / (Green + NIR): standing water on the surface.',
  },
  ndwi_farmonaut: {
    label: 'Farmonaut NDWI',
    fullName: 'Normalized Difference Water Index, as Farmonaut reports it',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'measured',
    scope: 'cell',
    note: '(NIR − SWIR2) / (NIR + SWIR2), Sentinel-2 B8 and B12: water held in the crop.',
  },
  rsm: {
    label: 'RSM',
    fullName: 'Radar Soil Moisture (relative, SAR)',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'measured',
    scope: 'cell',
    note: "0 is the field's driest and 1 its wettest radar response over the past year; not a volumetric reading.",
  },
  swdi: {
    label: 'SWDI',
    fullName: 'Soil Water Deficit Index',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'derived',
    scope: 'farm',
    note: 'Assumes a field capacity of 0.5.',
  },
  cmi: {
    label: 'CMI',
    fullName: 'Crop Moisture Index',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'derived',
    scope: 'farm',
  },
  ai_dm: {
    label: 'AI (DM)',
    fullName: 'Aridity Index (De Martonne)',
    cluster: 'Water_Drought',
    unit: 'ratio',
    kind: 'derived',
    scope: 'farm',
  },
  vci: {
    label: 'VCI',
    fullName: 'Vegetation Condition Index',
    cluster: 'Water_Drought',
    unit: '0–100',
    kind: 'derived',
    scope: 'cell',
    decimals: 1,
    note: 'Relative to this farm only (its own min and max), not absolute.',
  },
  tci: {
    label: 'TCI',
    fullName: 'Temperature Condition Index',
    cluster: 'Water_Drought',
    unit: '0–100',
    kind: 'derived',
    scope: 'cell',
    decimals: 1,
    note: 'Relative to this farm only (its own min and max), not absolute.',
  },
  vhi: {
    label: 'VHI',
    fullName: 'Vegetation Health Index',
    cluster: 'Water_Drought',
    unit: '0–100',
    kind: 'derived',
    scope: 'cell',
    decimals: 1,
    note: 'Relative to this farm only (its own min and max), not absolute.',
  },
  nddi: {
    label: 'NDDI',
    fullName: 'Normalized Difference Drought Index',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'derived',
    scope: 'cell',
    note: 'The backend does not produce this metric today.',
  },
  spi: {
    label: 'SPI',
    fullName: 'Standardized Precipitation Index',
    cluster: 'Water_Drought',
    unit: 'σ',
    kind: 'derived',
    scope: 'farm',
    note: 'Missing when climatology is unavailable.',
  },
  spei: {
    label: 'SPEI',
    fullName: 'Standardized Precipitation Evapotranspiration Index',
    cluster: 'Water_Drought',
    unit: 'σ',
    kind: 'derived',
    scope: 'farm',
    note: 'Missing when climatology is unavailable.',
  },
  rfdi: {
    label: 'RFDI',
    fullName: 'Radar Forest Degradation Index (SAR)',
    cluster: 'Water_Drought',
    unit: null,
    kind: 'measured',
    scope: 'cell',
  },
  // Environmental
  t2m: {
    label: 'Air temp',
    fullName: 'Air temperature at 2 meters height',
    cluster: 'Environmental',
    unit: '°C',
    kind: 'measured',
    scope: 'farm',
    decimals: 1,
  },
  lst: {
    label: 'LST',
    fullName: 'Land surface temperature',
    cluster: 'Environmental',
    unit: '°C',
    kind: 'measured',
    scope: 'cell',
    decimals: 1,
  },
  rh: {
    label: 'Humidity',
    fullName: 'Relative humidity',
    cluster: 'Environmental',
    unit: '%',
    kind: 'measured',
    scope: 'farm',
    decimals: 1,
  },
  // m3/m3 values live in 0..1, so one decimal would hide real differences.
  soil_moist: {
    label: 'Soil moisture',
    fullName: 'Volumetric soil moisture content',
    cluster: 'Environmental',
    unit: 'm³/m³',
    kind: 'measured',
    scope: 'farm',
  },
  soil_temp: {
    label: 'Soil temp',
    fullName: 'Soil temperature (2-4 inch depth)',
    cluster: 'Environmental',
    unit: '°C',
    kind: 'measured',
    scope: 'farm',
    decimals: 1,
  },
  // Agro-meteorology
  crti: {
    label: 'CRTI',
    fullName: 'Cumulative Rainfall-Temperature Index',
    cluster: 'Agro_Meteo',
    unit: 'mm/h·cells',
    kind: 'derived',
    scope: 'farm',
    decimals: 1,
    note: 'Sum of precipitation over all cells, so it scales with cell count and is not meaningful per cell.',
  },
  gdd: {
    label: 'GDD',
    fullName: 'Growing Degree Days',
    cluster: 'Agro_Meteo',
    unit: '°C·days',
    kind: 'derived',
    scope: 'farm',
    decimals: 1,
  },
  rwi: {
    label: 'RWI',
    fullName: 'Relative Weather Index',
    cluster: 'Agro_Meteo',
    unit: 'σ',
    kind: 'derived',
    scope: 'farm',
    note: 'Missing when climatology is unavailable.',
  },
  payout: {
    label: 'Payout',
    fullName: 'Index Insurance Payout Trigger',
    cluster: 'Agro_Meteo',
    unit: '0 or 1',
    kind: 'derived',
    scope: 'farm',
    decimals: 0,
  },
  precip: {
    label: 'Precipitation',
    fullName: 'Total cumulative precipitation',
    cluster: 'Agro_Meteo',
    unit: 'mm/h',
    kind: 'measured',
    scope: 'farm',
    decimals: 1,
    scaleUnverified: true,
    note: 'Hourly mean, while the thresholds expect a season total.',
  },
  et_actual: {
    label: 'Evapotranspiration',
    fullName: 'Actual Evapotranspiration (water loss from soil and plant)',
    cluster: 'Agro_Meteo',
    unit: 'mm/h',
    kind: 'measured',
    scope: 'farm',
    decimals: 1,
    scaleUnverified: true,
    note: 'Hourly mean, while the thresholds expect mm per day.',
  },
} as const satisfies Record<string, Spec>;

export type MetricKey = keyof typeof SPECS;

export const METRIC_KEYS = Object.keys(SPECS) as MetricKey[];

const METRICS: Readonly<Record<MetricKey, MetricMeta>> = Object.fromEntries(
  METRIC_KEYS.map((key) => {
    const spec: Spec = SPECS[key];
    const meta: MetricMeta = {
      ...spec,
      key,
      scaleUnverified: spec.scaleUnverified ?? false,
      decimals: spec.decimals ?? 2,
    };
    return [key, meta];
  }),
) as Record<MetricKey, MetricMeta>;

export function isMetricKey(value: string): value is MetricKey {
  return Object.hasOwn(METRICS, value);
}

export function getMetric(key: MetricKey): MetricMeta {
  return METRICS[key];
}

export function clusterOfMetric(key: MetricKey): ClusterKey {
  return METRICS[key].cluster;
}

export function metricsInCluster(cluster: ClusterKey): MetricKey[] {
  return METRIC_KEYS.filter((key) => METRICS[key].cluster === cluster);
}
