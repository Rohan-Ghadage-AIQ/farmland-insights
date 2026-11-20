import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query. `fallback` is the answer where matchMedia is unavailable
 * (older test environments, server rendering); a wide desktop is the sensible default for this app.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = (onChange: () => void): (() => void) => {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  };
  const getSnapshot = (): boolean =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback;
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
