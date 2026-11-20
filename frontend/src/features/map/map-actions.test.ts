import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { createMapActions, createStyleReadyRegistry } from './map-actions';
import type { GeoJsonCollection } from './types';
import { getNoDataPattern, renderNoDataPattern } from './color-scales';
import { GRID_SOURCE_ID, GRID_SOURCE_SPEC, LAYER_IDS, buildGridLayers } from './layers';
import { cpiDomain, getColorScale } from './color-scales';

interface FakeSource {
  type: string;
  setData: ReturnType<typeof vi.fn>;
}

/** The slice of the MapLibre Map the actions touch; a cast at this boundary is deliberate. */
function fakeMap() {
  const sources = new Map<string, FakeSource>();
  const layers = new Set<string>();
  const images = new Set<string>();
  const listeners: { type: string; layerId: string; handler: (e: unknown) => void }[] = [];
  const onceHandlers = new Map<string, (() => void)[]>();
  const map = {
    triggerRepaint: vi.fn(),
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng * 10, y: lat * 10 })),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lng: x / 10, lat: y / 10 })),
    once: vi.fn((type: string, handler: () => void) => {
      onceHandlers.set(type, [...(onceHandlers.get(type) ?? []), handler]);
    }),
    fitBounds: vi.fn(),
    resize: vi.fn(),
    setPaintProperty: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    getCanvas: vi.fn(() => ({ toDataURL: vi.fn(() => 'data:image/png;base64,AAAA') })),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => {
      sources.set(id, { type: 'geojson', setData: vi.fn() });
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id);
    }),
    hasImage: vi.fn((id: string) => images.has(id)),
    addImage: vi.fn((id: string) => {
      images.add(id);
    }),
    on: vi.fn((type: string, layerId: string, handler: (e: unknown) => void) => {
      listeners.push({ type, layerId, handler });
    }),
    off: vi.fn(),
  };
  const fire = (type: string): void => {
    (onceHandlers.get(type) ?? []).forEach((handler) => {
      handler();
    });
    onceHandlers.delete(type);
  };
  return { map: map as unknown as MapLibreMap, raw: map, sources, layers, images, listeners, fire };
}

