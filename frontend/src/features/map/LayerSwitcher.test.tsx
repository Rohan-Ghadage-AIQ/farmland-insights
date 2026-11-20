import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  LayerSwitcher,
  cycleLayer,
  groupMetricsForPicker,
  toLayerSpec,
  type LayerSelection,
} from './LayerSwitcher';
import type { ClusterOption, MetricKey, MetricOption } from './types';

const clusters: ClusterOption[] = [
  { key: 'Structural', label: 'Canopy structure', metricKeys: ['ndvi', 'evi'] },
  { key: 'Water_Drought', label: 'Water & drought', metricKeys: ['ndmi', 'spi'] },
  { key: 'Environmental', label: 'Environment', metricKeys: ['t2m', 'lst'] },
];

const metrics: MetricOption[] = [
  { key: 'ndvi', label: 'NDVI', unit: 'index', cluster: 'Structural', scope: 'cell' },
  { key: 'evi', label: 'EVI', unit: 'index', cluster: 'Structural', scope: 'cell' },
  { key: 'ndmi', label: 'NDMI', unit: 'index', cluster: 'Water_Drought', scope: 'cell' },
  { key: 'spi', label: 'SPI', unit: 'Ïƒ', cluster: 'Water_Drought', scope: 'farm' },
  { key: 't2m', label: 'Air temperature', unit: 'Â°C', cluster: 'Environmental', scope: 'farm' },
  {
    key: 'lst',
    label: 'Land surface temperature',
    unit: 'Â°C',
    cluster: 'Environmental',
    scope: 'cell',
  },
];

const cpi: LayerSelection = { kind: 'cpi', cluster: 'Structural' };

describe('groupMetricsForPicker', () => {
  it('groups by cluster in cluster order, with per-cell metrics before farm-level ones', () => {
    const groups = groupMetricsForPicker(clusters, metrics);
    expect(groups.map((g) => g.label)).toEqual([
      'Canopy structure Â· Varies by cell',
      'Water & drought Â· Varies by cell',
      'Water & drought Â· Farm-level',
      'Environment Â· Varies by cell',
      'Environment Â· Farm-level',
    ]);
    expect(groups[1]?.metrics.map((m) => m.key)).toEqual(['ndmi']);
    expect(groups[2]?.metrics.map((m) => m.key)).toEqual(['spi']);
  });

  it('omits empty groups', () => {
    const groups = groupMetricsForPicker(
      clusters,
      metrics.filter((m) => m.cluster === 'Structural'),
    );
    expect(groups).toHaveLength(1);
  });
});

describe('toLayerSpec', () => {
  it('attaches the cluster metric keys to a CPI selection, for the no-data rule', () => {
    expect(toLayerSpec(cpi, clusters)).toEqual({
      kind: 'cpi',
      cluster: 'Structural',
      clusterMetricKeys: ['ndvi', 'evi'],
    });
  });

  it('passes a metric selection through', () => {
    expect(toLayerSpec({ kind: 'metric', metric: 'spi' }, clusters)).toEqual({
      kind: 'metric',
      metric: 'spi',
    });
  });

  it('falls back to no keys for an unknown cluster (which makes every cell no-data, not a crash)', () => {
    expect(toLayerSpec({ kind: 'cpi', cluster: 'Agro_Meteo' }, clusters)).toEqual({
      kind: 'cpi',
      cluster: 'Agro_Meteo',
      clusterMetricKeys: [],
    });
  });
});

describe('cycleLayer', () => {
  it('goes through CPI clusters, then per-cell metrics, then wraps', () => {
    let current: LayerSelection = { kind: 'cpi', cluster: 'Structural' };
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      current = cycleLayer(current, clusters, metrics);
      seen.push(current.kind === 'cpi' ? `cpi:${current.cluster}` : `metric:${current.metric}`);
    }
    expect(seen).toEqual([
      'cpi:Water_Drought',
      'cpi:Environmental',
      'metric:ndvi',
      'metric:evi',
      'metric:ndmi',
      'metric:lst',
      'cpi:Structural',
      'cpi:Water_Drought',
      'cpi:Environmental',
    ]);
  });

  it('starts from the first layer when the current one is unknown', () => {
    const stale = 'nope' as string as MetricKey;
    expect(cycleLayer({ kind: 'metric', metric: stale }, clusters, metrics)).toEqual({
      kind: 'cpi',
      cluster: 'Structural',
    });
  });
});

describe('LayerSwitcher', () => {
  const setup = (value: LayerSelection = cpi) => {
    const onChange = vi.fn();
    render(
      <LayerSwitcher clusters={clusters} metrics={metrics} value={value} onChange={onChange} />,
    );
    return { onChange };
  };

  it('is a labelled group with a CPI / Raw metric switch showing the active type', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Map layer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CPI' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Raw metric' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('CPI mode picks a cluster and reports the change', async () => {
    const { onChange } = setup();
    const select = screen.getByRole('combobox', { name: 'Cluster' });
    expect(select).toHaveValue('Structural');
    await userEvent.selectOptions(select, 'Water_Drought');
    expect(onChange).toHaveBeenCalledWith({ kind: 'cpi', cluster: 'Water_Drought' });
  });

  it('switching to Raw metric selects the first per-cell metric', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Raw metric' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'metric', metric: 'ndvi' });
  });

  it('switching back to CPI uses the cluster of the current metric', async () => {
    const { onChange } = setup({ kind: 'metric', metric: 'ndmi' });
    await userEvent.click(screen.getByRole('button', { name: 'CPI' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'cpi', cluster: 'Water_Drought' });
  });

  it('Raw metric mode groups metrics by cluster, separating per-cell from farm-level', async () => {
    const { onChange } = setup({ kind: 'metric', metric: 'ndvi' });
    const select = screen.getByRole('combobox', { name: 'Metric' });
    expect(select).toHaveValue('ndvi');
    const farm = within(select).getByRole('group', { name: 'Water & drought Â· Farm-level' });
    expect(within(farm).getByRole('option', { name: 'SPI (Ïƒ)' })).toBeInTheDocument();
    const cell = within(select).getByRole('group', { name: 'Canopy structure Â· Varies by cell' });
    expect(within(cell).getByRole('option', { name: 'NDVI (index)' })).toBeInTheDocument();

    await userEvent.selectOptions(select, 'lst');
    expect(onChange).toHaveBeenCalledWith({ kind: 'metric', metric: 'lst' });
  });

  it('marks farm-level metrics so a flat map is not a surprise', () => {
    setup({ kind: 'metric', metric: 'spi' });
    expect(screen.getByText(/same for every cell/i)).toBeInTheDocument();
  });

  it('does not show the farm-level hint for per-cell metrics', () => {
    setup({ kind: 'metric', metric: 'ndvi' });
    expect(screen.queryByText(/same for every cell/i)).not.toBeInTheDocument();
  });
});
