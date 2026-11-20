import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawModeUndoRedo,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  TerraDrawSessionUndoRedo,
  TerraDrawUndoRedoKeyboardShortcuts,
  ValidateNotSelfIntersecting,
  type GeoJSONStoreFeatures,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { FarmFeature, FarmFeatureCollection } from './types';

/** The slice of Terra Draw the controller uses; the real `TerraDraw` satisfies it. */
export type DrawLike = Pick<
  TerraDraw,
  | 'start'
  | 'stop'
  | 'setMode'
  | 'on'
  | 'off'
  | 'getSnapshot'
  | 'clear'
  | 'addFeatures'
  | 'selectFeature'
  | 'undo'
  | 'redo'
  | 'canUndo'
  | 'canRedo'
  | 'clearUndoRedoHistory'
>;

const POLYGON_MODE = 'polygon';
const SELECT_MODE = 'select';
const IDLE_MODE = 'static';

/** A ring needs 4 positions (3 corners plus the closing one) to be a polygon at all. */
const MIN_RING_POSITIONS = 4;

/**
 * Builds a Terra Draw instance bound to the MapLibre map: polygon drawing, vertex editing (drag,
 * add via midpoints, delete), self-intersection rejected, and undo/redo with Ctrl/Cmd+Z.
 */
export function createTerraDraw(map: MapLibreMap): TerraDraw {
  const rejectSelfIntersection = (feature: GeoJSONStoreFeatures) =>
    ValidateNotSelfIntersecting(feature);
  return new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawPolygonMode({ validation: rejectSelfIntersection }),
      new TerraDrawSelectMode({
        flags: {
          [POLYGON_MODE]: {
            feature: {
              draggable: true,
              validation: rejectSelfIntersection,
              coordinates: { draggable: true, deletable: true, midpoints: true },
            },
          },
        },
      }),
    ],
    undoRedo: {
      modeLevel: new TerraDrawModeUndoRedo(),
      sessionLevel: new TerraDrawSessionUndoRedo(),
      keyboardShortcuts: new TerraDrawUndoRedoKeyboardShortcuts(),
    },
  });
}

// --- Pure conversions ---------------------------------------------------------------------------

const isFinishedPolygon = (feature: GeoJSONStoreFeatures): boolean =>
  feature.geometry.type === 'Polygon' &&
  feature.properties.mode === POLYGON_MODE &&
  feature.geometry.coordinates.every((ring) => ring.length >= MIN_RING_POSITIONS);

/**
 * Converts a Terra Draw snapshot into the API's farm shape. Selection points, midpoints and
 * polygons still being drawn are left out. Returns null when there is nothing to analyse.
 */
export function snapshotToFarm(
  snapshot: readonly GeoJSONStoreFeatures[],
): FarmFeatureCollection | null {
  const features: FarmFeature[] = [];
  for (const feature of snapshot) {
    if (feature.geometry.type !== 'Polygon' || !isFinishedPolygon(feature)) continue;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: feature.geometry.coordinates.map((ring) =>
          ring.map((position): [number, number] => [position[0] ?? 0, position[1] ?? 0]),
        ),
      },
      properties: {},
    });
  }
  return features.length === 0 ? null : { type: 'FeatureCollection', features };
}

/** Structural equality, so the editor and the form can sync without echoing each other. */
export function farmsEqual(
  a: FarmFeatureCollection | null,
  b: FarmFeatureCollection | null,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Terra Draw edits Polygons only, so a MultiPolygon becomes one editable polygon per part. */
function farmToDrawFeatures(farm: FarmFeatureCollection): GeoJSONStoreFeatures[] {
  return farm.features.flatMap((feature): GeoJSONStoreFeatures[] => {
    const rings =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    return rings.map((coordinates) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates },
      properties: { mode: POLYGON_MODE },
    }));
  });
}

// --- Controller ---------------------------------------------------------------------------------

export interface DrawState {
  readonly mode: 'idle' | 'drawing' | 'editing';
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** A finished polygon exists, so there is something to edit or clear. */
  readonly hasPolygon: boolean;
}

