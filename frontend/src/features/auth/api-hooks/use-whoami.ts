import { useQuery } from '@tanstack/react-query';
import { endpoints, type ApiError, type WhoAmIResponse } from '@/api';
import { shouldRetryQuery } from './retry';
import { useSession } from './use-session';

/** Who the backend says we are. Runs only while signed in; a 401 ends the session. */
export function useWhoAmI() {
  const userId = useSession()?.userId ?? null;
  return useQuery<WhoAmIResponse, ApiError>({
    queryKey: ['auth', 'whoami', userId],
    queryFn: ({ signal }) => endpoints.whoami(signal),
    enabled: userId !== null,
    retry: shouldRetryQuery,
  });
}
