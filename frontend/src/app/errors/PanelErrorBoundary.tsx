import type { ReactNode } from 'react';
import { ErrorBanner } from '@/components/ui';
import { ErrorBoundary, errorDetails } from './ErrorBoundary';

interface PanelErrorBoundaryProps {
  /** Names the panel in the message, for example "the inspector". */
  readonly label: string;
  readonly children: ReactNode;
  readonly resetKeys?: readonly unknown[];
}

/** Contains a failure to one panel so the map and the other panels keep working. */
export function PanelErrorBoundary({ label, children, resetKeys }: PanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      {...(resetKeys === undefined ? {} : { resetKeys })}
      fallback={({ error, reset }) => (
        <div className="p-4">
          <ErrorBanner
            title={`Couldn't show ${label}`}
            message="Something went wrong while drawing this panel. The rest of the app still works."
            details={errorDetails(error)}
            onRetry={reset}
          />
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
