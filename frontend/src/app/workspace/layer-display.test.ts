import { describe, expect, it } from 'vitest';
import { getEmptyLayerModel, type LayerSpec } from '@/features/map';
import { buildHoverRows, buildLegendInput, describeLayer } from './layer-display';

describe('describeLayer', () => {
  it('describes a CPI layer by its cluster label, with no unit, to 2 decimals', () => {
    const layer: LayerSpec = { kind: 'cpi', cluster: 'Structural', clusterMetricKeys: ['ndvi'] };

    expect(describeLayer(layer)).toEqual({
      title: 'Canopy structure',
      unit: null,
      decimals: 2,
      scope: 'cell',
    });
  });

  it('describes a raw-metric layer by the metric label, unit, decimals and scope', () => {
    const layer: LayerSpec = { kind: 'metric', metric: 't2m' };

    expect(describeLayer(layer)).toEqual({
      title: 'Air temp',
      unit: '°C',
      decimals: 1,
      scope: 'farm',
    });
  });

  it('reports no unit for a dimensionless metric', () => {
    const layer: LayerSpec = { kind: 'metric', metric: 'ndvi' };

    expect(describeLayer(layer).unit).toBeNull();
  });
});

describe('buildLegendInput', () => {
  it('carries the layer title, unit, decimals and scope into the legend model input', () => {
    const layer: LayerSpec = { kind: 'metric', metric: 't2m' };
    const base = getEmptyLayerModel('light');
    const model = { ...base, data: { ...base.data, noDataCount: 3 } };

    expect(buildLegendInput(layer, model, 'light')).toEqual({
      title: 'Air temp',
      unit: '°C',
      scale: model.scale,
      domain: model.domain,
      noDataCount: 3,
      theme: 'light',
      decimals: 1,
      scope: 'farm',
    });
  });
});

describe('buildHoverRows', () => {
  it('shows "No data" when the hovered cell has no value for the layer', () => {
    const layer: LayerSpec = { kind: 'cpi', cluster: 'Structural', clusterMetricKeys: ['ndvi'] };

    const { title, rows } = buildHoverRows({
      layer,
      gridId: 7,
      cellValue: { gridId: 7, value: null, noData: true },
    });

    expect(title).toBe('Cell 7');
    expect(rows).toEqual([{ label: 'Canopy structure', value: null, unit: undefined }]);
  });

  it('formats a CPI value to two decimals with no unit', () => {
    const layer: LayerSpec = { kind: 'cpi', cluster: 'Structural', clusterMetricKeys: ['ndvi'] };

    const { rows } = buildHoverRows({
      layer,
      gridId: '3',
      cellValue: { gridId: '3', value: 0.712_34, noData: false },
    });

    expect(rows).toEqual([{ label: 'Canopy structure', value: '0.71', unit: undefined }]);
  });

  it('formats a physical metric to its own decimals and unit', () => {
    const layer: LayerSpec = { kind: 'metric', metric: 't2m' };

    const { rows } = buildHoverRows({
      layer,
      gridId: 1,
      cellValue: { gridId: 1, value: 24.849, noData: false },
    });

    expect(rows).toEqual([{ label: 'Air temp', value: '24.8', unit: '°C' }]);
  });
});
