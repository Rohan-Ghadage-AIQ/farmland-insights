import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '../api-hooks/test-wrapper';
import { RegisterForm } from './RegisterForm';

function renderForm(onSuccess = vi.fn()) {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <RegisterForm onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return { onSuccess };
}

afterEach(() => {
  session.signOut();
});

describe('RegisterForm', () => {
  it('renders the email and password fields and a submit button', () => {
    renderForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows client-side validation errors and makes no request for an empty form', async () => {
    const user = userEvent.setup();
    const hits = vi.fn();
    server.use(http.post('*/api/v1/auth/register', () => (hits(), HttpResponse.json({}))));
    renderForm();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter a password.')).toBeInTheDocument();
    expect(hits).not.toHaveBeenCalled();
  });

  it('registers, stores the session and calls onSuccess', async () => {
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
    const { onSuccess } = renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(session.getToken()).toBe('tok-abc');
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows a 400 field_to_errors message under the email field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ detail: { email: ['Email already in use'] } }, { status: 400 }),
      ),
    );
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
    expect(session.getSession()).toBeNull();
  });

  it('shows a 422 validation message under the matching field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json(
          {
            detail: [
              { loc: ['body', 'password'], msg: 'Password is too weak.', type: 'value_error' },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Password is too weak.')).toBeInTheDocument();
  });

  it('shows the 429 copy as an inline banner', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json(
          { detail: 'slow down' },
          { status: 429, headers: { 'Retry-After': '20' } },
        ),
      ),
    );
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many requests/i);
  });

  it('shows a plain banner for a network failure', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/register', () => HttpResponse.error()));
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'farmer@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/can.t reach the server/i);
  });
});
