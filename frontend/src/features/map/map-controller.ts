import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { createMapActions, createStyleReadyRegistry, type MapActions } from './map-actions';

export interface MapContextValue {
  readonly map: MapLibreMap;
  readonly actions: MapActions;
}

export interface MapInit {
  readonly style: StyleSpecification | string;
  readonly center: readonly [number, number];
  readonly zoom: number;
}

/**
 * Owns the MapLibre instance outside React, as an external store. React reads it with
 * `useSyncExternalStore`, so there is no setState-in-effect and StrictMode's mount, unmount,
 * mount cycle simply creates a second map after removing the first.
 */
export interface MapController {
  /** Creates the map in `container`. Returns a function that removes it. */
  attach(container: HTMLElement, init: MapInit): () => void;
  /** Swaps the basemap. A full style reload: overlays reinstall through `onStyleReady`. */
  setStyle(style: StyleSpecification | string): void;
  // Property signatures (not methods): they are handed to useSyncExternalStore unbound.
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => MapContextValue | null;
}

/** How far in the map zooms. Imagery is real to level 18; the two levels beyond are stretched. */
export const MAX_MAP_ZOOM = 20;

export function createMapController(): MapController {
  const listeners = new Set<() => void>();
  let snapshot: MapContextValue | null = null;
  let registry = createStyleReadyRegistry();

  const publish = (next: MapContextValue | null): void => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    attach(container, init) {
      // MapLibre looks for its worker beside its own module URL, which a bundler relocates.
      setWorkerUrl(workerUrl);
      const map = new MapLibreMap({
        container,
        style: init.style,
        center: [...init.center],
        zoom: init.zoom,
        attributionControl: { compact: true },
        // Required for map.getCanvas().toDataURL() (PNG export) to return the drawn frame.
        canvasContextAttributes: { preserveDrawingBuffer: true },
        // A choropleth is read top-down.
        dragRotate: false,
        maxPitch: 0,
        // Past this the stretched tiles are too blurry to be useful.
        maxZoom: MAX_MAP_ZOOM,
      });
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

      registry = createStyleReadyRegistry();
      const ownRegistry = registry;
      map.on('style.load', () => {
        ownRegistry.markReady();
      });

      publish({ map, actions: createMapActions(map, ownRegistry) });

      return () => {
        map.remove();
        if (snapshot?.map === map) publish(null);
      };
    },

    setStyle(style) {
      if (snapshot === null) return;
      registry.markLoading();
      // diff:false forces a full reload: overlay layers added at runtime are not in the style JSON.
      snapshot.map.setStyle(style, { diff: false });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,
  };
}
