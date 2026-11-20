import {
  cpiDomain,
  divergingDomain,
  divergingMidpoint,
  getColorScale,
  metricDomain,
  type ColorScale,
  type ValueDomain,
} from './color-scales';
import { getGridLayerData, layerKey, type GridLayerData } from './grid-source';
import type { AnalysisResponse, LayerSpec, Theme } from './types';

/** Everything needed to paint and explain one layer: its data, colour scale and value domain. */
export interface LayerModel {
  readonly data: GridLayerData;
  readonly scale: ColorScale;
  readonly domain: ValueDomain;
}

const NO_VALUES: ValueDomain = {
  min: 0,
  max: 0,
  observedMin: 0,
  observedMax: 0,
  clipped: false,
  flat: true,
};

function build(response: AnalysisResponse, layer: LayerSpec, theme: Theme): LayerModel {
  const data = getGridLayerData(response, layer);
  if (layer.kind === 'cpi') {
    return { data, scale: getColorScale('cpi', theme), domain: cpiDomain() };
  }
  const midpoint = divergingMidpoint(layer.metric);
  if (midpoint !== undefined) {
    return {
      data,
      scale: getColorScale('diverging', theme),
      domain: divergingDomain(data.values, midpoint) ?? { ...NO_VALUES, midpoint },
    };
  }
  return {
    data,
    scale: getColorScale('metric', theme),
    domain: metricDomain(data.values) ?? NO_VALUES,
  };
}

const EMPTY_DATA: GridLayerData = {
  geojson: { type: 'FeatureCollection', features: [] },
  values: [],
  cellCount: 0,
  noDataCount: 0,
  byId: new Map(),
};

const emptyModels: Partial<Record<Theme, LayerModel>> = {};

/** The model before any analysis exists: no cells, CPI scale. Stable per theme. */
export function getEmptyLayerModel(theme: Theme): LayerModel {
  return (emptyModels[theme] ??= {
    data: EMPTY_DATA,
    scale: getColorScale('cpi', theme),
    domain: cpiDomain(),
  });
}

const cache = new WeakMap<AnalysisResponse, Map<string, LayerModel>>();

/** Memoised by response, layer and theme: hover and selection never come through here. */
export function getLayerModel(
  response: AnalysisResponse,
  layer: LayerSpec,
  theme: Theme,
): LayerModel {
  const key = `${layerKey(layer)}|${theme}`;
  let perResponse = cache.get(response);
  if (perResponse === undefined) {
    perResponse = new Map();
    cache.set(response, perResponse);
  }
  let model = perResponse.get(key);
  if (model === undefined) {
    model = build(response, layer, theme);
    perResponse.set(key, model);
  }
  return model;
}
