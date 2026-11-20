import { useState } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router-dom';
import { AppErrorBoundary } from './errors';
import { createAppRouter, type AppRouteOptions } from './router';

interface AppProps extends AppRouteOptions {
  /** Injected by tests (a memory router). Production builds its own browser router once. */
  readonly router?: ReturnType<typeof createBrowserRouter>;
}

export function App({ router, slots, devRoutes }: AppProps) {
  const [current] = useState(
    () =>
      router ??
      createAppRouter({
        ...(slots === undefined ? {} : { slots }),
        ...(devRoutes === undefined ? {} : { devRoutes }),
      }),
  );
  return (
    <AppErrorBoundary>
      <RouterProvider router={current} />
    </AppErrorBoundary>
  );
}
