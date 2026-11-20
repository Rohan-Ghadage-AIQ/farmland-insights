import { useSyncExternalStore } from 'react';
import { session, type Session } from '@/lib/session';

/** The current session (or null), re-rendering on sign-in, renewal, sign-out and expiry. */
export function useSession(): Session | null {
  return useSyncExternalStore(session.subscribe, session.getSession);
}
