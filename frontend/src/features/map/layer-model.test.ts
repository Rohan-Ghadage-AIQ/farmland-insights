import { describe, expect, it } from 'vitest';
import { getEmptyLayerModel, getLayerModel } from './layer-model';
import type { AnalysisResponse, GridCellFeature, LayerSpec } from './types';

const CPI = {
  Structural: 0.5,
  Chlorophyll: 0.5,
  Water_Drought: 0.5,
  Environmental: 0.5,
  Agro_Meteo: 0.5,
};

function cell(id: number, metrics: Record<string, number>): GridCellFeature {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [id, 0],
          [id + 1, 0],
          [id + 1, 1],
          [id, 1],
          [id, 0],
        ],
      ],
    },
    properties: { grid_id: id, raw_metrics: metrics, cpi_scores: CPI, advisories: {} },
  };
}

const response: AnalysisResponse = {
  type: 'FeatureCollection',
  features: [
    cell(1, { ndvi: 0.2, spi: -1.2, t2m: 24 }),
    cell(2, { ndvi: 0.6, spi: 0.4, t2m: 24 }),
    cell(3, { ndvi: 0.8, spi: 1.6, t2m: 24 }),
  ],
};

const cpiLayer: LayerSpec = { kind: 'cpi', cluster: 'Structural', clusterMetricKeys: ['ndvi'] };

describe('getLayerModel', () => {
  it('CPI layers use the viridis CPI scale on the fixed 0..1 domain', () => {
    const model = getLayerModel(response, cpiLayer, 'light');
    expect(model.scale.kind).toBe('cpi');
    expect(model.domain).toMatchObject({ min: 0, max: 1, clipped: false });
  });

  it('raw metrics use the sequential metric scale on their observed domain', () => {
    const model = getLayerModel(response, { kind: 'metric', metric: 'ndvi' }, 'light');
    expect(model.scale.kind).toBe('metric');
    expect(model.domain.observedMin).toBe(0.2);
    expect(model.domain.observedMax).toBe(0.8);
  });

  it('metrics with a meaningful midpoint use the diverging scale, centred on it', () => {
    const model = getLayerModel(response, { kind: 'metric', metric: 'spi' }, 'dark');
    expect(model.scale.kind).toBe('diverging');
    expect(model.scale.theme).toBe('dark');
    expect(model.domain.midpoint).toBe(0);
    expect(model.domain.min).toBeCloseTo(-model.domain.max, 10);
  });

  it('a farm-level metric (same value in every cell) is flat', () => {
    expect(getLayerModel(response, { kind: 'metric', metric: 't2m' }, 'light').domain.flat).toBe(
      true,
    );
  });

  it('a layer with no data anywhere still has a usable flat domain', () => {
    const model = getLayerModel(response, { kind: 'metric', metric: 'savi' }, 'light');
    expect(model.data.noDataCount).toBe(3);
    expect(model.domain.flat).toBe(true);
  });

  it('provides an empty model for the state before any analysis, stable per theme', () => {
    const model = getEmptyLayerModel('dark');
    expect(model.data.cellCount).toBe(0);
    expect(model.data.geojson.features).toEqual([]);
    expect(model.scale.theme).toBe('dark');
    expect(getEmptyLayerModel('dark')).toBe(model);
    expect(getEmptyLayerModel('light')).not.toBe(model);
  });

  it('is memoised per response, layer and theme', () => {
    const a = getLayerModel(response, cpiLayer, 'light');
    expect(getLayerModel(response, { ...cpiLayer }, 'light')).toBe(a);
    expect(getLayerModel(response, cpiLayer, 'dark')).not.toBe(a);
    expect(getLayerModel(response, cpiLayer, 'dark').data).toBe(a.data);
  });
});
