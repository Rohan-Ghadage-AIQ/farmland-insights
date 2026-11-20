import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Test-only: a fresh QueryClient per test, with no retries and no cache lifetime surprises.
 * `useAnalyzeMutation` (features/auth) needs a provider in its render tree; this mirrors the
 * equivalent helper in `features/auth/api-hooks/test-wrapper.tsx` without a cross-feature import.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

export function createQueryWrapper(client: QueryClient = createTestQueryClient()) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
