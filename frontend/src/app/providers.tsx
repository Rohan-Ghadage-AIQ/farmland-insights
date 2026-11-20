import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { ThemeProvider } from './theme';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  });
}

interface AppProvidersProps {
  readonly children: ReactNode;
  /** Injected by tests; production lets the provider own a single client instance. */
  readonly client?: QueryClient;
}

/** Server state, theme and toasts. Tooltips bring their own provider. */
export function AppProviders({ children, client }: AppProvidersProps) {
  const [ownClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client ?? ownClient}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
