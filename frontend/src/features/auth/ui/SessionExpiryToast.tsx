import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import { useRenewSessionMutation, useSessionExpiry } from '../api-hooks';

/**
 * Mount once while signed in (spec 3.5): shows a "your session is about to expire" toast with a
 * "Stay signed in" action once the token is within 5 minutes of expiring. Renders nothing itself.
 */
export function SessionExpiryToast() {
  const { expiringSoon } = useSessionExpiry();
  const { toast, dismiss } = useToast();
  const renew = useRenewSessionMutation();
  const toastId = useRef<string | null>(null);

  useEffect(() => {
    if (expiringSoon && toastId.current === null) {
      toastId.current = toast({
        title: 'Your session is about to expire',
        description: "You'll be signed out in about 5 minutes.",
        tone: 'warning',
        duration: Infinity,
        action: {
          label: 'Stay signed in',
          onAction: () => {
            renew.mutate();
          },
        },
      });
    }
    if (!expiringSoon && toastId.current !== null) {
      dismiss(toastId.current);
      toastId.current = null;
    }
    // renew and dismiss are stable (useCallback/useMutation); only re-run when the warning flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiringSoon]);

  return null;
}
