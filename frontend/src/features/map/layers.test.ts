import { describe, expect, it } from 'vitest';
import { contrastRatio } from './color-math';
import {
  BASEMAP_REFERENCE_COLORS,
  colorAt,
  cpiDomain,
  getColorScale,
  getNoDataPattern,
  metricDomain,
  type ValueDomain,
} from './color-scales';
import {
  FARM_SOURCE_ID,
  FARM_SOURCE_SPEC,
  GRID_SOURCE_ID,
  GRID_SOURCE_SPEC,
  LAYER_IDS,
  buildFarmOutlineLayers,
  buildFillColor,
  buildGridFillLayer,
  buildGridHitLayer,
  buildGridLayers,
  buildGridNoDataLayer,
  buildGridOutlineLayer,
  buildHighlightLayers,
  farmToGeoJson,
  FILL_OPACITY,
} from './layers';
import type { FarmGeometry, Theme } from './types';

const THEMES: readonly Theme[] = ['light', 'dark'];

/**
 * Paint properties as a plain record. Indexing MapLibre's layer-spec unions directly makes the
 * type-aware lint rules resolve its huge recursive expression types, which takes minutes.
 */
const paintOf = (layer: { readonly paint?: unknown } | undefined): Record<string, unknown> =>
  typeof layer?.paint === 'object' && layer.paint !== null
    ? (layer.paint as Record<string, unknown>)
    : {};

/** Pairs [stopValue, color] out of an `['interpolate', ['linear'], input, v0, c0, v1, c1, ...]`. */
function stopsOf(expression: unknown): { value: number; color: string }[] {
  if (!Array.isArray(expression)) throw new Error('not an expression');
  const flat = expression.slice(3) as unknown[];
  const stops: { value: number; color: string }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    stops.push({ value: Number(flat[i]), color: String(flat[i + 1]) });
  }
  return stops;
}

