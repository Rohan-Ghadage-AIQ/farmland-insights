import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { env } from '@/lib/env';
import {
  availableBasemaps,
  resolveBasemapStyle,
  type BasemapConfig,
  type BasemapKind,
} from './basemap';
import { CoordinatePin } from './CoordinatePin';
import { CoordinateSearch } from './CoordinateSearch';
import type { Coordinates } from './coordinates';
import { LayerPanel } from './LayerPanel';
import { LayerVisibilitySync } from './LayerVisibilitySync';
import { DEFAULT_LAYER_STATE, type MapLayerState } from './layer-visibility';
import { MapContext } from './map-context';
import { createMapController } from './map-controller';
import type { Bounds, Theme } from './types';

// Roughly the Indian subcontinent: where the backend's crop catalogue is relevant.
const DEFAULT_CENTER = [79, 22] as const;
const DEFAULT_ZOOM = 4;

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface MapViewProps {
  readonly theme: Theme;
  /** `[west, south, east, north]` of the field. The map fits to it when it changes. */
  readonly fieldBounds?: Bounds | null;
  /** Defaults to the VITE_MAP_* environment configuration. */
  readonly basemapConfig?: BasemapConfig;
  readonly className?: string;
  /** Rendered inside the map's context, once the map exists. Use `useMapActions()` in them. */
  readonly children?: ReactNode;
}

const envBasemapConfig: BasemapConfig = {
  styleUrl: env.mapStyleUrl,
  satelliteUrl: env.mapStyleSatelliteUrl,
  apiKey: env.mapApiKey,
};

/**
 * Owns the MapLibre instance. Everything else talks to it through `useMapActions()`.
 * Load it with `React.lazy` (see MapViewLazy) so MapLibre stays out of the initial bundle.
 */
export function MapView({
  theme,
  fieldBounds = null,
  basemapConfig = envBasemapConfig,
  className,
  children,
}: MapViewProps) {
  const [controller] = useState(createMapController);
  const context = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const containerRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<BasemapKind>('streets');
  const [layerState, setLayerState] = useState<MapLayerState>(DEFAULT_LAYER_STATE);
  const [pin, setPin] = useState<Coordinates | null>(null);

  const { styleUrl, satelliteUrl, apiKey } = basemapConfig;
  const style = useMemo(
    () => resolveBasemapStyle({ config: { styleUrl, satelliteUrl, apiKey }, kind, theme }),
    [styleUrl, satelliteUrl, apiKey, kind, theme],
  );
  const basemaps = availableBasemaps();

  // The style the map was created with, and the one last applied; a ref so changing it is not a render.
  const appliedStyle = useRef(style);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    return controller.attach(container, {
      style: appliedStyle.current,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
  }, [controller]);

  useEffect(() => {
    if (appliedStyle.current === style) return;
    appliedStyle.current = style;
    controller.setStyle(style);
  }, [controller, style]);

  useEffect(() => {
    const container = containerRef.current;
    if (context === null || container === null || typeof ResizeObserver === 'undefined')
      return undefined;
    const observer = new ResizeObserver(() => {
      context.actions.resize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [context]);

  const [west, south, east, north] = fieldBounds ?? [];
  useEffect(() => {
    if (
      context === null ||
      west === undefined ||
      south === undefined ||
      east === undefined ||
      north === undefined
    ) {
      return;
    }
    context.actions.fitBounds([west, south, east, north], { animate: !prefersReducedMotion() });
  }, [context, west, south, east, north]);

  const fitToField = (): void => {
    if (context === null || fieldBounds === null) return;
    context.actions.fitBounds(fieldBounds, { animate: !prefersReducedMotion() });
  };

  const goToCoordinates = (target: Coordinates): void => {
    if (context === null) return;
    context.actions.flyTo([target.lon, target.lat], { animate: !prefersReducedMotion() });
    setPin(target);
  };

  return (
    <section aria-label="Map" className={`relative h-full w-full ${className ?? ''}`}>
      {/* Sized by height, not inset: maplibre-gl.css forces `position: relative` on this element. */}
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-[4.5rem] left-3 z-10">
        <CoordinateSearch onGo={goToCoordinates} disabled={context === null} />
      </div>
      <div className="absolute bottom-10 left-3 z-10 flex flex-col items-start gap-2">
        <LayerPanel
          state={layerState}
          onChange={setLayerState}
          basemaps={basemaps}
          basemapKind={kind}
          onBasemapChange={(next) => {
            setKind(next);
            // Choosing a basemap means you want to see it.
            setLayerState((current) => ({ ...current, basemap: true }));
          }}
        />
        <button
          type="button"
          onClick={fitToField}
          disabled={fieldBounds === null}
          className="bg-surface text-fg border-border hover:bg-surface-muted rounded-control border px-3 py-1.5 text-sm shadow-float disabled:opacity-50"
        >
          Fit to field
        </button>
      </div>
      {context === null ? null : (
        <MapContext value={context}>
          <LayerVisibilitySync state={layerState} />
          {pin === null ? null : (
            <CoordinatePin
              coordinates={pin}
              onClear={() => {
                setPin(null);
              }}
            />
          )}
          {children}
        </MapContext>
      )}
    </section>
  );
}
