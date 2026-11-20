import { useMutation } from '@tanstack/react-query';
import { endpoints, type ApiError, type AuthTokenResponse } from '@/api';
import { env } from '@/lib/env';
import { session } from '@/lib/session';

export interface RegisterVariables {
  readonly email: string;
  readonly password: string;
  /** Token lifetime. Defaults to VITE_TOKEN_TTL_MINUTES. */
  readonly durationInMinutes?: number;
}

/** Creates an account; on success the returned token becomes the session. */
export function useRegisterMutation() {
  return useMutation<AuthTokenResponse, ApiError, RegisterVariables>({
    mutationFn: async ({ email, password, durationInMinutes = env.tokenTtlMinutes }) => {
      const grant = await endpoints.register({
        email,
        password,
        duration_in_minutes: durationInMinutes,
      });
      session.setSession(grant);
      return grant;
    },
  });
}
