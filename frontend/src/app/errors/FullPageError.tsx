import { ErrorBanner } from '@/components/ui';

interface FullPageErrorProps {
  readonly details: unknown;
  readonly onReload: () => void;
}

/** Shared by the app-level boundary and the router's error element. */
export function FullPageError({ details, onReload }: FullPageErrorProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold text-fg">Farmland Insights</h1>
      <ErrorBanner
        title="Something went wrong"
        message="The app hit an unexpected problem. Reloading usually fixes it; your drawn field may need to be redrawn."
        details={details}
        onRetry={onReload}
        retryLabel="Reload page"
      />
    </main>
  );
}

export function reloadPage(): void {
  window.location.reload();
}
