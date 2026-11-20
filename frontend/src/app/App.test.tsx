import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import { createMemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { session } from '@/lib/session';
import { server } from '@/test/msw/server';
import { App } from './App';
import { AppProviders } from './providers';
import { createAppRoutes, type AppRouteOptions } from './router';
import { createMemoryStorage } from './test-utils';

beforeEach(() => {
  // Providers and the router both log caught errors; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue(createMemoryStorage());
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  session.signOut();
});

/** `/` is behind RouteGuard, so these tests need a session and a successful whoami check. */
function signIn(): void {
  session.setSession({
    user_id: 'u_1',
    email: 'ada@example.com',
    access_token: 'tok',
    expires_in_minutes: 480,
  });
  server.use(
    http.get('*/api/v1/auth/whoami', () =>
      HttpResponse.json({ user_id: 'u_1', email: 'ada@example.com', active_org_id: null }),
    ),
  );
}

function Boom(): never {
  throw new Error('exploded');
}

function renderAt(path: string, options: AppRouteOptions = {}) {
  const router = createMemoryRouter(createAppRoutes(options), { initialEntries: [path] });
  // No retries in tests: a failed health check should surface immediately.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AppProviders client={client}>
      <App router={router} />
    </AppProviders>,
  );
}

describe('workspace route (/)', () => {
  it('redirects to /login when there is no session (RouteGuard)', async () => {
    renderAt('/');

    await waitFor(() => {
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('shows the app shell with the app name straight away once signed in', () => {
    signIn();
    renderAt('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Farmland Insights' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('reports API health in the top bar', async () => {
    signIn();
    renderAt('/');

    expect(await screen.findByText('API reachable')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('API reachable')).toBeInTheDocument();
  });

  it('has a working theme toggle in the top bar', async () => {
    signIn();
    renderAt('/');
    const toggle = within(screen.getByRole('banner')).getByRole('button', {
      name: /Switch to (dark|light) theme/,
    });

    toggle.click();

    expect(
      await screen.findByRole('button', { name: /Switch to (dark|light) theme/ }),
    ).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(dark|light)$/);
  });

  it('labels empty panels as slots rather than leaving blank areas', () => {
    signIn();
    renderAt('/');

    for (const name of ['Setup', 'Inspector']) {
      const panel = screen.getByRole('complementary', { name });
      expect(within(panel).getByRole('heading')).toBeInTheDocument();
    }
    expect(within(screen.getByRole('main')).getByRole('heading')).toBeInTheDocument();
  });

  it('renders feature content supplied through the typed slots', () => {
    signIn();
    renderAt('/', {
      slots: {
        setup: <p>real setup</p>,
        map: <p>real map</p>,
        inspector: <p>real inspector</p>,
        user: <span>ada@example.com</span>,
      },
    });

    expect(screen.getByText('real setup')).toBeInTheDocument();
    expect(screen.getByText('real map')).toBeInTheDocument();
    expect(screen.getByText('real inspector')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('ada@example.com')).toBeInTheDocument();
  });

  it('contains a crashing panel: the others keep working', () => {
    signIn();
    renderAt('/', { slots: { setup: <Boom />, map: <p>map is fine</p> } });

    const setup = screen.getByRole('complementary', { name: 'Setup' });
    expect(within(setup).getByRole('alert')).toHaveTextContent("Couldn't show the setup panel");
    expect(screen.getByText('map is fine')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Farmland Insights' }),
    ).toBeInTheDocument();
  });
});

describe('login route (/login)', () => {
  it('shows a placeholder page with its own main landmark', () => {
    renderAt('/login');

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Farmland Insights' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('renders the login feature when one is supplied', () => {
    renderAt('/login', { slots: { login: <p>real login form</p> } });

    expect(screen.getByText('real login form')).toBeInTheDocument();
  });
});

describe('unknown routes', () => {
  it('say so and link back to the workspace', () => {
    renderAt('/nope');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});

describe('route errors', () => {
  it('show a recoverable error page instead of a blank screen', async () => {
    renderAt('/login', { slots: { login: <Boom /> } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Technical details' })).toBeInTheDocument();
  });
});

describe('dev UI route (/dev/ui)', () => {
  it('renders the component showcase when dev routes are on', async () => {
    renderAt('/dev/ui', { devRoutes: true });

    expect(await screen.findByRole('heading', { level: 1, name: 'UI kit' })).toBeInTheDocument();
  });

  it('does not exist when dev routes are off (production builds)', () => {
    renderAt('/dev/ui', { devRoutes: false });

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
