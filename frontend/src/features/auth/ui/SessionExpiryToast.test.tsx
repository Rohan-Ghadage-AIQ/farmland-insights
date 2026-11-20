import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui';
import '@/components/ui/test-support';
import { EXPIRY_WARNING_MS, session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { createTestQueryClient } from '../api-hooks/test-wrapper';
import { SessionExpiryToast } from './SessionExpiryToast';

function renderToast() {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SessionExpiryToast />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  session.signOut();
});

describe('SessionExpiryToast', () => {
  it('shows nothing while the session has plenty of time left', () => {
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok',
      expires_in_minutes: 480,
    });
    renderToast();
    expect(screen.queryByText(/expire/i)).not.toBeInTheDocument();
  });

  it('shows a toast with "Stay signed in" once the session is within 5 minutes of expiry', async () => {
    const expiresInMs = EXPIRY_WARNING_MS - 1000;
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok',
      expires_in_minutes: expiresInMs / 60_000,
    });
    renderToast();
    expect(await screen.findByText(/stay signed in/i)).toBeInTheDocument();
  });

  it('"Stay signed in" re-issues a token and replaces the session', async () => {
    const expiresInMs = EXPIRY_WARNING_MS - 1000;
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok-old',
      expires_in_minutes: expiresInMs / 60_000,
    });
    server.use(
      http.post('*/api/v1/auth/token', () =>
        HttpResponse.json({
          user_id: 'u_1',
          email: 'farmer@example.com',
          access_token: 'tok-renewed',
          token_type: 'bearer',
          expires_in_minutes: 480,
        }),
      ),
    );
    renderToast();

    // fireEvent (not userEvent) skips the pointer-interaction checks that Radix's enter
    // animation can briefly fail under load (pointer-events: none while opening); this test
    // is about the renew behaviour, not the animation.
    fireEvent.click(await screen.findByRole('button', { name: /stay signed in/i }));

    await waitFor(() => {
      expect(session.getToken()).toBe('tok-renewed');
    });
  });
});
