import { useEffect } from 'react';
import { applyLayerState, type MapLayerState } from './layer-visibility';
import { useMapInstance } from './map-context';

/**
 * Keeps the map in step with the layer panel. Applies the state now and again after every style
 * change, because switching basemap replaces the style and the overlay layers are re-added after
 * it. Renders nothing.
 */
export function LayerVisibilitySync({ state }: { readonly state: MapLayerState }) {
  const map = useMapInstance();

  useEffect(() => {
    const apply = (): void => {
      applyLayerState(map, state);
    };
    apply();
    // MapLibre ignores a property that already has the wanted value, so this settles after one pass.
    map.on('styledata', apply);
    return () => {
      map.off('styledata', apply);
    };
  }, [map, state]);

  return null;
}
