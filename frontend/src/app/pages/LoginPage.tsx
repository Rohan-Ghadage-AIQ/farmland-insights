import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui';

/** Centered card on its own page. The auth feature supplies the form through `children`. */
export function LoginPage({ children }: { readonly children?: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-panel border border-border bg-surface p-6">
        <h1 className="mb-4 text-lg font-semibold text-fg">Farmland Insights</h1>
        {children ?? (
          <EmptyState
            title="Sign in"
            description="The sign-in and create-account forms appear here."
            headingLevel={2}
          />
        )}
      </div>
    </main>
  );
}
