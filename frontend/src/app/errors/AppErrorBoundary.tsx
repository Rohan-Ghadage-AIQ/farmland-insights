import type { ReactNode } from 'react';
import { ErrorBoundary, errorDetails } from './ErrorBoundary';
import { FullPageError, reloadPage } from './FullPageError';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  /** Injected by tests; defaults to a full page reload. */
  readonly onReload?: () => void;
}

/** Last line of defence: replaces a crashed app with a page that explains and offers a reload. */
export function AppErrorBoundary({ children, onReload = reloadPage }: AppErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={({ error }) => <FullPageError details={errorDetails(error)} onReload={onReload} />}
    >
      {children}
    </ErrorBoundary>
  );
}
