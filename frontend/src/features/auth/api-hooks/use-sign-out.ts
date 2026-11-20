import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { session } from '@/lib/session';

/** Signs out and wipes cached server data, so one user's farm data never outlives their session. */
export function useSignOut(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    session.signOut();
    queryClient.clear();
  }, [queryClient]);
}
