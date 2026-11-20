import { useMutation } from '@tanstack/react-query';
import { endpoints, type ApiError, type AuthTokenResponse } from '@/api';
import { env } from '@/lib/env';
import { session } from '@/lib/session';

export interface TokenVariables {
  readonly email: string;
  /** Token lifetime. Defaults to VITE_TOKEN_TTL_MINUTES. */
  readonly durationInMinutes?: number;
}

/** Dev sign-in: passwordless token for an existing email (see docs/BACKEND_REQUESTS.md). */
export function useTokenMutation() {
  return useMutation<AuthTokenResponse, ApiError, TokenVariables>({
    mutationFn: async ({ email, durationInMinutes = env.tokenTtlMinutes }) => {
      const grant = await endpoints.token({ email, duration_in_minutes: durationInMinutes });
      session.setSession(grant);
      return grant;
    },
  });
}
