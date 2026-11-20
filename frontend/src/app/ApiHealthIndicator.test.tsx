import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/msw/server';
import { ApiHealthIndicator, HealthBadge } from './ApiHealthIndicator';

function renderConnected() {
  // No retries in tests: a failed health check should surface immediately.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiHealthIndicator />
    </QueryClientProvider>,
  );
}

describe('HealthBadge', () => {
  it.each([
    ['checking', 'Checking API\u2026', 'neutral'],
    ['healthy', 'API reachable', 'success'],
    ['unreachable', 'API unreachable', 'danger'],
  ] as const)('%s shows its words and tone', (status, text, tone) => {
    render(<HealthBadge status={status} />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent(text);
    expect(badge.querySelector(`[data-tone="${tone}"]`)).not.toBeNull();
  });
});

describe('ApiHealthIndicator', () => {
  it('starts as checking, then reports healthy once GET /health succeeds', async () => {
    renderConnected();

    expect(screen.getByRole('status')).toHaveTextContent(/checking/i);
    expect(await screen.findByText('API reachable')).toBeInTheDocument();
  });

  it('reports unreachable when the request fails at the network level', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()));
    renderConnected();

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });

  it('reports unreachable when the server answers with an error status', async () => {
    server.use(http.get('*/health', () => new HttpResponse(null, { status: 502 })));
    renderConnected();

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });

  it('does not trust a 200 response with an unexpected body', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ status: 'degraded' })));
    renderConnected();

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });
});
