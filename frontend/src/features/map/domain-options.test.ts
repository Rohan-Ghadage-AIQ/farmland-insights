import { describe, expect, it } from 'vitest';
import { CLUSTER_KEYS, METRIC_KEYS, getMetric, metricsInCluster } from '@/domain';
import { groupMetricsForPicker, toLayerSpec } from './LayerSwitcher';
import { getClusterOptions, getMetricOptions } from './domain-options';

describe('getClusterOptions', () => {
  it('lists every domain cluster in domain order', () => {
    expect(getClusterOptions().map((c) => c.key)).toEqual([...CLUSTER_KEYS]);
  });

  it('carries the domain label and the metric keys of the cluster', () => {
    const water = getClusterOptions().find((c) => c.key === 'Water_Drought');
    expect(water?.label).toBe('Water & drought');
    expect(water?.metricKeys).toEqual(metricsInCluster('Water_Drought'));
  });

  it('is stable between calls so React props do not churn', () => {
    expect(getClusterOptions()).toBe(getClusterOptions());
  });
});

describe('getMetricOptions', () => {
  it('lists every domain metric', () => {
    expect(getMetricOptions().map((m) => m.key)).toEqual([...METRIC_KEYS]);
  });

  it('mirrors the domain label, cluster and scope', () => {
    const swdi = getMetricOptions().find((m) => m.key === 'swdi');
    expect(swdi).toMatchObject({ label: 'SWDI', cluster: 'Water_Drought', scope: 'farm' });
  });

  it('turns a unitless metric into an empty unit string and keeps real units', () => {
    const options = getMetricOptions();
    expect(options.find((m) => m.key === 'ndvi')?.unit).toBe('');
    expect(options.find((m) => m.key === 't2m')?.unit).toBe('°C');
  });

  it('carries the decimals the domain wants shown', () => {
    const options = getMetricOptions();
    expect(options.find((m) => m.key === 'ndvi')?.decimals).toBe(getMetric('ndvi').decimals);
    expect(options.find((m) => m.key === 'payout')?.decimals).toBe(0);
  });

  it('is stable between calls', () => {
    expect(getMetricOptions()).toBe(getMetricOptions());
  });
});

describe('domain options with the layer helpers', () => {
  it('groups every metric under a cluster heading, none dropped', () => {
    const groups = groupMetricsForPicker(getClusterOptions(), getMetricOptions());
    const total = groups.reduce((sum, g) => sum + g.metrics.length, 0);
    expect(total).toBe(METRIC_KEYS.length);
  });

  it('gives a cpi layer spec the real cluster metric keys for the No data rule', () => {
    const spec = toLayerSpec({ kind: 'cpi', cluster: 'Environmental' }, getClusterOptions());
    expect(spec).toEqual({
      kind: 'cpi',
      cluster: 'Environmental',
      clusterMetricKeys: metricsInCluster('Environmental'),
    });
  });
});
