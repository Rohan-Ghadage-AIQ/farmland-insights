import type { Map as MapLibreMap } from 'maplibre-gl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDrawController,
  createTerraDraw,
  farmsEqual,
  snapshotToFarm,
  type DrawLike,
  type DrawState,
} from './draw';
import type { FarmFeatureCollection } from './types';

// Terra Draw drives WebGL through MapLibre, so it is replaced at the module boundary.
vi.mock('terra-draw', () => {
  class TerraDraw {
    static last: TerraDraw | undefined;
    constructor(readonly options: Record<string, unknown>) {
      TerraDraw.last = this;
    }
  }
  class Mode {
    constructor(readonly options?: Record<string, unknown>) {}
  }
  class TerraDrawPolygonMode extends Mode {
    readonly mode = 'polygon';
  }
  class TerraDrawSelectMode extends Mode {
    readonly mode = 'select';
  }
  class Plain {
    readonly kind = 'plain';
  }
  return {
    TerraDraw,
    TerraDrawPolygonMode,
    TerraDrawSelectMode,
    TerraDrawSessionUndoRedo: Plain,
    TerraDrawModeUndoRedo: Plain,
    TerraDrawUndoRedoKeyboardShortcuts: Plain,
    ValidateNotSelfIntersecting: vi.fn(() => ({ valid: true })),
  };
});

vi.mock('terra-draw-maplibre-gl-adapter', () => ({
  TerraDrawMapLibreGLAdapter: class {
    constructor(readonly config: unknown) {}
  },
}));

type Listener = (...args: unknown[]) => void;

interface StoredFeature {
  type: 'Feature';
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

const ring = (x: number): [number, number][] => [
  [x, 0],
  [x + 1, 0],
  [x + 1, 1],
  [x, 1],
  [x, 0],
];

const polygon = (id: string, x: number, extra: Record<string, unknown> = {}): StoredFeature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [ring(x)] },
  properties: { mode: 'polygon', ...extra },
});

function fakeDraw(initial: StoredFeature[] = []) {
  const store = [...initial];
  const listeners = new Map<string, Set<Listener>>();
  let mode = 'static';
  let undoable = false;
  let redoable = false;
  const emit = (event: string, ...args: unknown[]): void => {
    for (const callback of listeners.get(event) ?? []) callback(...args);
  };
  const draw = {
    start: vi.fn(),
    stop: vi.fn(),
    setMode: vi.fn((next: string) => {
      mode = next;
    }),
    getMode: vi.fn(() => mode),
    on: vi.fn((event: string, callback: Listener) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(callback));
    }),
    off: vi.fn((event: string, callback: Listener) => {
      listeners.get(event)?.delete(callback);
    }),
    getSnapshot: vi.fn(() => store.map((f) => structuredClone(f))),
    // Like Terra Draw, clearing announces the removal as a `change` event of type "delete".
    clear: vi.fn(() => {
      const ids = store.map((f) => f.id);
      store.length = 0;
      if (ids.length > 0) emit('change', ids, 'delete');
    }),
    addFeatures: vi.fn((features: StoredFeature[]) => {
      store.push(...features);
      return features.map(() => ({ valid: true }));
    }),
    removeFeatures: vi.fn(),
    selectFeature: vi.fn(),
    undo: vi.fn(() => undoable),
    redo: vi.fn(() => redoable),
    canUndo: vi.fn(() => undoable),
    canRedo: vi.fn(() => redoable),
    clearUndoRedoHistory: vi.fn(),
  };
  return {
    draw: draw as unknown as DrawLike,
    raw: draw,
    store,
    emit,
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
    setHistory: (canUndo: boolean, canRedo: boolean) => {
      undoable = canUndo;
      redoable = canRedo;
    },
  };
}

function setup(initial: StoredFeature[] = []) {
  const fake = fakeDraw(initial);
  const onChange = vi.fn<(value: FarmFeatureCollection | null) => void>();
  const onState = vi.fn<(state: DrawState) => void>();
  const controller = createDrawController(fake.draw, { onChange, onState });
  return { ...fake, controller, onChange, onState };
}

describe('snapshotToFarm', () => {
  it('returns null when there is no finished polygon', () => {
    expect(snapshotToFarm([])).toBeNull();
  });

  it('converts polygons to a FarmFeatureCollection with 2D positions and empty properties', () => {
    const farm = snapshotToFarm([polygon('a', 0, { extra: 1 })] as never);
    expect(farm).toEqual({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(0)] }, properties: {} },
      ],
    });
  });

  it('drops the third (altitude) coordinate', () => {
    const feature = polygon('a', 0);
    feature.geometry.coordinates = [ring(0).map(([x, y]) => [x, y, 5])];
    expect(snapshotToFarm([feature] as never)?.features[0]?.geometry.coordinates[0]?.[0]).toEqual([
      0, 0,
    ]);
  });

  it('ignores Terra Draw helper features (selection points, midpoints) and non-polygon geometry', () => {
    const point: StoredFeature = {
      type: 'Feature',
      id: 'p',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { mode: 'select', selectionPoint: true },
    };
    const line: StoredFeature = {
      type: 'Feature',
      id: 'l',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      properties: { mode: 'polygon' },
    };
    const farm = snapshotToFarm([point, line, polygon('a', 0)] as never);
    expect(farm?.features).toHaveLength(1);
  });

  it('skips a polygon that is still being drawn (ring too short to be valid)', () => {
    const drawing = polygon('d', 0);
    drawing.geometry.coordinates = [
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    ];
    expect(snapshotToFarm([drawing] as never)).toBeNull();
  });

  it('keeps several polygons', () => {
    expect(snapshotToFarm([polygon('a', 0), polygon('b', 5)] as never)?.features).toHaveLength(2);
  });
});

