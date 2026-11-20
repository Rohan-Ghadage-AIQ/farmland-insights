/** Test double for a Terra Draw instance. Only used from tests. */
import { vi } from 'vitest';
import type { DrawLike } from './draw';

type Listener = (...args: unknown[]) => void;

export interface StoredFeature {
  type: 'Feature';
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

export const ring = (x: number): [number, number][] => [
  [x, 0],
  [x + 1, 0],
  [x + 1, 1],
  [x, 1],
  [x, 0],
];

export const polygon = (id: string, x: number): StoredFeature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [ring(x)] },
  properties: { mode: 'polygon' },
});

export function createFakeDraw(initial: StoredFeature[] = []) {
  const store = [...initial];
  const listeners = new Map<string, Set<Listener>>();
  let mode = 'static';
  let undoable = false;
  let redoable = false;
  let nextId = 1;

  const emit = (event: string, ...args: unknown[]): void => {
    for (const callback of listeners.get(event) ?? []) callback(...args);
  };

  const raw = {
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
    clear: vi.fn(() => {
      const ids = store.map((f) => f.id);
      store.length = 0;
      if (ids.length > 0) emit('change', ids, 'delete');
    }),
    addFeatures: vi.fn((features: Omit<StoredFeature, 'id'>[]) => {
      for (const feature of features) store.push({ ...feature, id: `gen-${String(nextId++)}` });
      return features.map(() => ({ valid: true }));
    }),
    selectFeature: vi.fn(),
    undo: vi.fn(() => undoable),
    redo: vi.fn(() => redoable),
    canUndo: vi.fn(() => undoable),
    canRedo: vi.fn(() => redoable),
    clearUndoRedoHistory: vi.fn(),
  };

  return {
    draw: raw as unknown as DrawLike,
    raw,
    store,
    emit,
    setHistory: (canUndo: boolean, canRedo: boolean) => {
      undoable = canUndo;
      redoable = canRedo;
    },
  };
}

export type FakeDraw = ReturnType<typeof createFakeDraw>;
