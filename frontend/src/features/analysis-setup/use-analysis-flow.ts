import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import type { ApiError, AnalysisRequest, AnalysisResponse } from '@/api';
import { useAnalyzeMutation } from '@/features/auth';
import {
  areaHectares,
  buildAnalysisRequest,
  cellWarningLevel,
  estimateCellCount,
  findCrop,
  inputsHash,
  parseCropCategoryKey,
  parseIsoDate,
  todayIso,
  type CellWarningLevel,
  type FarmFeatureCollection,
  type IsoDate,
} from '@/domain';
import { buildRequestSummary } from './request-summary';
import { defaultPass } from './satellite-dates';
import { hasChosenPass, useSatelliteDates, type SatelliteDatesState } from './use-satellite-dates';
import {
  createAnalysisSetupSchema,
  defaultAnalysisSetupValues,
  type AnalysisSetupFormValues,
} from './schema';

export type AnalysisFlowState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly startedAt: number }
  | {
      readonly status: 'success';
      readonly data: AnalysisResponse;
      readonly requestHash: string;
      /** True once the form no longer matches the inputs this result was computed from. */
      readonly isStale: boolean;
      /** The exact request this result was computed from, for session history (spec 3.4). */
      readonly request: AnalysisRequest;
    }
  | { readonly status: 'error'; readonly error: ApiError; readonly requestSummary: string };

export interface UseAnalysisFlowOptions {
  /** The farm boundary (spec 3.3 step 1), owned by the `field` feature and passed in as a prop. */
  readonly farm: FarmFeatureCollection | null;
  /** Injected "today" so tests and the app share one clock. Defaults to the local date. */
  readonly today?: IsoDate;
  /**
   * Form values to start from, such as a restored session. Defaults to an empty form. The satellite
   * date may be absent (sessions saved before it existed); the picker then chooses one.
   */
  readonly initialValues?: Omit<AnalysisSetupFormValues, 'imageDate'> & { imageDate?: string };
}

export interface UseAnalysisFlowResult {
  readonly form: UseFormReturn<AnalysisSetupFormValues>;
  readonly state: AnalysisFlowState;
  /** The clock this run uses for the +16-day rule and the date presets. */
  readonly today: IsoDate;
  /** False while any step (including the field boundary) is missing or invalid. */
  readonly canSubmit: boolean;
  /** What the Analyze button's tooltip should list, in order. Empty once `canSubmit` is true. */
  readonly missingReasons: readonly string[];
  /** The satellite passes over the field in the chosen period, for the date picker. */
  readonly satelliteDates: SatelliteDatesState;
  /** `null` until a field boundary exists, for the grid step's live cell-count estimate. */
  readonly areaHectares: number | null;
  readonly cellCount: number;
  readonly cellWarningLevel: CellWarningLevel;
  /** True while the "this is a lot of cells" confirmation (spec 3.3 step 4) is open. */
  readonly confirmOpen: boolean;
  /** Validates and runs, or opens the confirmation first above the 10,000-cell threshold. */
  readonly submit: () => Promise<void>;
  /** Runs the request the confirmation was holding. */
  readonly confirmRun: () => void;
  readonly cancelConfirm: () => void;
  /** Aborts a run in progress (spec 3.4). A no-op when nothing is running. */
  readonly cancel: () => void;
  /** Re-runs the last submitted request, for the error banner's "Try again". */
  readonly retry: () => void;
  readonly reset: () => void;
}

function buildRequest(
  values: AnalysisSetupFormValues,
  farm: FarmFeatureCollection | null,
): AnalysisRequest | null {
  if (farm === null) return null;
  const crop = findCrop(values.crop);
  const categoryKey = crop === null ? null : parseCropCategoryKey(crop.category);
  const startDate = parseIsoDate(values.startDate);
  const endDate = parseIsoDate(values.endDate);
  if (categoryKey === null || startDate === null || endDate === null || values.gridSize === null) {
    return null;
  }
  return buildAnalysisRequest({
    farm,
    startDate,
    endDate,
    crop: categoryKey,
    gridSize: values.gridSize,
    imageDate: parseIsoDate(values.imageDate),
  });
}

