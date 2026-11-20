import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import type { ReactNode } from 'react';
import { RouteGuard } from '@/features/auth';
import { devRouteObjects } from './dev/dev-routes';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { RouteFallback } from './pages/RouteFallback';
import { WorkspacePage, type WorkspaceSlots } from './pages/WorkspacePage';

export type { WorkspaceSlots } from './pages/WorkspacePage';

/** Where features plug in. Leave a slot out and the shell shows a labelled placeholder. */
export interface AppRouteSlots extends WorkspaceSlots {
  /** The sign-in / create-account card content for /login. */
  readonly login?: ReactNode;
}

export interface AppRouteOptions {
  readonly slots?: AppRouteSlots;
  /** Include /dev/ui. Production builds drop the route regardless (see dev/dev-routes.ts). */
  readonly devRoutes?: boolean;
}

/** Routes: /login, / (workspace), /dev/ui (dev builds only) and a not-found catch-all. */
export function createAppRoutes({
  slots = {},
  devRoutes = true,
}: AppRouteOptions = {}): RouteObject[] {
  return [
    {
      errorElement: <RouteErrorPage />,
      HydrateFallback: RouteFallback,
      children: [
        {
          path: '/',
          element: (
            <RouteGuard>
              <WorkspacePage slots={slots} />
            </RouteGuard>
          ),
        },
        { path: '/login', element: <LoginPage>{slots.login}</LoginPage> },
        ...(devRoutes ? devRouteObjects : []),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

export function createAppRouter(options: AppRouteOptions = {}) {
  return createBrowserRouter(createAppRoutes(options));
}
