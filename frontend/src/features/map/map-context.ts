import { createContext, useContext } from 'react';
import type { MapContextValue } from './map-controller';

export const MapContext = createContext<MapContextValue | null>(null);

function useMapContext(hook: string): MapContextValue {
  const value = useContext(MapContext);
  if (value === null) {
    throw new Error(`${hook} must be used inside <MapView>, once the map exists.`);
  }
  return value;
}

/** The typed imperative actions (fitBounds, setData, setFeatureState, resize, ...). */
export function useMapActions(): MapContextValue['actions'] {
  return useMapContext('useMapActions').actions;
}

/** The raw MapLibre instance, for integrations that need it (Terra Draw). Prefer `useMapActions`. */
export function useMapInstance(): MapContextValue['map'] {
  return useMapContext('useMapInstance').map;
}