function computeMissingReasons(
  values: AnalysisSetupFormValues,
  errors: UseFormReturn<AnalysisSetupFormValues>['formState']['errors'],
  farm: FarmFeatureCollection | null,
  satelliteDates: SatelliteDatesState,
): string[] {
  const reasons: string[] = [];
  if (farm === null) reasons.push('Add a field boundary.');
  if (values.crop.trim() === '' || errors.crop) reasons.push('Choose a crop.');
  if (values.startDate === '' || values.endDate === '' || errors.startDate || errors.endDate) {
    reasons.push('Choose a date range.');
  } else if (satelliteDates.status === 'loading') {
    reasons.push('Wait for the satellite dates to load.');
  } else if (satelliteDates.status === 'error') {
    reasons.push('Satellite dates could not be loaded; retry to choose an image date.');
  } else if (satelliteDates.status === 'ready' && satelliteDates.passes.length === 0) {
    reasons.push('No satellite image in this period; choose a longer or earlier period.');
  } else if (satelliteDates.status !== 'idle' && !hasChosenPass(satelliteDates, values.imageDate)) {
    reasons.push('Choose a satellite image date.');
  }
  if (values.gridSize === null || errors.gridSize) reasons.push('Set a grid size.');
  return reasons;
}

/**
 * Owns the setup form (spec 3.3 steps 2-4) and the run flow (spec 3.4): validation, the
 * >10,000-cell confirmation, running/cancel, every error shape in spec 2.6, stale-result
 * detection, and the Ctrl/Cmd+Enter shortcut. The workspace renders `AnalysisSetupPanel` and
 * `RunningOverlay` from a single call to this hook so both stay in step.
 */
