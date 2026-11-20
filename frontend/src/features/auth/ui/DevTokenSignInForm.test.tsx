import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '../api-hooks/test-wrapper';
import { DevTokenSignInForm } from './DevTokenSignInForm';

function renderForm(onSuccess = vi.fn()) {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <DevTokenSignInForm onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return { onSuccess };
}

afterEach(() => {
  session.signOut();
});

describe('DevTokenSignInForm', () => {
  it('renders an email field, a warning that this is a dev-only flow, and a Get token button', () => {
    renderForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get token/i })).toBeInTheDocument();
    expect(screen.getByText(/dev/i)).toBeInTheDocument();
  });

  it('requires an email before submitting', async () => {
    const user = userEvent.setup();
    const hits = vi.fn();
    server.use(http.post('*/api/v1/auth/token', () => (hits(), HttpResponse.json({}))));
    renderForm();

    await user.click(screen.getByRole('button', { name: /get token/i }));

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(hits).not.toHaveBeenCalled();
  });

  it('gets a token, stores the session and calls onSuccess', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/token', () =>
        HttpResponse.json({
          user_id: 'u_1',
          email: 'farmer@example.com',
          access_token: 'tok-dev',
          token_type: 'bearer',
          expires_in_minutes: 480,
        }),
      ),
    );
    const { onSuccess } = renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.click(screen.getByRole('button', { name: /get token/i }));

    await waitFor(() => {
      expect(session.getToken()).toBe('tok-dev');
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows "User not found." under the email field on a 404', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/token', () =>
        HttpResponse.json({ detail: 'User not found.' }, { status: 404 }),
      ),
    );
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /get token/i }));

    expect(await screen.findByText('User not found.')).toBeInTheDocument();
    expect(session.getSession()).toBeNull();
  });

  it('shows the 429 copy as a banner', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/token', () =>
        HttpResponse.json({ detail: 'slow' }, { status: 429 }),
      ),
    );
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.click(screen.getByRole('button', { name: /get token/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i);
  });
});
