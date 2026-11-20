import { describe, expect, it } from 'vitest';
import {
  CLUSTERS,
  CLUSTER_KEYS,
  METRIC_KEYS,
  clusterLabel,
  clusterOfMetric,
  getMetric,
  isClusterKey,
  isMetricKey,
  metricsInCluster,
} from './metrics';

// Source of truth: API_CONTRACT.md section 5 (code's CLUSTER_PARAMS).
const CONTRACT_CLUSTERS = {
  Structural: ['ndvi', 'evi', 'savi', 'rvi', 'dprvi', 'dpsvi', 'csi'],
  Chlorophyll: ['gndvi', 'ndre'],
  Water_Drought: [
    'ndmi',
    'ndwi',
    'rsm',
    'swdi',
    'cmi',
    'ai_dm',
    'vci',
    'tci',
    'vhi',
    'nddi',
    'spi',
    'spei',
    'rfdi',
  ],
  Environmental: ['t2m', 'lst', 'rh', 'soil_moist', 'soil_temp'],
  Agro_Meteo: ['crti', 'gdd', 'rwi', 'payout', 'precip', 'et_actual'],
} as const;

describe('clusters', () => {
  it('lists the five clusters in API order with UI labels', () => {
    expect(CLUSTER_KEYS).toEqual([
      'Structural',
      'Chlorophyll',
      'Water_Drought',
      'Environmental',
      'Agro_Meteo',
    ]);
    expect(CLUSTERS.map((c) => c.label)).toEqual([
      'Canopy structure',
      'Chlorophyll',
      'Water & drought',
      'Environment',
      'Agro-meteorology',
    ]);
    expect(clusterLabel('Water_Drought')).toBe('Water & drought');
  });

  it.each(Object.entries(CONTRACT_CLUSTERS))(
    '%s contains exactly the contract metrics',
    (cluster, metrics) => {
      expect(isClusterKey(cluster)).toBe(true);
      if (!isClusterKey(cluster)) return;
      expect([...metricsInCluster(cluster)].sort()).toEqual([...metrics].sort());
    },
  );

  it('type-guards cluster keys', () => {
    expect(isClusterKey('Structural')).toBe(true);
    expect(isClusterKey('structural')).toBe(false);
    expect(isClusterKey('toString')).toBe(false);
  });
});

describe('metric dictionary', () => {
  it('has 33 metrics, including lst, ndwi and rsm, each in exactly one cluster', () => {
    expect(METRIC_KEYS).toHaveLength(33);
    expect(isMetricKey('lst')).toBe(true);
    const seen = new Set<string>();
    for (const key of METRIC_KEYS) {
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(CONTRACT_CLUSTERS[clusterOfMetric(key)] as readonly string[]).toContain(key);
    }
  });

  it('type-guards metric keys', () => {
    expect(isMetricKey('ndvi')).toBe(true);
    expect(isMetricKey('NDVI')).toBe(false);
    expect(isMetricKey('constructor')).toBe(false);
    expect(isMetricKey('unknown_metric')).toBe(false);
  });

  it('gives every metric a short label and a full name', () => {
    for (const key of METRIC_KEYS) {
      const meta = getMetric(key);
      expect(meta.key).toBe(key);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.fullName.length).toBeGreaterThan(0);
    }
    expect(getMetric('ndvi').fullName).toBe('Normalized Difference Vegetation Index');
    expect(getMetric('t2m').fullName).toBe('Air temperature at 2 meters height');
    expect(getMetric('lst').fullName).toBe('Land surface temperature');
    expect(getMetric('ndvi').label).toBe('NDVI');
  });

  it('uses the units the code actually produces (API_CONTRACT section 5)', () => {
    const units = Object.fromEntries(METRIC_KEYS.map((k) => [k, getMetric(k).unit]));
    expect(units).toMatchObject({
      t2m: '°C',
      rh: '%',
      soil_temp: '°C',
      soil_moist: 'm³/m³',
      lst: '°C',
      precip: 'mm/h',
      et_actual: 'mm/h',
      gdd: '°C·days',
      vci: '0–100',
      tci: '0–100',
      vhi: '0–100',
      spi: 'σ',
      spei: 'σ',
      rwi: 'σ',
      crti: 'mm/h·cells',
      payout: '0 or 1',
      ai_dm: 'ratio',
      ndvi: null,
      evi: null,
      savi: null,
      gndvi: null,
      ndre: null,
      ndmi: null,
      ndwi: null,
      rsm: null,
      rvi: null,
      dprvi: null,
      dpsvi: null,
      rfdi: null,
      csi: null,
      swdi: null,
      cmi: null,
      nddi: null,
    });
  });

  it('flags the unverified scales for precip and et_actual only (ADR-006; gdd is now daily)', () => {
    const flagged = METRIC_KEYS.filter((k) => getMetric(k).scaleUnverified);
    expect([...flagged].sort()).toEqual(['et_actual', 'precip']);
  });

  it('marks derived indices as derived and everything else as measured (API_CONTRACT 4.1)', () => {
    const derived = METRIC_KEYS.filter((k) => getMetric(k).kind === 'derived');
    expect([...derived].sort()).toEqual(
      [
        'swdi',
        'cmi',
        'ai_dm',
        'vci',
        'tci',
        'vhi',
        'spi',
        'spei',
        'gdd',
        'crti',
        'rwi',
        'payout',
        'nddi',
      ].sort(),
    );
    expect(getMetric('ndvi').kind).toBe('measured');
    expect(getMetric('t2m').kind).toBe('measured');
  });

  it('separates farm-level (weather broadcast) metrics from per-cell ones (ADR-005)', () => {
    const farmLevel = METRIC_KEYS.filter((k) => getMetric(k).scope === 'farm');
    expect([...farmLevel].sort()).toEqual(
      [
        't2m',
        'rh',
        'precip',
        'soil_moist',
        'soil_temp',
        'et_actual',
        'swdi',
        'cmi',
        'ai_dm',
        'spi',
        'spei',
        'gdd',
        'rwi',
        'payout',
        'crti',
      ].sort(),
    );
    for (const key of ['ndvi', 'lst', 'vci', 'tci', 'vhi', 'rfdi'] as const) {
      expect(getMetric(key).scope).toBe('cell');
    }
  });

  it('uses two decimals for indices and one for physical units, except soil moisture', () => {
    expect(getMetric('ndvi').decimals).toBe(2);
    expect(getMetric('spi').decimals).toBe(2);
    expect(getMetric('t2m').decimals).toBe(1);
    expect(getMetric('precip').decimals).toBe(1);
    expect(getMetric('gdd').decimals).toBe(1);
    // m3/m3 values sit in 0..1; one decimal would hide real differences.
    expect(getMetric('soil_moist').decimals).toBe(2);
  });
});