export function useAnalysisFlow({
  farm,
  today = todayIso(),
  initialValues,
}: UseAnalysisFlowOptions): UseAnalysisFlowResult {
  const schema = useMemo(() => createAnalysisSetupSchema(today), [today]);
  const form = useForm<AnalysisSetupFormValues>({
    defaultValues: { ...defaultAnalysisSetupValues(), ...initialValues },
    resolver: zodResolver(schema),
    mode: 'onChange',
  });
  const { formState, control } = form;
  // Four single-field watches, not `useWatch({ control })` (no `name`): with no `name`, its
  // return type is a deep-partial of the form, which does not match `AnalysisSetupFormValues`
  // below, since RHF cannot guarantee every field has been registered yet.
  const crop = useWatch({ control, name: 'crop' });
  const startDate = useWatch({ control, name: 'startDate' });
  const endDate = useWatch({ control, name: 'endDate' });
  const gridSize = useWatch({ control, name: 'gridSize' });
  const imageDate = useWatch({ control, name: 'imageDate' });
  // Memoized so its reference is stable across renders where none of the fields changed;
  // otherwise every `useMemo`/`useCallback` below that depends on `values` would re-run every
  // render, since a fresh object literal never equals the previous one.
  const values = useMemo<AnalysisSetupFormValues>(
    () => ({ crop, startDate, endDate, gridSize, imageDate }),
    [crop, startDate, endDate, gridSize, imageDate],
  );

  // Look up passes only for a complete, valid period: half-typed dates must not fire requests.
  const periodValid =
    !formState.errors.startDate &&
    !formState.errors.endDate &&
    parseIsoDate(startDate) !== null &&
    parseIsoDate(endDate) !== null &&
    startDate <= endDate;
  const satelliteDates = useSatelliteDates({
    farm,
    startDate: periodValid ? parseIsoDate(startDate) : null,
    endDate: periodValid ? parseIsoDate(endDate) : null,
  });

  // Keep the chosen pass valid: preselect the best one when the list arrives, and replace a
  // choice the new list no longer has (the period or field changed). Clear it when there are none.
  const passes = satelliteDates.status === 'ready' ? satelliteDates.passes : null;
  useEffect(() => {
    if (passes === null) return;
    const current = form.getValues('imageDate');
    if (passes.some((pass) => pass.date === current)) return;
    const next = defaultPass(passes)?.date ?? '';
    if (next !== current) form.setValue('imageDate', next, { shouldValidate: true });
  }, [passes, form]);

  const mutation = useAnalyzeMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // A pending ref (read only from event handlers, never during render) for the request the
  // >10,000-cell confirmation is holding. `lastRequest`/`successHash` below are read during
  // render (to build `state`), so they are plain state rather than refs.
  const pendingRequestRef = useRef<AnalysisRequest | null>(null);
  const [lastRequest, setLastRequest] = useState<AnalysisRequest | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);

  const area = farm === null ? null : areaHectares(farm);
  const cellCount =
    area !== null && values.gridSize !== null ? estimateCellCount(area, values.gridSize) : 0;
  const level = cellWarningLevel(cellCount);

  const missingReasons = useMemo(
    () => computeMissingReasons(values, formState.errors, farm, satelliteDates),
    [values, formState.errors, farm, satelliteDates],
  );
  const canSubmit = missingReasons.length === 0;

  const runRequest = useCallback(
    (request: AnalysisRequest) => {
      setLastRequest(request);
      mutation.mutate(request, {
        onSuccess: () => {
          setSuccessHash(inputsHash(request));
        },
      });
    },
    [mutation],
  );

  // A plain callback (not useMemo): the ref write below must happen only when `submit()` is
  // actually invoked, as an event handler, never synchronously while this hook is rendering.
  const submit = useCallback(
    () =>
      form.handleSubmit((validValues) => {
        const request = buildRequest(validValues, farm);
        if (!request) return;
        if (
          cellWarningLevel(estimateCellCount(area ?? 0, validValues.gridSize ?? 0)) === 'confirm'
        ) {
          pendingRequestRef.current = request;
          setConfirmOpen(true);
          return;
        }
        runRequest(request);
      })(),
    [form, farm, area, runRequest],
  );

  const confirmRun = useCallback(() => {
    setConfirmOpen(false);
    const request = pendingRequestRef.current;
    pendingRequestRef.current = null;
    if (request) runRequest(request);
  }, [runRequest]);

  const cancelConfirm = useCallback(() => {
    setConfirmOpen(false);
    pendingRequestRef.current = null;
  }, []);

  const retry = useCallback(() => {
    if (lastRequest) runRequest(lastRequest);
  }, [lastRequest, runRequest]);

  const reset = useCallback(() => {
    mutation.reset();
  }, [mutation]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (canSubmit && !mutation.isPending) void submit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [submit, canSubmit, mutation.isPending]);

  const state: AnalysisFlowState = useMemo(() => {
    if (mutation.isPending) {
      // `startedAt` is set synchronously in `onMutate`, before `isPending` turns true, so it is
      // never actually null here; the fallback is 0 rather than `Date.now()` to keep this
      // memo pure (a render must not call an impure, time-dependent function).
      return { status: 'running', startedAt: mutation.startedAt ?? 0 };
    }
    if (mutation.isError) {
      return {
        status: 'error',
        error: mutation.error,
        requestSummary: lastRequest ? buildRequestSummary(lastRequest, mutation.error) : '',
      };
    }
    if (mutation.isSuccess) {
      const currentRequest = buildRequest(values, farm);
      const currentHash = currentRequest ? inputsHash(currentRequest) : null;
      // `lastRequest` is always set (in `runRequest`, before `mutate`) to the exact request this
      // mutation is for, so it is never actually null here; `currentRequest` is a defensive
      // fallback for the theoretically unreachable case where it somehow were.
      const request = lastRequest ?? currentRequest;
      if (request === null) {
        return { status: 'idle' };
      }
      return {
        status: 'success',
        data: mutation.data,
        requestHash: successHash ?? '',
        isStale: successHash !== null && currentHash !== successHash,
        request,
      };
    }
    return { status: 'idle' };
  }, [
    mutation.isPending,
    mutation.isError,
    mutation.isSuccess,
    mutation.data,
    mutation.error,
    mutation.startedAt,
    values,
    farm,
    lastRequest,
    successHash,
  ]);

  return {
    form,
    state,
    today,
    canSubmit,
    missingReasons,
    satelliteDates,
    areaHectares: area,
    cellCount,
    cellWarningLevel: level,
    confirmOpen,
    submit,
    confirmRun,
    cancelConfirm,
    cancel: mutation.cancel,
    retry,
    reset,
  };
}
