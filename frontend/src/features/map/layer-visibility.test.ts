import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LAYER_STATE,
  MIN_GRID_OPACITY,
  applyLayerState,
  clampGridOpacity,
  layerGroupOf,
  type LayerStateMap,
} from './layer-visibility';
import { LAYER_IDS } from './layers';

describe('layerGroupOf', () => {
  it.each([
    ['basemap', 'basemap'],
    ['basemap-labels', 'basemap'],
    [LAYER_IDS.gridFill, 'grid'],
    [LAYER_IDS.gridNoData, 'grid'],
    [LAYER_IDS.gridOutline, 'grid'],
    [LAYER_IDS.gridHit, 'grid'],
    [LAYER_IDS.highlight, 'grid'],
    [LAYER_IDS.highlightCasing, 'grid'],
    [LAYER_IDS.farmOutline, 'boundary'],
    [LAYER_IDS.farmCasing, 'boundary'],
    ['td-polygon', 'boundary'],
    ['td-polygon-outline', 'boundary'],
    ['td-point', 'boundary'],
  ] as const)('puts %s under %s', (id, group) => {
    expect(layerGroupOf(id)).toBe(group);
  });

  it('leaves layers it does not own alone', () => {
    expect(layerGroupOf('something-else')).toBeNull();
    expect(layerGroupOf('tdx')).toBeNull();
  });
});

describe('clampGridOpacity', () => {
  it('keeps the grid readable and valid', () => {
    expect(clampGridOpacity(0)).toBe(MIN_GRID_OPACITY);
    expect(clampGridOpacity(0.5)).toBe(0.5);
    expect(clampGridOpacity(7)).toBe(1);
    expect(clampGridOpacity(Number.NaN)).toBe(1);
  });
});

function fakeMap(layerIds: readonly string[], visibility: Record<string, string> = {}) {
  const current = new Map(Object.entries(visibility));
  return {
    getStyle: vi.fn(() => ({ layers: layerIds.map((id) => ({ id })) })),
    getLayer: vi.fn((id: string) => (layerIds.includes(id) ? { id } : undefined)),
    getLayoutProperty: vi.fn((id: string) => current.get(id)),
    setLayoutProperty: vi.fn((id: string, _name: string, value: string) => {
      current.set(id, value);
    }),
    setPaintProperty: vi.fn(),
  } satisfies LayerStateMap;
}

const ALL = [
  'basemap',
  'basemap-labels',
  LAYER_IDS.gridFill,
  LAYER_IDS.gridNoData,
  LAYER_IDS.gridHit,
  LAYER_IDS.gridOutline,
  LAYER_IDS.farmCasing,
  LAYER_IDS.farmOutline,
  'td-polygon',
  'unmanaged',
];

describe('applyLayerState', () => {
  it('hides only the group that was switched off', () => {
    const map = fakeMap(ALL);
    applyLayerState(map, { ...DEFAULT_LAYER_STATE, grid: false });
    expect(map.setLayoutProperty.mock.calls.map(([id]) => id).sort()).toEqual(
      [LAYER_IDS.gridFill, LAYER_IDS.gridNoData, LAYER_IDS.gridHit, LAYER_IDS.gridOutline].sort(),
    );
    for (const call of map.setLayoutProperty.mock.calls) {
      expect(call.slice(1)).toEqual(['visibility', 'none']);
    }
  });

  it('hides the basemap and its labels together', () => {
    const map = fakeMap(ALL);
    applyLayerState(map, { ...DEFAULT_LAYER_STATE, basemap: false });
    expect(map.setLayoutProperty.mock.calls.map(([id]) => id).sort()).toEqual([
      'basemap',
      'basemap-labels',
    ]);
  });

  it('hides the saved boundary and the drawing tool polygon together', () => {
    const map = fakeMap(ALL);
    applyLayerState(map, { ...DEFAULT_LAYER_STATE, boundary: false });
    expect(map.setLayoutProperty.mock.calls.map(([id]) => id).sort()).toEqual(
      [LAYER_IDS.farmCasing, LAYER_IDS.farmOutline, 'td-polygon'].sort(),
    );
  });

  it('shows a layer again when its switch comes back on', () => {
    const map = fakeMap(ALL, { basemap: 'none', 'basemap-labels': 'none' });
    applyLayerState(map, DEFAULT_LAYER_STATE);
    expect(map.setLayoutProperty).toHaveBeenCalledWith('basemap', 'visibility', 'visible');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('basemap-labels', 'visibility', 'visible');
  });

  it('does nothing when the map already matches, so repeated calls settle', () => {
    const map = fakeMap(ALL);
    applyLayerState(map, DEFAULT_LAYER_STATE);
    applyLayerState(map, DEFAULT_LAYER_STATE);
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });

  it('sets the grid fill opacity on the layers that exist, clamped', () => {
    const map = fakeMap(ALL);
    applyLayerState(map, { ...DEFAULT_LAYER_STATE, gridOpacity: 0.01 });
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_IDS.gridFill,
      'fill-opacity',
      MIN_GRID_OPACITY,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_IDS.gridNoData,
      'fill-opacity',
      MIN_GRID_OPACITY,
    );
  });

  it('skips grid opacity before the grid layers exist, and tolerates no style yet', () => {
    const map = fakeMap(['basemap']);
    applyLayerState(map, DEFAULT_LAYER_STATE);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    const noStyle = { ...fakeMap([]), getStyle: () => undefined } satisfies LayerStateMap;
    expect(() => {
      applyLayerState(noStyle, DEFAULT_LAYER_STATE);
    }).not.toThrow();
  });
});
