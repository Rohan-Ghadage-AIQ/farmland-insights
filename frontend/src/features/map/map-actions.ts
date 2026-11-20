import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  SourceSpecification,
} from 'maplibre-gl';
import type { PatternImage } from './color-scales';
import type { Bounds } from './types';

export type GeoJsonData = Parameters<GeoJSONSource['setData']>[0];
export type PaintProperty = Parameters<MapLibreMap['setPaintProperty']>[1];
export type PaintValue = Parameters<MapLibreMap['setPaintProperty']>[2];

export interface FitBoundsOptions {
  readonly padding?: number;
  readonly maxZoom?: number;
  /** False skips the animation, for `prefers-reduced-motion`. */
  readonly animate?: boolean;
}

export interface FeatureTarget {
  readonly source: string;
  readonly id: string | number;
}

export interface OverlaySpec {
  readonly sources: Readonly<Record<string, SourceSpecification>>;
  readonly images: readonly { readonly id: string; readonly image: PatternImage }[];
  /** Bottom first. */
  readonly layers: readonly LayerSpecification[];
}

export interface CellPointerEvent {
  readonly type: 'mousemove' | 'mouseleave' | 'click';
  /** The promoted grid id of the feature under the pointer, or null. */
  readonly id: string | number | null;
  readonly point: { readonly x: number; readonly y: number };
}

/** `[longitude, latitude]` */
export type LngLat = [number, number];

/** The typed imperative surface other components get through context. */
export interface MapActions {
  fitBounds(bounds: Bounds, options?: FitBoundsOptions): void;
  /** Replaces a GeoJSON source's data. Returns false when the source is not installed. */
  setData(sourceId: string, data: GeoJsonData): boolean;
  setFeatureState(target: FeatureTarget, state: Readonly<Record<string, boolean>>): void;
  removeFeatureState(target: FeatureTarget, key?: string): void;
  clearFeatureState(sourceId: string): void;
  setPaint(layerId: string, property: PaintProperty, value: PaintValue): void;
  resize(): void;
  /**
   * Moves the camera to a position and zoom. Animated unless `animate` is false (reduced motion).
   * Unlike `fitBounds` this centres on a point, for "go to these coordinates".
   */
  flyTo(lngLat: LngLat, options?: { zoom?: number; animate?: boolean }): void;
  /** Where a map position is on screen, in pixels inside the map container. */
  project(lngLat: LngLat): { x: number; y: number };
  /** The map position under a pixel inside the map container. */
  unproject(point: { readonly x: number; readonly y: number }): LngLat;
  /** Runs `handler` whenever the map pans, zooms or resizes. Returns the unsubscribe function. */
  onMove(handler: () => void): () => void;
  /** PNG of the current canvas. Needs `preserveDrawingBuffer`, which MapView enables. */
  exportPng(): string;
  /**
   * PNG of the map once it has finished drawing (tiles loaded), optionally after framing `bounds`
   * without animation. Resolves with whatever is drawn after `timeoutMs` (default 10 s) so a slow
   * tile server cannot hang an export. Used for the HTML report's map image.
   */
  capturePng(options?: { bounds?: Bounds; timeoutMs?: number }): Promise<string>;
  /**
   * Adds missing sources, images and layers. Safe to call again after a style reload.
   * Returns true when it had to add anything, which means feature-state was wiped too.
   */
  installOverlay(overlay: OverlaySpec): boolean;
  /**
   * Runs now if the style is loaded, and again after every style change. Callbacks run in
   * ascending `order` (default 0), so installers can run before state appliers.
   */
  onStyleReady(callback: () => void, order?: number): () => void;
  onLayerEvent(
    type: CellPointerEvent['type'],
    layerId: string,
    handler: (event: CellPointerEvent) => void,
  ): () => void;
}

export interface StyleReadyRegistry {
  register(callback: () => void, order?: number): () => void;
  /** The style finished (re)loading: run every registered callback. */
  markReady(): void;
  /** A style change started: sources and layers are gone until the next `markReady`. */
  markLoading(): void;
}

