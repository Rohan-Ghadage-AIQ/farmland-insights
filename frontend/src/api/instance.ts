import { session } from '@/lib/session';
import { createApiClient } from './client';
import { createEndpoints } from './endpoints';

/** The app-wide client: Bearer token from the session, and a 401/403 ends the session. */
export const apiClient = createApiClient({
  getToken: () => session.getToken(),
  onAuthFailure: () => {
    session.handleAuthFailure();
  },
});

export const endpoints = createEndpoints(apiClient);
