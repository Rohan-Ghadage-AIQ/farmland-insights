import { useEffect, useState } from 'react';
import { scheduleExpiry, session } from '@/lib/session';
import { useSession } from './use-session';

/**
 * Ends the session when its token runs out, and reports when it is about to (5 minutes
 * before), so the UI can offer "Stay signed in". Mount it once, near the app root.
 */
export function useSessionExpiry(): { readonly expiringSoon: boolean } {
  const expiresAt = useSession()?.expiresAt;
  // Remembering *which* expiry was warned about means a renewed token resets the warning
  // without any state juggling.
  const [warnedFor, setWarnedFor] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === undefined) return undefined;
    return scheduleExpiry(expiresAt, {
      onWarn: () => {
        setWarnedFor(expiresAt);
      },
      onExpire: () => {
        session.expire();
      },
    });
  }, [expiresAt]);

  return { expiringSoon: expiresAt !== undefined && warnedFor === expiresAt };
}