export function createStyleReadyRegistry(): StyleReadyRegistry {
  interface Entry {
    readonly callback: () => void;
    readonly order: number;
  }
  const entries = new Set<Entry>();
  let ready = false;
  return {
    register(callback, order = 0) {
      const entry: Entry = { callback, order };
      entries.add(entry);
      if (ready) callback();
      return () => {
        entries.delete(entry);
      };
    },
    markReady() {
      if (ready) return;
      ready = true;
      // Array.sort is stable, so equal orders keep registration order.
      for (const entry of [...entries].sort((a, b) => a.order - b.order)) entry.callback();
    },
    markLoading() {
      ready = false;
    },
  };
}

const isGeoJsonSource = (source: unknown): source is GeoJSONSource =>
  typeof source === 'object' &&
  source !== null &&
  'type' in source &&
  source.type === 'geojson' &&
  'setData' in source;

export function createMapActions(map: MapLibreMap, registry: StyleReadyRegistry): MapActions {
  return {
    fitBounds([west, south, east, north], options = {}) {
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: options.padding ?? 48,
          maxZoom: options.maxZoom ?? 18,
          ...(options.animate === false ? { duration: 0 } : {}),
        },
      );
    },

    setData(sourceId, data) {
      const source = map.getSource(sourceId);
      if (!isGeoJsonSource(source)) return false;
      // MapLibre 6 returns a promise that settles once the data is parsed; callers do not wait on it.
      void source.setData(data);
      return true;
    },

    setFeatureState(target, state) {
      map.setFeatureState(target, { ...state });
    },

    removeFeatureState(target, key) {
      if (key === undefined) map.removeFeatureState(target);
      else map.removeFeatureState(target, key);
    },

    clearFeatureState(sourceId) {
      map.removeFeatureState({ source: sourceId });
    },

    setPaint(layerId, property, value) {
      map.setPaintProperty(layerId, property, value);
    },

    resize() {
      map.resize();
    },

    flyTo(center, { zoom = 16, animate = true } = {}) {
      if (animate) map.flyTo({ center, zoom });
      else map.jumpTo({ center, zoom });
    },

    project(lngLat) {
      const { x, y } = map.project(lngLat);
      return { x, y };
    },

    unproject({ x, y }) {
      const { lng, lat } = map.unproject([x, y]);
      return [lng, lat];
    },

    onMove(handler) {
      map.on('move', handler);
      return () => {
        map.off('move', handler);
      };
    },

    exportPng() {
      return map.getCanvas().toDataURL('image/png');
    },

    capturePng({ bounds, timeoutMs = 10_000 } = {}) {
      return new Promise<string>((resolve, reject) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            resolve(map.getCanvas().toDataURL('image/png'));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        const timer = setTimeout(finish, timeoutMs);
        // Listen before moving the camera so the idle that follows the redraw is not missed.
        map.once('idle', finish);
        if (bounds !== undefined) {
          const [west, south, east, north] = bounds;
          map.fitBounds(
            [
              [west, south],
              [east, north],
            ],
            { padding: 48, maxZoom: 18, duration: 0 },
          );
        }
        map.triggerRepaint();
      });
    },

    installOverlay({ sources, images, layers }) {
      let added = false;
      for (const [id, spec] of Object.entries(sources)) {
        if (map.getSource(id) === undefined) {
          map.addSource(id, spec);
          added = true;
        }
      }
      for (const { id, image } of images) {
        if (!map.hasImage(id)) {
          map.addImage(id, image, { pixelRatio: 1 });
          added = true;
        }
      }
      for (const layer of layers) {
        if (map.getLayer(layer.id) === undefined) {
          map.addLayer(layer);
          added = true;
        }
      }
      return added;
    },

    onStyleReady: (callback, order) => registry.register(callback, order),

    onLayerEvent(type, layerId, handler) {
      const listener = (event: MapLayerMouseEvent): void => {
        handler({ type, id: event.features?.[0]?.id ?? null, point: event.point });
      };
      map.on(type, layerId, listener);
      return () => {
        map.off(type, layerId, listener);
      };
    },
  };
}
