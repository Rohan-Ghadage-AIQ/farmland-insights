import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-3 p-6">
      <h1 className="text-xl font-semibold text-fg">Page not found</h1>
      <p className="text-base text-fg-muted">
        That address does not exist in this app. Check the link, or go back to your field.
      </p>
      <Button asChild>
        <Link to="/">Back to the workspace</Link>
      </Button>
    </main>
  );
}