describe('sources', () => {
  it('declares the grid source with the promoted id and the farm source without one', () => {
    expect(GRID_SOURCE_SPEC).toMatchObject({ type: 'geojson', promoteId: 'gridId' });
    expect(FARM_SOURCE_SPEC).toMatchObject({ type: 'geojson' });
    expect(GRID_SOURCE_ID).not.toBe(FARM_SOURCE_ID);
  });

  it('starts both sources empty so layers can be installed before any data arrives', () => {
    expect(GRID_SOURCE_SPEC.data).toEqual({ type: 'FeatureCollection', features: [] });
    expect(FARM_SOURCE_SPEC.data).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('farmToGeoJson', () => {
  const polygon: FarmGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };

  it('returns an empty collection for no farm', () => {
    expect(farmToGeoJson(null)).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('keeps geometry and gives every feature a properties object (GeoJSON requires one)', () => {
    const data = farmToGeoJson({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: polygon }],
    });
    expect(data.features).toEqual([{ type: 'Feature', geometry: polygon, properties: {} }]);
  });

  it('preserves existing feature properties', () => {
    const data = farmToGeoJson({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: polygon, properties: { name: 'North field' } }],
    });
    expect(data.features[0]?.properties).toEqual({ name: 'North field' });
  });
});

describe('buildFillColor', () => {
  it('interpolates linearly across the domain with ascending stops covering min..max', () => {
    const domain: ValueDomain = { ...cpiDomain() };
    const scale = getColorScale('cpi', 'light');
    const expression = buildFillColor(scale, domain);
    expect(Array.isArray(expression) && expression[0]).toBe('interpolate');
    const stops = stopsOf(expression);
    expect(stops.length).toBeGreaterThanOrEqual(9);
    expect(stops[0]).toEqual({ value: 0, color: colorAt(scale, 0) });
    expect(stops[stops.length - 1]).toEqual({ value: 1, color: colorAt(scale, 1) });
    stops.forEach((s, i) => {
      if (i > 0) expect(s.value).toBeGreaterThan(stops[i - 1]?.value ?? Infinity);
    });
  });

  it('maps stop values onto a metric domain, not onto 0..1', () => {
    const domain = metricDomain([10, 20, 30, 40, 50]);
    if (domain === null) throw new Error('expected a domain');
    const stops = stopsOf(buildFillColor(getColorScale('metric', 'dark'), domain));
    expect(stops[0]?.value).toBeCloseTo(domain.min, 10);
    expect(stops[stops.length - 1]?.value).toBeCloseTo(domain.max, 10);
  });

  it('reads the painted number from the feature and never from the response', () => {
    const expression = JSON.stringify(buildFillColor(getColorScale('cpi', 'light'), cpiDomain()));
    expect(expression).toContain('"get","value"');
  });

  it('returns one flat colour for a flat domain, because a gradient would be misleading', () => {
    const scale = getColorScale('metric', 'light');
    const flat: ValueDomain = {
      min: 24,
      max: 24,
      observedMin: 24,
      observedMax: 24,
      clipped: false,
      flat: true,
    };
    expect(buildFillColor(scale, flat)).toBe(colorAt(scale, 0.5));
  });
});

describe('grid layers', () => {
  const scale = getColorScale('cpi', 'light');

  it('fill layer paints only cells with data, fully opaque so mark contrast is guaranteed', () => {
    const layer = buildGridFillLayer(scale, cpiDomain());
    expect(layer).toMatchObject({ id: LAYER_IDS.gridFill, type: 'fill', source: GRID_SOURCE_ID });
    expect(layer.filter).toEqual(['==', ['get', 'noData'], false]);
    expect(paintOf(layer)['fill-opacity']).toBe(FILL_OPACITY);
    expect(FILL_OPACITY).toBe(1);
    expect(paintOf(layer)['fill-antialias']).toBe(false);
  });

  it('no-data layer uses the hatch pattern for cells without data', () => {
    const layer = buildGridNoDataLayer(getNoDataPattern('light').id);
    expect(layer).toMatchObject({ id: LAYER_IDS.gridNoData, type: 'fill', source: GRID_SOURCE_ID });
    expect(layer.filter).toEqual(['==', ['get', 'noData'], true]);
    expect(paintOf(layer)['fill-pattern']).toBe('no-data-hatch-light');
  });

  it('hit layer covers every cell invisibly, so pointer events hit data and no-data cells alike', () => {
    const layer = buildGridHitLayer();
    expect(layer).toMatchObject({ id: LAYER_IDS.gridHit, type: 'fill', source: GRID_SOURCE_ID });
    expect(layer.filter).toBeUndefined();
    expect(paintOf(layer)['fill-opacity']).toBe(0);
  });

  for (const theme of THEMES) {
    it(`${theme}: outline is a thin line on the grid source`, () => {
      const layer = buildGridOutlineLayer(theme);
      expect(layer).toMatchObject({
        id: LAYER_IDS.gridOutline,
        type: 'line',
        source: GRID_SOURCE_ID,
      });
      expect(paintOf(layer)['line-color']).toMatch(/^#|^rgba/);
    });

    it(`${theme}: farm outline has a casing and a line whose stroke clears 3:1 on the basemap`, () => {
      const [casing, line] = buildFarmOutlineLayers(theme);
      expect(casing.id).toBe(LAYER_IDS.farmCasing);
      expect(line.id).toBe(LAYER_IDS.farmOutline);
      expect(casing.source).toBe(FARM_SOURCE_ID);
      expect(line.source).toBe(FARM_SOURCE_ID);
      const stroke = paintOf(line)['line-color'];
      expect(typeof stroke).toBe('string');
      for (const reference of BASEMAP_REFERENCE_COLORS[theme]) {
        expect(contrastRatio(String(stroke), reference)).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe('hover and selection through feature-state', () => {
  const [casing, line] = buildHighlightLayers();

  it('draws a casing under a line, both on the grid source', () => {
    expect(casing.id).toBe(LAYER_IDS.highlightCasing);
    expect(line.id).toBe(LAYER_IDS.highlight);
    expect(casing.source).toBe(GRID_SOURCE_ID);
    expect(line.source).toBe(GRID_SOURCE_ID);
  });

  it('widths depend on selected, highlight and hover feature-state and are 0 otherwise', () => {
    const width = JSON.stringify(paintOf(line)['line-width']);
    expect(width).toContain('"feature-state","selected"');
    expect(width).toContain('"feature-state","highlight"');
    expect(width).toContain('"feature-state","hover"');
    const casingWidth = paintOf(casing)['line-width'];
    expect(JSON.stringify(casingWidth)).toContain('"feature-state","selected"');
    // The final fallback of the case expression is the no-state width.
    const expression = paintOf(line)['line-width'];
    expect(Array.isArray(expression) && expression[expression.length - 1]).toBe(0);
  });

  it('never rewrites paint to react to state, so hover is a feature-state update only', () => {
    expect(JSON.stringify(paintOf(line))).not.toContain('"get","value"');
  });
});

describe('buildGridLayers', () => {
  for (const theme of THEMES) {
    it(`${theme}: returns layers in paint order with unique ids, highlight on top`, () => {
      const layers = buildGridLayers({
        theme,
        scale: getColorScale('cpi', theme),
        domain: cpiDomain(),
      });
      const ids = layers.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([
        LAYER_IDS.gridNoData,
        LAYER_IDS.gridFill,
        LAYER_IDS.gridHit,
        LAYER_IDS.gridOutline,
        LAYER_IDS.farmCasing,
        LAYER_IDS.farmOutline,
        LAYER_IDS.highlightCasing,
        LAYER_IDS.highlight,
      ]);
    });
  }

  it('the no-data layer uses the pattern image for the theme', () => {
    const layers = buildGridLayers({
      theme: 'dark',
      scale: getColorScale('cpi', 'dark'),
      domain: cpiDomain(),
    });
    const noData = layers.find((l) => l.id === LAYER_IDS.gridNoData);
    expect(paintOf(noData)['fill-pattern']).toBe('no-data-hatch-dark');
  });
});
