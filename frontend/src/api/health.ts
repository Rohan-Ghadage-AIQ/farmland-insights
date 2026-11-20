import { useQuery } from '@tanstack/react-query';
import { endpoints } from './instance';
import type { HealthResponse } from './schemas';

export type HealthStatus = HealthResponse;

/** GET /health -> {status:"ok"}, through the shared client (timeout, ApiError mapping). */
export function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return endpoints.health(signal);
}

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 30_000,
  });
}
