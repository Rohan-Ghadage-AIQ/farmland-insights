import { useQuery } from '@tanstack/react-query';
import { endpoints, type ApiError, type SatellitePass } from '@/api';
import { shouldRetryQuery } from '@/features/auth';
import {
  farmGeometryHash,
  sanitizeFeatureCollection,
  type FarmFeatureCollection,
  type IsoDate,
} from '@/domain';

export type SatelliteDatesState =
  /** No field or no valid period yet, so there is nothing to look up. */
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly passes: readonly SatellitePass[] }
  | { readonly status: 'error'; readonly error: ApiError; readonly retry: () => void };

const NO_PASSES: readonly SatellitePass[] = [];
/** Past imagery does not change; a pass can only appear for the last few days. */
const STALE_MS = 15 * 60 * 1000;

export interface UseSatelliteDatesOptions {
  readonly farm: FarmFeatureCollection | null;
  /** Both null until the period is complete and valid. */
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
}

/** The days a satellite photographed the farm in the period (POST /satellite-dates). */
export function useSatelliteDates({
  farm,
  startDate,
  endDate,
}: UseSatelliteDatesOptions): SatelliteDatesState {
  const enabled = farm !== null && startDate !== null && endDate !== null;
  const query = useQuery<readonly SatellitePass[], ApiError>({
    queryKey: [
      'satellite-dates',
      farm === null ? null : farmGeometryHash(farm),
      startDate,
      endDate,
    ],
    queryFn: async ({ signal }) => {
      // `enabled` guarantees these; the guard keeps the types honest.
      if (farm === null || startDate === null || endDate === null) return NO_PASSES;
      const response = await endpoints.satelliteDates(
        {
          farm_geojson: sanitizeFeatureCollection(farm),
          start_date: startDate,
          end_date: endDate,
        },
        signal,
      );
      return response.dates;
    },
    enabled,
    staleTime: STALE_MS,
    retry: shouldRetryQuery,
  });

  if (!enabled) return { status: 'idle' };
  if (query.isPending) return { status: 'loading' };
  if (query.isError) {
    return {
      status: 'error',
      error: query.error,
      retry: () => {
        void query.refetch();
      },
    };
  }
  return { status: 'ready', passes: query.data };
}

/** True when `imageDate` is one of the listed passes: the report is always built from one day. */
export function hasChosenPass(satelliteDates: SatelliteDatesState, imageDate: string): boolean {
  return (
    satelliteDates.status === 'ready' &&
    satelliteDates.passes.some((pass) => pass.date === imageDate)
  );
}
