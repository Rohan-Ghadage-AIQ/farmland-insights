import type { RouteObject } from 'react-router-dom';

/**
 * The /dev/ui component showcase. `import.meta.env.DEV` is replaced by a literal at build time,
 * so in production this is an empty array and the dynamic import (the whole showcase) is dropped.
 * Read directly here, rather than through lib/env, precisely so the bundler can prove that.
 */
export const devRouteObjects: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/ui',
        lazy: async () => {
          const { DevUiPage } = await import('./DevUiPage');
          return { Component: DevUiPage };
        },
      },
    ]
  : [];