describe('farmsEqual', () => {
  const a = snapshotToFarm([polygon('a', 0)] as never);
  it('compares by content, with null equal to null', () => {
    expect(farmsEqual(a, snapshotToFarm([polygon('other-id', 0)] as never))).toBe(true);
    expect(farmsEqual(a, snapshotToFarm([polygon('a', 3)] as never))).toBe(false);
    expect(farmsEqual(null, null)).toBe(true);
    expect(farmsEqual(a, null)).toBe(false);
  });
});

describe('createDrawController', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('starts Terra Draw once and reports the idle state', () => {
    ctx.controller.start();
    expect(ctx.raw.start).toHaveBeenCalledTimes(1);
    expect(ctx.onState).toHaveBeenLastCalledWith({
      mode: 'idle',
      canUndo: false,
      canRedo: false,
      hasPolygon: false,
    });
  });

  it('reports whether a finished polygon exists, so Edit can be disabled without one', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.emit('finish', 'a', { mode: 'select', action: 'dragCoordinate' });
    expect(ctx.onState).toHaveBeenLastCalledWith(expect.objectContaining({ hasPolygon: true }));
    ctx.store.length = 0;
    ctx.emit('change', ['a'], 'delete');
    expect(ctx.onState).toHaveBeenLastCalledWith(expect.objectContaining({ hasPolygon: false }));
  });

  it('startDrawing switches to polygon mode', () => {
    ctx.controller.start();
    ctx.controller.startDrawing();
    expect(ctx.raw.setMode).toHaveBeenLastCalledWith('polygon');
    expect(ctx.onState).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'drawing' }));
  });

  it('on finishing a polygon emits the farm and switches to vertex editing on it', () => {
    ctx.controller.start();
    ctx.controller.startDrawing();
    ctx.store.push(polygon('new', 0));
    ctx.emit('finish', 'new', { mode: 'polygon', action: 'draw' });
    expect(ctx.onChange).toHaveBeenCalledTimes(1);
    expect(ctx.onChange.mock.calls[0]?.[0]?.features).toHaveLength(1);
    expect(ctx.raw.setMode).toHaveBeenLastCalledWith('select');
    expect(ctx.raw.selectFeature).toHaveBeenCalledWith('new');
    expect(ctx.onState).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'editing' }));
  });

  it('emits again after a vertex edit, but not when the geometry did not change', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.emit('finish', 'a', { mode: 'select', action: 'dragCoordinate' });
    ctx.emit('finish', 'a', { mode: 'select', action: 'dragFeature' });
    expect(ctx.onChange).toHaveBeenCalledTimes(1);
    ctx.store[0] = polygon('a', 2);
    ctx.emit('finish', 'a', { mode: 'select', action: 'dragCoordinate' });
    expect(ctx.onChange).toHaveBeenCalledTimes(2);
  });

  it('does not switch mode when a finish comes from editing', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.raw.setMode.mockClear();
    ctx.emit('finish', 'a', { mode: 'select', action: 'dragCoordinate' });
    expect(ctx.raw.setMode).not.toHaveBeenCalled();
  });

  it('emits null when a delete change empties the store', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.emit('finish', 'a', { mode: 'polygon', action: 'draw' });
    ctx.store.length = 0;
    ctx.emit('change', ['a'], 'delete');
    expect(ctx.onChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores change events that are not deletions (they fire on every pointer move)', () => {
    ctx.controller.start();
    ctx.emit('change', ['a'], 'update');
    ctx.emit('change', ['a'], 'create');
    expect(ctx.onChange).not.toHaveBeenCalled();
  });

  it('undo and redo delegate to Terra Draw and are safe no-ops with empty history', () => {
    ctx.controller.start();
    ctx.controller.undo();
    ctx.controller.redo();
    expect(ctx.raw.undo).not.toHaveBeenCalled();
    expect(ctx.raw.redo).not.toHaveBeenCalled();

    ctx.setHistory(true, true);
    ctx.controller.undo();
    ctx.controller.redo();
    expect(ctx.raw.undo).toHaveBeenCalledTimes(1);
    expect(ctx.raw.redo).toHaveBeenCalledTimes(1);
  });

  it('history events refresh the undo/redo state and re-emit the farm', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.setHistory(true, false);
    ctx.emit('history', { cause: 'push' });
    expect(ctx.onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ canUndo: true, canRedo: false }),
    );
    expect(ctx.onChange).toHaveBeenCalledTimes(1);
  });

  it('startEditing selects the first polygon, and does nothing when there is none', () => {
    ctx.controller.start();
    ctx.controller.startEditing();
    expect(ctx.raw.selectFeature).not.toHaveBeenCalled();
    ctx.store.push(polygon('a', 0), polygon('b', 3));
    ctx.controller.startEditing();
    expect(ctx.raw.setMode).toHaveBeenLastCalledWith('select');
    expect(ctx.raw.selectFeature).toHaveBeenCalledWith('a');
  });

  it('stopDrawing returns to the idle (static) mode', () => {
    ctx.controller.start();
    ctx.controller.startDrawing();
    ctx.controller.stopDrawing();
    expect(ctx.raw.setMode).toHaveBeenLastCalledWith('static');
    expect(ctx.onState).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'idle' }));
  });

  it('clear empties the store and history, and emits null', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.emit('finish', 'a', { mode: 'polygon', action: 'draw' });
    ctx.controller.clear();
    expect(ctx.raw.clear).toHaveBeenCalled();
    expect(ctx.raw.clearUndoRedoHistory).toHaveBeenCalled();
    expect(ctx.onChange).toHaveBeenLastCalledWith(null);
  });

  it('setFarm loads polygons for editing without echoing them back through onChange', () => {
    ctx.controller.start();
    const farm: FarmFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(0)] }, properties: {} },
      ],
    };
    ctx.controller.setFarm(farm);
    expect(ctx.raw.clear).toHaveBeenCalled();
    expect(ctx.raw.addFeatures).toHaveBeenCalledTimes(1);
    const added = ctx.raw.addFeatures.mock.calls[0]?.[0];
    if (added === undefined) throw new Error('addFeatures was not called');
    expect(added[0]?.properties).toMatchObject({ mode: 'polygon' });
    expect(ctx.onChange).not.toHaveBeenCalled();
    expect(farmsEqual(ctx.controller.getValue(), farm)).toBe(true);
  });

  it('setFarm does not report the delete events Terra Draw fires while clearing the old drawing', () => {
    ctx.controller.start();
    ctx.store.push(polygon('old', 0));
    ctx.emit('finish', 'old', { mode: 'select', action: 'dragCoordinate' });
    ctx.onChange.mockClear();
    ctx.controller.setFarm({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(4)] }, properties: {} },
      ],
    });
    expect(ctx.onChange).not.toHaveBeenCalled();
  });

  it('setFarm splits a MultiPolygon into editable polygons', () => {
    ctx.controller.start();
    ctx.controller.setFarm({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[ring(0)], [ring(5)]] },
          properties: {},
        },
      ],
    });
    const added = ctx.raw.addFeatures.mock.calls[0]?.[0];
    if (added === undefined) throw new Error('addFeatures was not called');
    expect(added).toHaveLength(2);
    expect(added.every((f) => f.geometry.type === 'Polygon')).toBe(true);
  });

  it('setFarm(null) clears the drawing', () => {
    ctx.controller.start();
    ctx.store.push(polygon('a', 0));
    ctx.controller.setFarm(null);
    expect(ctx.raw.clear).toHaveBeenCalled();
    expect(ctx.raw.addFeatures).not.toHaveBeenCalled();
  });

  it('destroy unsubscribes every listener and stops Terra Draw', () => {
    ctx.controller.start();
    ctx.controller.destroy();
    expect(ctx.raw.stop).toHaveBeenCalledTimes(1);
    expect(ctx.listenerCount('finish')).toBe(0);
    expect(ctx.listenerCount('history')).toBe(0);
    expect(ctx.listenerCount('change')).toBe(0);
  });
});

