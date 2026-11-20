import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '../api-hooks/test-wrapper';
import { LoginCard } from './LoginCard';

function renderCard({
  devTokenLoginEnabled = false,
  initialEntries = ['/login'],
}: { readonly devTokenLoginEnabled?: boolean; readonly initialEntries?: string[] } = {}) {
  const client = createTestQueryClient();
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginCard devTokenLoginEnabled={devTokenLoginEnabled} /> },
      { path: '/', element: <p>Workspace</p> },
      { path: '/analysis', element: <p>Analysis</p> },
    ],
    { initialEntries },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

afterEach(() => {
  session.signOut();
});

describe('LoginCard', () => {
  it('shows Sign in and Create account tabs, with Create account content by default visible through sign-in tab', () => {
    renderCard();
    expect(screen.getByRole('tab', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows the production sign-in notice on the Sign in tab when dev token login is disabled', () => {
    renderCard({ devTokenLoginEnabled: false });
    expect(screen.getByText(/production sign-in/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get token/i })).not.toBeInTheDocument();
  });

  it('shows the dev token form on the Sign in tab when dev token login is enabled', () => {
    renderCard({ devTokenLoginEnabled: true });
    expect(screen.getByRole('button', { name: /get token/i })).toBeInTheDocument();
  });

  it('switches to the Create account tab and shows the register form', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('tab', { name: /create account/i }));
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows no "session expired" banner on a plain visit', () => {
    renderCard();
    expect(screen.queryByText(/your session expired/i)).not.toBeInTheDocument();
  });

  it('redirects to "next" after a successful sign-up', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({
          user_id: 'u_1',
          email: 'farmer@example.com',
          access_token: 'tok-abc',
          token_type: 'bearer',
          expires_in_minutes: 480,
        }),
      ),
    );
    const { router } = renderCard({ initialEntries: ['/login?next=%2Fanalysis'] });

    await user.click(screen.getByRole('tab', { name: /create account/i }));
    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/analysis');
    });
  });
});

describe('LoginCard with an expired-session redirect', () => {
  it('shows "Your session expired." banner', () => {
    const client = createTestQueryClient();
    const router = createMemoryRouter(
      [{ path: '/login', element: <LoginCard devTokenLoginEnabled={false} /> }],
      {
        initialEntries: [{ pathname: '/login', state: { reason: 'expired' } }],
      },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/your session expired/i)).toBeInTheDocument();
  });
});
