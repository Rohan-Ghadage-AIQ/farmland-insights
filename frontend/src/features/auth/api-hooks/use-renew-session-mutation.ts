import { useMutation } from '@tanstack/react-query';
import { authError, endpoints, type ApiError, type AuthTokenResponse } from '@/api';
import { env } from '@/lib/env';
import { session } from '@/lib/session';

/** "Stay signed in": re-issues a token for the signed-in email and replaces the session. */
export function useRenewSessionMutation() {
  return useMutation<AuthTokenResponse, ApiError>({
    mutationFn: async () => {
      const current = session.getSession();
      if (current === null) throw authError();
      const grant = await endpoints.token({
        email: current.email,
        duration_in_minutes: env.tokenTtlMinutes,
      });
      session.setSession(grant);
      return grant;
    },
  });
}
