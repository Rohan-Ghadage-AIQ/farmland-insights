import { lazy } from 'react';

/**
 * Code-split entry points. MapLibre and Terra Draw are large, so they load in their own chunk
 * and stay out of the initial bundle. Named exports only (project rule), hence the `default`
 * adapter that `React.lazy` requires.
 *
 *   <Suspense fallback={<MapSkeleton />}><MapViewLazy theme="light" /></Suspense>
 */
export const MapViewLazy = lazy(() => import('./MapView').then((m) => ({ default: m.MapView })));

export const DrawControlLazy = lazy(() =>
  import('./DrawControl').then((m) => ({ default: m.DrawControl })),
);
