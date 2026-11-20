import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button, Dialog, Stepper, StepperStep, type StepStatus } from '@/components/ui';
import { cropCategoryLabel, dayCount, findCrop, parseIsoDate } from '@/domain';
import { AnalysisErrorPanel } from './AnalysisErrorPanel';
import { AnalyzeButton } from './AnalyzeButton';
import { CropField } from './CropField';
import { DateRangeField } from './DateRangeField';
import { GridSizeField } from './GridSizeField';
import { formatPassDate } from './satellite-dates';
import { SatelliteDateField } from './SatelliteDateField';
import type { AnalysisSetupFormValues } from './schema';
import { StaleBadge } from './StaleBadge';
import type { UseAnalysisFlowResult } from './use-analysis-flow';
import { hasChosenPass } from './use-satellite-dates';

export interface AnalysisSetupPanelProps {
  /** A single `useAnalysisFlow(...)` call, shared with `RunningOverlay` in the map slot. */
  readonly flow: UseAnalysisFlowResult;
}

type StepNumber = 2 | 3 | 4;

function cropSummary(values: { crop: string }): string | undefined {
  const crop = findCrop(values.crop);
  if (!crop) return undefined;
  return `${crop.english} · ${crop.desi} — ${cropCategoryLabel(crop.category)}`;
}

function periodSummary(values: {
  startDate: string;
  endDate: string;
  imageDate: string;
}): string | undefined {
  const start = parseIsoDate(values.startDate);
  const end = parseIsoDate(values.endDate);
  if (!start || !end) return undefined;
  const days = dayCount(start, end);
  const period = `${values.startDate} – ${values.endDate} · ${String(days)} ${days === 1 ? 'day' : 'days'}`;
  return values.imageDate === '' ? period : `${period} · image ${formatPassDate(values.imageDate)}`;
}

function gridSummary(values: { gridSize: number | null }, cellCount: number): string | undefined {
  if (values.gridSize === null) return undefined;
  return `${String(values.gridSize)} m · ≈ ${cellCount.toLocaleString()} cells`;
}

function stepStatus(complete: boolean, hasError: boolean): StepStatus {
  if (hasError) return 'error';
  return complete ? 'complete' : 'incomplete';
}

/**
 * Spec 3.3 steps 2-4 (crop, period, grid) and the Analyze action. Step 1 (the field boundary) is
 * owned by the `field` feature; its result is read from `flow`'s `areaHectares`/missing reasons.
 */
export function AnalysisSetupPanel({ flow }: AnalysisSetupPanelProps) {
  const [openSteps, setOpenSteps] = useState<Record<StepNumber, boolean>>({
    2: true,
    3: false,
    4: false,
  });
  const { form, state } = flow;
  const { control, formState } = form;
  // Four single-field watches, not `useWatch({ control })` (no `name`): see the same note in
  // `useAnalysisFlow`.
  const crop = useWatch({ control, name: 'crop' });
  const startDate = useWatch({ control, name: 'startDate' });
  const endDate = useWatch({ control, name: 'endDate' });
  const gridSize = useWatch({ control, name: 'gridSize' });
  const imageDate = useWatch({ control, name: 'imageDate' });
  const values: AnalysisSetupFormValues = { crop, startDate, endDate, gridSize, imageDate };
  const errors = formState.errors;
  const locked = state.status === 'running';

  const cropComplete = findCrop(values.crop) !== null;
  const dates = flow.satelliteDates;
  const periodComplete =
    values.startDate !== '' &&
    values.endDate !== '' &&
    !errors.startDate &&
    !errors.endDate &&
    !errors.imageDate &&
    hasChosenPass(dates, values.imageDate);
  const gridComplete = values.gridSize !== null && !errors.gridSize;

  const toggle = (step: StepNumber) => (open: boolean) => {
    setOpenSteps((previous) => ({ ...previous, [step]: open }));
  };

  return (
    <div className="flex flex-col gap-4">
      <Stepper>
        <StepperStep
          number={2}
          title="Crop"
          status={stepStatus(cropComplete, Boolean(errors.crop))}
          summary={cropSummary(values)}
          open={openSteps[2]}
          onOpenChange={toggle(2)}
          locked={locked}
        >
          <CropField control={form.control} disabled={locked} />
        </StepperStep>

        <StepperStep
          number={3}
          title="Period"
          status={stepStatus(
            periodComplete,
            Boolean(errors.startDate ?? errors.endDate ?? errors.imageDate),
          )}
          summary={periodSummary(values)}
          open={openSteps[3]}
          onOpenChange={toggle(3)}
          locked={locked}
        >
          <DateRangeField
            control={form.control}
            disabled={locked}
            today={flow.today}
            onRangeChange={() => {
              void form.trigger(['startDate', 'endDate']);
            }}
          />
          <div className="mt-4">
            <SatelliteDateField control={form.control} dates={dates} disabled={locked} />
          </div>
        </StepperStep>

        <StepperStep
          number={4}
          title="Grid size"
          status={stepStatus(gridComplete, Boolean(errors.gridSize))}
          summary={gridSummary(values, flow.cellCount)}
          open={openSteps[4]}
          onOpenChange={toggle(4)}
          locked={locked}
        >
          <GridSizeField
            control={form.control}
            disabled={locked}
            areaHectares={flow.areaHectares}
          />
        </StepperStep>
      </Stepper>

      {state.status === 'success' && state.isStale ? <StaleBadge /> : null}
      {state.status === 'error' ? (
        <AnalysisErrorPanel
          error={state.error}
          requestSummary={state.requestSummary}
          onRetry={flow.retry}
        />
      ) : null}

      <AnalyzeButton
        canSubmit={flow.canSubmit}
        missingReasons={flow.missingReasons}
        isRunning={locked}
        onSubmit={() => {
          void flow.submit();
        }}
      />

      <Dialog
        open={flow.confirmOpen}
        onOpenChange={(open) => {
          if (!open) flow.cancelConfirm();
        }}
        title="Run a large analysis?"
        description={`This will create about ${flow.cellCount.toLocaleString()} cells and may take several minutes.`}
        footer={
          <>
            <Button variant="secondary" onClick={flow.cancelConfirm}>
              Cancel
            </Button>
            <Button variant="primary" onClick={flow.confirmRun}>
              Run anyway
            </Button>
          </>
        }
      />
    </div>
  );
}
