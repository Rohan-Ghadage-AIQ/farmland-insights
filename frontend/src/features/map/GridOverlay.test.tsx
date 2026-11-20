import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridOverlay, type GridOverlayProps } from './GridOverlay';
import { FARM_SOURCE_ID, GRID_SOURCE_ID, LAYER_IDS } from './layers';
import { FakeMap } from './maplibre-fake';
import { MapView } from './MapView';
import type { AnalysisResponse, FarmFeatureCollection, GridCellFeature, LayerSpec } from './types';

vi.mock('maplibre-gl', async () => (await import('./maplibre-fake')).maplibreFakeModule);

const CPI = {
  Structural: 0.5,
  Chlorophyll: 0.5,
  Water_Drought: 0.5,
  Environmental: 0.5,
  Agro_Meteo: 0.5,
};

const cell = (id: number, ndvi: number): GridCellFeature => ({
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
  properties: { grid_id: id, raw_metrics: { ndvi }, cpi_scores: CPI, advisories: {} },
});

const response: AnalysisResponse = {
  type: 'FeatureCollection',
  features: [cell(1, 0.2), cell(2, 0.6), cell(3, 0.9)],
};

const farm: FarmFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      properties: {},
    },
  ],
};

const ndvi: LayerSpec = { kind: 'metric', metric: 'ndvi' };

function latestMap(): FakeMap {
  const map = FakeMap.instances[FakeMap.instances.length - 1];
  if (map === undefined) throw new Error('no map was created');
  return map;
}

function mount(props: Partial<GridOverlayProps> = {}) {
  const ui = (p: Partial<GridOverlayProps>) => (
    <MapView theme={p.theme ?? 'light'} basemapConfig={{}}>
      <GridOverlay response={response} layer={ndvi} theme="light" farm={farm} {...p} />
    </MapView>
  );
  const view = render(ui(props));
  act(() => {
    latestMap().emit('style.load');
  });
  return {
    ...view,
    update: (next: Partial<GridOverlayProps>) => {
      view.rerender(ui(next));
    },
  };
}

describe('GridOverlay', () => {
  beforeEach(() => {
    FakeMap.reset();
  });
  afterEach(() => {
    FakeMap.reset();
  });

  it('installs the grid and farm sources, the no-data pattern and every layer once the style is ready', () => {
    mount();
    const map = latestMap();
    expect(map.sources.has(GRID_SOURCE_ID)).toBe(true);
    expect(map.sources.has(FARM_SOURCE_ID)).toBe(true);
    expect(map.images.has('no-data-hatch-light')).toBe(true);
    for (const id of Object.values(LAYER_IDS)) expect(map.layers.has(id)).toBe(true);
  });

  it('pushes the grid features and the farm outline to their sources', () => {
    mount();
    const map = latestMap();
    const grid = map.sources.get(GRID_SOURCE_ID)?.setData.mock.calls.at(-1)?.[0] as {
      features: { properties: { gridId: number; value: number | null } }[];
    };
    expect(grid.features.map((f) => f.properties.value)).toEqual([0.2, 0.6, 0.9]);
    expect(map.sources.get(FARM_SOURCE_ID)?.setData).toHaveBeenLastCalledWith(farm);
  });

  it('keeps the grid source empty before any response exists', () => {
    mount({ response: null, layer: null });
    const grid = latestMap().sources.get(GRID_SOURCE_ID)?.setData.mock.calls.at(-1)?.[0] as {
      features: unknown[];
    };
    expect(grid.features).toEqual([]);
    expect(latestMap().layers.has(LAYER_IDS.gridFill)).toBe(true);
  });

  it('repaints with setPaint, not by re-creating layers, when the layer changes', () => {
    const { update } = mount();
    const map = latestMap();
    const layersBefore = new Set(map.layers);
    map.setPaintProperty.mockClear();
    update({ layer: { kind: 'cpi', cluster: 'Structural', clusterMetricKeys: ['ndvi'] } });
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      LAYER_IDS.gridFill,
      'fill-color',
      expect.anything(),
    );
    expect(map.layers).toEqual(layersBefore);
  });

  it('reinstalls sources, pattern, layers and data after a theme-driven style reload', () => {
    const { update } = mount();
    const map = latestMap();
    update({ theme: 'dark' });
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    // A full style reload wipes everything that was added at runtime.
    map.layers.clear();
    map.sources.clear();
    map.images.clear();
    act(() => {
      map.emit('style.load');
    });
    expect(map.sources.has(GRID_SOURCE_ID)).toBe(true);
    expect(map.sources.has(FARM_SOURCE_ID)).toBe(true);
    expect(map.images.has('no-data-hatch-dark')).toBe(true);
    for (const id of Object.values(LAYER_IDS)) expect(map.layers.has(id)).toBe(true);
    const grid = map.sources.get(GRID_SOURCE_ID)?.setData.mock.calls.at(-1)?.[0] as {
      features: unknown[];
    };
    expect(grid.features).toHaveLength(3);
  });

  it('hover sets feature-state on the cell under the pointer, clears it on leave, and reports the cell', () => {
    const onHover = vi.fn();
    mount({ onHover });
    const map = latestMap();
    act(() => {
      map.emit('mousemove', { features: [{ id: 2 }], point: { x: 10, y: 20 } });
    });
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: GRID_SOURCE_ID, id: 2 },
      { hover: true },
    );
    expect(onHover).toHaveBeenCalledWith({
      id: 2,
      point: { x: 10, y: 20 },
      cell: { gridId: 2, value: 0.6, noData: false },
    });

    act(() => {
      map.emit('mouseleave', { point: { x: 0, y: 0 } });
    });
    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: GRID_SOURCE_ID, id: 2 },
      { hover: false },
    );
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('does not touch feature-state while the pointer moves within one cell', () => {
    mount();
    const map = latestMap();
    map.setFeatureState.mockClear();
    act(() => {
      map.emit('mousemove', { features: [{ id: 1 }], point: { x: 1, y: 1 } });
      map.emit('mousemove', { features: [{ id: 1 }], point: { x: 2, y: 2 } });
    });
    const hoverTrue = map.setFeatureState.mock.calls.filter(
      ([, state]) => (state as { hover?: boolean }).hover === true,
    );
    expect(hoverTrue).toHaveLength(1);
  });

  it('click reports the selected cell id and where the click landed', () => {
    const onSelect = vi.fn();
    mount({ onSelect });
    act(() => {
      latestMap().emit('click', { features: [{ id: 3 }], point: { x: 41, y: 77 } });
    });
    expect(onSelect).toHaveBeenCalledWith(3, { x: 41, y: 77 });
  });

  it('applies selected and highlight feature-state, and moves them when the props change', () => {
    const { update } = mount({ selectedId: 1, highlightIds: [2, 3] });
    const map = latestMap();
    const calls = () =>
      map.setFeatureState.mock.calls.map((call: readonly unknown[]) => [
        (call[0] as { id: unknown }).id,
        call[1],
      ]);
    expect(calls()).toEqual(
      expect.arrayContaining([
        [1, { selected: true }],
        [2, { highlight: true }],
        [3, { highlight: true }],
      ]),
    );
    map.setFeatureState.mockClear();
    update({ selectedId: 2, highlightIds: [3] });
    expect(calls()).toEqual(
      expect.arrayContaining([
        [1, { selected: false }],
        [2, { selected: true }],
        [2, { highlight: false }],
      ]),
    );
  });

  it('ignores a selected id that is not in the response instead of throwing', () => {
    expect(() => mount({ selectedId: 999 })).not.toThrow();
  });
});
