import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { createThemeStorage, ThemeProvider } from './theme';

/** In-memory Storage so tests never touch (or depend on) the real localStorage. */
export function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** The providers a component under test needs, with an isolated theme store and no query retries. */
export function TestProviders({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const storage = createThemeStorage(() => createMemoryStorage());
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider storage={storage}>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
