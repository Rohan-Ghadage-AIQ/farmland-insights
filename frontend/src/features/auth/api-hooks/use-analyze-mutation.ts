import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endpoints,
  incompatibleServerError,
  type AnalysisRequest,
  type AnalysisResponse,
  type ApiError,
} from '@/api';

/** Shown when a server too old to know `image_date` analysed every pass instead of the chosen one. */
export const IMAGE_DATE_IGNORED_MESSAGE =
  'The server did not use the chosen satellite date, so the results would mix every image in the period. Restart the backend so it runs the latest version, then run the analysis again.';

/**
 * Runs /analyze. Adds what the progress UI needs on top of TanStack's result:
 *  - `cancel()` aborts the in-flight request (the mutation then ends as an "aborted" error);
 *  - `startedAt` (epoch ms) of the latest run, for an elapsed-time display.
 * Never retries: an analysis can be slow and costly. Unmounting aborts a run in flight.
 */
export function useAnalyzeMutation() {
  const controllerRef = useRef<AbortController | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const mutation = useMutation<AnalysisResponse, ApiError, AnalysisRequest>({
    mutationFn: async (body) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await endpoints.analyze(body, controller.signal);
        // The report must come from the chosen pass; never show a mix of every pass as if it did.
        if (body.image_date && !response.imagery?.image_date) {
          throw incompatibleServerError(IMAGE_DATE_IGNORED_MESSAGE);
        }
        return response;
      } finally {
        // A newer run may have replaced this controller; only clear our own.
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    onMutate: () => {
      setStartedAt(Date.now());
    },
    retry: false,
  });

  const { reset: resetMutation } = mutation;
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);
  const reset = useCallback(() => {
    resetMutation();
    setStartedAt(null);
  }, [resetMutation]);

  useEffect(() => cancel, [cancel]);

  return { ...mutation, reset, cancel, startedAt };
}