export interface DrawCallbacks {
  /** The farm after every completed change; null when the drawing is empty. */
  readonly onChange: (farm: FarmFeatureCollection | null) => void;
  readonly onState: (state: DrawState) => void;
}

export interface DrawController {
  start(): void;
  startDrawing(): void;
  startEditing(): void;
  stopDrawing(): void;
  undo(): void;
  redo(): void;
  clear(): void;
  /** Replaces the drawing (upload, paste, sample). Does not call `onChange`. */
  setFarm(farm: FarmFeatureCollection | null): void;
  getValue(): FarmFeatureCollection | null;
  destroy(): void;
}

export function createDrawController(draw: DrawLike, callbacks: DrawCallbacks): DrawController {
  let mode: DrawState['mode'] = 'idle';
  let lastEmitted: FarmFeatureCollection | null = null;
  // True while we change the drawing ourselves, so Terra Draw's own events are not read as user edits.
  let muted = false;

  const getValue = (): FarmFeatureCollection | null => snapshotToFarm(draw.getSnapshot());

  const reportState = (): void => {
    callbacks.onState({
      mode,
      canUndo: draw.canUndo(),
      canRedo: draw.canRedo(),
      hasPolygon: firstPolygonId() !== undefined,
    });
  };

  const emitIfChanged = (): void => {
    if (muted) return;
    const value = getValue();
    if (farmsEqual(value, lastEmitted)) return;
    lastEmitted = value;
    callbacks.onChange(value);
  };

  const firstPolygonId = (): string | number | undefined =>
    draw.getSnapshot().find(isFinishedPolygon)?.id;

  const beginEditing = (id: string | number): void => {
    draw.setMode(SELECT_MODE);
    draw.selectFeature(id);
    mode = 'editing';
  };

  const onFinish = (id: string | number, context: { mode: string }): void => {
    const drewNewPolygon = context.mode === POLYGON_MODE;
    emitIfChanged();
    // A polygon was just completed: drop straight into vertex editing on it.
    if (drewNewPolygon) beginEditing(id);
    reportState();
  };

  const onChange = (_ids: unknown, type: string): void => {
    // `change` also fires on every pointer move while drawing; only deletions matter here.
    if (type === 'delete') {
      emitIfChanged();
      reportState();
    }
  };

  const onHistory = (): void => {
    emitIfChanged();
    reportState();
  };

  return {
    start() {
      draw.start();
      draw.on('finish', onFinish);
      draw.on('change', onChange);
      draw.on('history', onHistory);
      mode = 'idle';
      reportState();
    },

    startDrawing() {
      draw.setMode(POLYGON_MODE);
      mode = 'drawing';
      reportState();
    },

    startEditing() {
      const id = firstPolygonId();
      if (id === undefined) return;
      beginEditing(id);
      reportState();
    },

    stopDrawing() {
      draw.setMode(IDLE_MODE);
      mode = 'idle';
      reportState();
    },

    undo() {
      if (!draw.canUndo()) return;
      draw.undo();
      emitIfChanged();
      reportState();
    },

    redo() {
      if (!draw.canRedo()) return;
      draw.redo();
      emitIfChanged();
      reportState();
    },

    clear() {
      draw.clear();
      draw.clearUndoRedoHistory();
      mode = 'idle';
      draw.setMode(IDLE_MODE);
      emitIfChanged();
      reportState();
    },

    setFarm(farm) {
      muted = true;
      try {
        draw.clear();
        draw.clearUndoRedoHistory();
        if (farm !== null) draw.addFeatures(farmToDrawFeatures(farm));
      } finally {
        muted = false;
      }
      // What we just loaded is the new baseline, so it is not reported back as a user change.
      lastEmitted = getValue();
      mode = 'idle';
      draw.setMode(IDLE_MODE);
      reportState();
    },

    getValue,

    destroy() {
      draw.off('finish', onFinish);
      draw.off('change', onChange);
      draw.off('history', onHistory);
      draw.stop();
    },
  };
}
