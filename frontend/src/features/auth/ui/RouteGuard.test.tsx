import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui';
import '@/components/ui/test-support';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '../api-hooks/test-wrapper';
import { RouteGuard } from './RouteGuard';

function renderGuarded(initialEntries: string[] = ['/']) {
  const client = createTestQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <RouteGuard>
            <p>Protected workspace</p>
          </RouteGuard>
        ),
      },
      { path: '/login', element: <p>Login page</p> },
    ],
    { initialEntries },
  );
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router };
}

afterEach(() => {
  session.signOut();
});

describe('RouteGuard', () => {
  it('redirects to /login with ?next= when there is no session', async () => {
    const { router } = renderGuarded(['/']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toBe('?next=%2F');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders its children when a session exists', () => {
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok',
      expires_in_minutes: 480,
    });
    server.use(
      http.get('*/api/v1/auth/whoami', () =>
        HttpResponse.json({ user_id: 'u_1', email: 'farmer@example.com', active_org_id: null }),
      ),
    );
    renderGuarded(['/']);
    expect(screen.getByText('Protected workspace')).toBeInTheDocument();
  });

  it('redirects to /login with the "expired" reason when a request comes back 401', async () => {
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok',
      expires_in_minutes: 480,
    });
    server.use(
      http.get('*/api/v1/auth/whoami', () =>
        HttpResponse.json({ detail: 'expired' }, { status: 401 }),
      ),
    );
    const { router } = renderGuarded(['/']);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(session.getSession()).toBeNull();
    expect(router.state.location.state).toEqual({ reason: 'expired' });
  });
});
