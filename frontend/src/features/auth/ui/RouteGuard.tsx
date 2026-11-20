import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { session } from '@/lib/session';
import { useSession, useWhoAmI } from '../api-hooks';
import { SessionExpiryToast } from './SessionExpiryToast';

export interface RouteGuardProps {
  readonly children: ReactNode;
}

/**
 * Protects `/` (spec 3.5): redirects to `/login?next=...` when there is no session, and again
 * with "Your session expired." when a request comes back 401/403 while this was mounted.
 * Runs the `/auth/whoami` check on load and mounts the expiry toast while signed in.
 */
export function RouteGuard({ children }: RouteGuardProps) {
  const currentSession = useSession();
  const location = useLocation();
  const [expired, setExpired] = useState(false);

  // Keep the signed-in check running while this route is mounted.
  useWhoAmI();

  useEffect(
    () =>
      session.onEvent((event) => {
        if (event.type === 'expired') setExpired(true);
      }),
    [],
  );

  if (currentSession === null) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <Navigate
        to={`/login?next=${next}`}
        replace
        state={expired ? { reason: 'expired' } : undefined}
      />
    );
  }

  return (
    <>
      {children}
      <SessionExpiryToast />
    </>
  );
}
