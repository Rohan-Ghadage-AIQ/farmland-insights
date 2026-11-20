import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { session } from '@/lib/session';
import { createTestQueryClient } from '../api-hooks/test-wrapper';
import { UserMenu } from './UserMenu';

function renderMenu() {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <UserMenu />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  session.signOut();
});

describe('UserMenu', () => {
  it('renders nothing while signed out', () => {
    const client = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <UserMenu />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the signed-in user's email and a sign out button", () => {
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok',
      expires_in_minutes: 480,
    });
    renderMenu();
    expect(screen.getByText('farmer@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('signs out and clears the session on click', async () => {
    const user = userEvent.setup();
    session.setSession({
      user_id: 'u_1',
      email: 'farmer@example.com',
      access_token: 'tok',
      expires_in_minutes: 480,
    });
    renderMenu();

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(session.getSession()).toBeNull();
  });
});