describe('createTerraDraw (configuration)', () => {
  it('wires the MapLibre adapter, polygon and select modes, validation and undo/redo', async () => {
    const terra = await import('terra-draw');
    const map = {} as MapLibreMap;
    createTerraDraw(map);
    const instance = (terra.TerraDraw as unknown as { last: { options: Record<string, unknown> } })
      .last;
    const options = instance.options as {
      adapter: { config: { map: unknown } };
      modes: { mode: string; options?: Record<string, unknown> }[];
      undoRedo: Record<string, unknown>;
    };
    expect(options.adapter.config.map).toBe(map);
    expect(options.modes.map((m) => m.mode)).toEqual(['polygon', 'select']);
    expect(typeof options.modes[0]?.options?.validation).toBe('function');

    const flags = (
      options.modes[1]?.options as { flags: { polygon: { feature: Record<string, unknown> } } }
    ).flags.polygon.feature;
    expect(flags.draggable).toBe(true);
    expect(flags.coordinates).toMatchObject({
      draggable: true,
      deletable: true,
      midpoints: true,
    });
    expect(options.undoRedo).toHaveProperty('sessionLevel');
    expect(options.undoRedo).toHaveProperty('modeLevel');
    expect(options.undoRedo).toHaveProperty('keyboardShortcuts');
  });
});