describe('createStyleReadyRegistry', () => {
  it('runs a callback immediately when the style is already ready, and on every later reload', () => {
    const registry = createStyleReadyRegistry();
    registry.markReady();
    const callback = vi.fn();
    registry.register(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    registry.markLoading();
    registry.markReady();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('defers callbacks registered before the style is ready', () => {
    const registry = createStyleReadyRegistry();
    const callback = vi.fn();
    registry.register(callback);
    expect(callback).not.toHaveBeenCalled();
    registry.markReady();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stops calling a callback after it is unregistered', () => {
    const registry = createStyleReadyRegistry();
    const callback = vi.fn();
    const off = registry.register(callback);
    off();
    registry.markReady();
    expect(callback).not.toHaveBeenCalled();
  });

  it('runs callbacks in ascending order, whatever order they registered in', () => {
    const registry = createStyleReadyRegistry();
    const calls: string[] = [];
    registry.register(() => calls.push('selection'), 1);
    registry.register(() => calls.push('data'), 0);
    registry.markReady();
    expect(calls).toEqual(['data', 'selection']);
  });

  it('does not run callbacks twice for a repeated ready signal without a reload', () => {
    const registry = createStyleReadyRegistry();
    const callback = vi.fn();
    registry.register(callback);
    registry.markReady();
    registry.markReady();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('fitBounds', () => {
  it('converts [w,s,e,n] to MapLibre bounds with padding and a zoom cap', () => {
    const { map, raw } = fakeMap();
    createMapActions(map, createStyleReadyRegistry()).fitBounds([10, 20, 11, 21]);
    expect(raw.fitBounds).toHaveBeenCalledWith(
      [
        [10, 20],
        [11, 21],
      ],
      expect.objectContaining({ padding: 48, maxZoom: 18 }),
    );
  });

  it('skips the animation when asked (prefers-reduced-motion)', () => {
    const { map, raw } = fakeMap();
    createMapActions(map, createStyleReadyRegistry()).fitBounds([0, 0, 1, 1], { animate: false });
    expect(raw.fitBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 0 }),
    );
  });
});

describe('setData', () => {
  it('updates an existing GeoJSON source and reports success', () => {
    const { map, sources } = fakeMap();
    sources.set('grid', { type: 'geojson', setData: vi.fn() });
    const data: GeoJsonCollection = { type: 'FeatureCollection', features: [] };
    expect(createMapActions(map, createStyleReadyRegistry()).setData('grid', data)).toBe(true);
    expect(sources.get('grid')?.setData).toHaveBeenCalledWith(data);
  });

  it('reports false instead of throwing when the source is not installed yet', () => {
    const { map } = fakeMap();
    const data: GeoJsonCollection = { type: 'FeatureCollection', features: [] };
    expect(createMapActions(map, createStyleReadyRegistry()).setData('missing', data)).toBe(false);
  });
});

describe('feature state, resize and export', () => {
  it('sets and removes feature-state on the given source and id', () => {
    const { map, raw } = fakeMap();
    const actions = createMapActions(map, createStyleReadyRegistry());
    actions.setFeatureState({ source: 'grid', id: 4 }, { hover: true });
    actions.removeFeatureState({ source: 'grid', id: 4 }, 'hover');
    actions.clearFeatureState('grid');
    expect(raw.setFeatureState).toHaveBeenCalledWith({ source: 'grid', id: 4 }, { hover: true });
    expect(raw.removeFeatureState).toHaveBeenCalledWith({ source: 'grid', id: 4 }, 'hover');
    expect(raw.removeFeatureState).toHaveBeenCalledWith({ source: 'grid' });
  });

  it('resizes the map', () => {
    const { map, raw } = fakeMap();
    createMapActions(map, createStyleReadyRegistry()).resize();
    expect(raw.resize).toHaveBeenCalledTimes(1);
  });

  it('exports a PNG data URL from the canvas', () => {
    const { map } = fakeMap();
    expect(createMapActions(map, createStyleReadyRegistry()).exportPng()).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  describe('flyTo', () => {
    it('animates to the point at street level by default', () => {
      const { map, raw } = fakeMap();
      createMapActions(map, createStyleReadyRegistry()).flyTo([72.4, 23.6]);
      expect(raw.flyTo).toHaveBeenCalledWith({ center: [72.4, 23.6], zoom: 16 });
      expect(raw.jumpTo).not.toHaveBeenCalled();
    });

    it('uses the given zoom', () => {
      const { map, raw } = fakeMap();
      createMapActions(map, createStyleReadyRegistry()).flyTo([1, 2], { zoom: 9 });
      expect(raw.flyTo).toHaveBeenCalledWith({ center: [1, 2], zoom: 9 });
    });

    it('jumps without animation when asked (reduced motion)', () => {
      const { map, raw } = fakeMap();
      createMapActions(map, createStyleReadyRegistry()).flyTo([72.4, 23.6], { animate: false });
      expect(raw.jumpTo).toHaveBeenCalledWith({ center: [72.4, 23.6], zoom: 16 });
      expect(raw.flyTo).not.toHaveBeenCalled();
    });
  });

  describe('project, unproject and onMove', () => {
    it('converts between map positions and screen pixels', () => {
      const { map } = fakeMap();
      const actions = createMapActions(map, createStyleReadyRegistry());
      expect(actions.project([72.4, 23.6])).toEqual({ x: 724, y: 236 });
      expect(actions.unproject({ x: 724, y: 236 })).toEqual([72.4, 23.6]);
    });

    it('subscribes to map movement and unsubscribes cleanly', () => {
      const { map, raw } = fakeMap();
      const handler = vi.fn();
      const off = createMapActions(map, createStyleReadyRegistry()).onMove(handler);
      expect(raw.on).toHaveBeenCalledWith('move', handler);
      off();
      expect(raw.off).toHaveBeenCalledWith('move', handler);
    });
  });

  describe('capturePng', () => {
    it('waits for the map to go idle, then resolves with the canvas PNG', async () => {
      const { map, raw, fire } = fakeMap();
      const promise = createMapActions(map, createStyleReadyRegistry()).capturePng();
      expect(raw.triggerRepaint).toHaveBeenCalled();
      fire('idle');
      await expect(promise).resolves.toBe('data:image/png;base64,AAAA');
    });

    it('frames the given bounds without animation before capturing', async () => {
      const { map, raw, fire } = fakeMap();
      const promise = createMapActions(map, createStyleReadyRegistry()).capturePng({
        bounds: [72.4, 23.6, 72.5, 23.7],
      });
      expect(raw.fitBounds).toHaveBeenCalledWith(
        [
          [72.4, 23.6],
          [72.5, 23.7],
        ],
        expect.objectContaining({ duration: 0 }),
      );
      fire('idle');
      await promise;
    });

    it('still resolves with what is drawn when the map never goes idle', async () => {
      vi.useFakeTimers();
      try {
        const { map } = fakeMap();
        const promise = createMapActions(map, createStyleReadyRegistry()).capturePng({
          timeoutMs: 500,
        });
        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toBe('data:image/png;base64,AAAA');
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects when the canvas cannot be read (for example a tainted canvas)', async () => {
      const { map, raw, fire } = fakeMap();
      raw.getCanvas.mockReturnValue({
        toDataURL: vi.fn(() => {
          throw new Error('tainted');
        }),
      });
      const promise = createMapActions(map, createStyleReadyRegistry()).capturePng();
      fire('idle');
      await expect(promise).rejects.toThrow('tainted');
    });
  });

  it('updates a paint property by layer id', () => {
    const { map, raw } = fakeMap();
    createMapActions(map, createStyleReadyRegistry()).setPaint(
      LAYER_IDS.gridFill,
      'fill-color',
      '#fff',
    );
    expect(raw.setPaintProperty).toHaveBeenCalledWith(LAYER_IDS.gridFill, 'fill-color', '#fff');
  });
});

describe('installOverlay', () => {
  const overlay = () => {
    const pattern = getNoDataPattern('light');
    return {
      sources: { [GRID_SOURCE_ID]: GRID_SOURCE_SPEC },
      images: [{ id: pattern.id, image: renderNoDataPattern(pattern) }],
      layers: buildGridLayers({
        theme: 'light',
        scale: getColorScale('cpi', 'light'),
        domain: cpiDomain(),
      }),
    };
  };

  it('adds missing sources, images and layers', () => {
    const { map, raw, layers } = fakeMap();
    createMapActions(map, createStyleReadyRegistry()).installOverlay(overlay());
    expect(raw.addSource).toHaveBeenCalledWith(GRID_SOURCE_ID, GRID_SOURCE_SPEC);
    expect(raw.addImage).toHaveBeenCalledTimes(1);
    expect(layers.has(LAYER_IDS.gridFill)).toBe(true);
    expect(layers.has(LAYER_IDS.highlight)).toBe(true);
  });

  it('reports whether it had to install anything, so callers know feature-state was wiped', () => {
    const { map, layers, sources } = fakeMap();
    const actions = createMapActions(map, createStyleReadyRegistry());
    expect(actions.installOverlay(overlay())).toBe(true);
    expect(actions.installOverlay(overlay())).toBe(false);
    layers.clear();
    sources.clear();
    expect(actions.installOverlay(overlay())).toBe(true);
  });

  it('is idempotent, so a style reload can reinstall safely', () => {
    const { map, raw } = fakeMap();
    const actions = createMapActions(map, createStyleReadyRegistry());
    actions.installOverlay(overlay());
    const layerCalls = raw.addLayer.mock.calls.length;
    actions.installOverlay(overlay());
    expect(raw.addLayer.mock.calls.length).toBe(layerCalls);
    expect(raw.addSource).toHaveBeenCalledTimes(1);
    expect(raw.addImage).toHaveBeenCalledTimes(1);
  });
});

describe('onLayerEvent', () => {
  it('maps MapLibre events to a cell id and pixel point, and returns an unsubscribe', () => {
    const { map, raw, listeners } = fakeMap();
    const handler = vi.fn();
    const off = createMapActions(map, createStyleReadyRegistry()).onLayerEvent(
      'mousemove',
      LAYER_IDS.gridFill,
      handler,
    );
    expect(listeners).toHaveLength(1);
    listeners[0]?.handler({ features: [{ id: 12 }], point: { x: 5, y: 9 } });
    expect(handler).toHaveBeenCalledWith({ type: 'mousemove', id: 12, point: { x: 5, y: 9 } });
    off();
    expect(raw.off).toHaveBeenCalledWith('mousemove', LAYER_IDS.gridFill, listeners[0]?.handler);
  });

  it('reports a null id when the event has no feature', () => {
    const { map, listeners } = fakeMap();
    const handler = vi.fn();
    createMapActions(map, createStyleReadyRegistry()).onLayerEvent(
      'mouseleave',
      LAYER_IDS.gridFill,
      handler,
    );
    listeners[0]?.handler({ point: { x: 0, y: 0 } });
    expect(handler).toHaveBeenCalledWith({ type: 'mouseleave', id: null, point: { x: 0, y: 0 } });
  });
});
