import { describe, expect, it } from 'vitest';
import {
  GRID_PROMOTE_ID,
  buildGridLayerData,
  computeCellValue,
  getGridLayerData,
  layerKey,
} from './grid-source';
import type { AnalysisResponse, GridCellFeature, LayerSpec, MetricKey } from './types';

const square = (x: number, y: number): GridCellFeature['geometry'] => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
      [x, y],
    ],
  ],
});

const CPI = {
  Structural: 0.8,
  Chlorophyll: 0.6,
  Water_Drought: 0.4,
  Environmental: 0.2,
  Agro_Meteo: 0,
};

function cell(
  gridId: string | number,
  rawMetrics: Record<string, number> | undefined,
  cpi = CPI,
  x = 0,
): GridCellFeature {
  return {
    type: 'Feature',
    id: gridId,
    geometry: square(x, 0),
    properties: {
      grid_id: gridId,
      ...(rawMetrics === undefined ? {} : { raw_metrics: rawMetrics }),
      cpi_scores: cpi,
      advisories: {},
    },
  };
}

const response: AnalysisResponse = {
  type: 'FeatureCollection',
  features: [
    cell(1, { ndvi: 0.7, evi: 0.5, t2m: 24 }, { ...CPI, Structural: 0.9 }, 0),
    cell(2, { ndvi: 0.4, t2m: 24 }, { ...CPI, Structural: 0.3 }, 1),
    cell('3', { t2m: 24 }, { ...CPI, Structural: 0 }, 2), // no structural metrics at all
    cell(4, undefined, CPI, 3), // no raw metrics at all
  ],
};

const structuralCpi: LayerSpec = {
  kind: 'cpi',
  cluster: 'Structural',
  clusterMetricKeys: ['ndvi', 'evi', 'savi'],
};
const ndvi: LayerSpec = { kind: 'metric', metric: 'ndvi' };

describe('computeCellValue', () => {
  it('returns the CPI score when the cell has metrics from that cluster', () => {
    const [first] = response.features;
    expect(first && computeCellValue(first.properties, structuralCpi)).toBe(0.9);
  });

  it('is no-data when the cell has no metric from the cluster, even though the score is 0.0', () => {
    const third = response.features[2];
    expect(third && computeCellValue(third.properties, structuralCpi)).toBeNull();
  });

  it('is no-data for a cell without raw_metrics', () => {
    const fourth = response.features[3];
    expect(fourth && computeCellValue(fourth.properties, structuralCpi)).toBeNull();
    expect(fourth && computeCellValue(fourth.properties, ndvi)).toBeNull();
  });

  it('keeps a genuine 0.0 CPI when metrics exist', () => {
    const props = cell(9, { ndvi: 0.1 }, { ...CPI, Structural: 0 }).properties;
    expect(computeCellValue(props, structuralCpi)).toBe(0);
  });

  it('is no-data for a cluster with no known metric keys (cannot be verified)', () => {
    const [first] = response.features;
    const layer: LayerSpec = { kind: 'cpi', cluster: 'Structural', clusterMetricKeys: [] };
    expect(first && computeCellValue(first.properties, layer)).toBeNull();
  });

  it('reads raw metrics and treats missing or non-finite values as no-data', () => {
    const [first, second] = response.features;
    expect(first && computeCellValue(first.properties, { kind: 'metric', metric: 'evi' })).toBe(
      0.5,
    );
    expect(
      second && computeCellValue(second.properties, { kind: 'metric', metric: 'evi' }),
    ).toBeNull();
    const nan = cell(8, { ndvi: Number.NaN }).properties;
    expect(computeCellValue(nan, ndvi)).toBeNull();
  });

  it('does not read inherited object keys as metrics', () => {
    const props = cell(7, {}).properties;
    // Deliberately not a real metric key: a hostile or stale key must not hit Object.prototype.
    const inherited = 'toString' as string;
    expect(computeCellValue(props, { kind: 'metric', metric: inherited as MetricKey })).toBeNull();
  });
});

describe('buildGridLayerData', () => {
  it('produces one feature per cell with promotable id, value and no-data flag', () => {
    const data = buildGridLayerData(response, structuralCpi);
    expect(GRID_PROMOTE_ID).toBe('gridId');
    expect(data.geojson.type).toBe('FeatureCollection');
    expect(data.geojson.features).toHaveLength(4);
    expect(data.geojson.features.map((f) => f.properties)).toEqual([
      { gridId: 1, value: 0.9, noData: false },
      { gridId: 2, value: 0.3, noData: false },
      { gridId: '3', value: null, noData: true },
      { gridId: 4, value: null, noData: true },
    ]);
    expect(data.geojson.features[0]?.geometry).toBe(response.features[0]?.geometry);
  });

  it('reports finite values, counts and a lookup by id (string or number)', () => {
    const data = buildGridLayerData(response, ndvi);
    expect(data.values).toEqual([0.7, 0.4]);
    expect(data.cellCount).toBe(4);
    expect(data.noDataCount).toBe(2);
    expect(data.byId.get('1')).toEqual({ gridId: 1, value: 0.7, noData: false });
    expect(data.byId.get('3')).toEqual({ gridId: '3', value: null, noData: true });
    expect(data.byId.get('nope')).toBeUndefined();
  });

  it('does not mutate the response', () => {
    const snapshot = JSON.stringify(response);
    buildGridLayerData(response, ndvi);
    expect(JSON.stringify(response)).toBe(snapshot);
  });
});

describe('layerKey', () => {
  it('is stable and distinct per layer', () => {
    expect(layerKey(ndvi)).toBe(layerKey({ kind: 'metric', metric: 'ndvi' }));
    expect(layerKey(ndvi)).not.toBe(layerKey({ kind: 'metric', metric: 'evi' }));
    expect(layerKey(structuralCpi)).not.toBe(layerKey(ndvi));
    expect(layerKey(structuralCpi)).not.toBe(
      layerKey({ ...structuralCpi, cluster: 'Chlorophyll' }),
    );
  });
});

describe('getGridLayerData (memoised by response and layer)', () => {
  it('returns the same object for the same response and layer, so hover never recomputes', () => {
    const a = getGridLayerData(response, ndvi);
    const b = getGridLayerData(response, { kind: 'metric', metric: 'ndvi' });
    expect(b).toBe(a);
  });

  it('computes separately for another layer', () => {
    expect(getGridLayerData(response, ndvi)).not.toBe(getGridLayerData(response, structuralCpi));
  });

  it('computes separately for another response object, even with equal content', () => {
    const copy: AnalysisResponse = { ...response, features: [...response.features] };
    expect(getGridLayerData(copy, ndvi)).not.toBe(getGridLayerData(response, ndvi));
  });
});
