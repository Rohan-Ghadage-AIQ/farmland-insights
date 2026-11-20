import { Button } from '@/components/ui';
import { useSession, useSignOut } from '../api-hooks';

/** Top-bar user menu (spec 3.2): the signed-in email and a sign-out action. Nothing while signed out. */
export function UserMenu() {
  const currentSession = useSession();
  const signOut = useSignOut();

  if (currentSession === null) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-48 truncate text-sm text-fg-muted" title={currentSession.email}>
        {currentSession.email}
      </span>
      <Button variant="ghost" size="sm" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
