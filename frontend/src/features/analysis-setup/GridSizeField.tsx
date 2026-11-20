import { useController, type Control } from 'react-hook-form';
import { Button, NumberField, Slider } from '@/components/ui';
import {
  cellWarningLevel,
  estimateCellCount,
  GRID_SIZE_PRESETS,
  type CellWarningLevel,
} from '@/domain';
import type { AnalysisSetupFormValues } from './schema';

export interface GridSizeFieldProps {
  readonly control: Control<AnalysisSetupFormValues>;
  readonly disabled?: boolean;
  /** Field area, for the live cell-count estimate. `null` until a field boundary exists. */
  readonly areaHectares: number | null;
}

const SLIDER_MIN = 10;
const SLIDER_MAX = 200;

function estimateMessage(areaHectares: number | null, gridSize: number | null): string {
  if (areaHectares === null) return 'Add a field to estimate the number of cells.';
  if (gridSize === null) return '';
  const count = estimateCellCount(areaHectares, gridSize);
  return `≈ ${count.toLocaleString()} cells`;
}

const WARNING_COPY: Record<Exclude<CellWarningLevel, 'ok'>, string> = {
  warn: 'This may take several minutes.',
  confirm: "That's a lot of cells. We'll ask you to confirm before running.",
};

/** Spec 3.3 step 4: grid size with presets, a slider, and a live cell-count estimate. */
export function GridSizeField({ control, disabled = false, areaHectares }: GridSizeFieldProps) {
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: 'gridSize' });
  const gridSize = field.value;
  const count =
    areaHectares !== null && gridSize !== null ? estimateCellCount(areaHectares, gridSize) : 0;
  const level = areaHectares !== null && gridSize !== null ? cellWarningLevel(count) : 'ok';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {GRID_SIZE_PRESETS.map((preset) => (
          <Button
            key={preset}
            variant="secondary"
            size="sm"
            aria-pressed={gridSize === preset}
            disabled={disabled}
            onClick={() => {
              field.onChange(preset);
            }}
          >
            {preset} m
          </Button>
        ))}
      </div>
      <Slider
        label="Grid size"
        value={
          gridSize === null ? SLIDER_MIN : Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, gridSize))
        }
        onValueChange={(value) => {
          field.onChange(value);
        }}
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={5}
        formatValue={(value) => `${String(value)} m`}
        disabled={disabled}
      />
      <NumberField
        label="Grid size"
        value={gridSize}
        onValueChange={field.onChange}
        min={1}
        integer
        unit="m"
        error={error?.message}
        disabled={disabled}
      />
      <p className="text-sm text-fg-muted" aria-live="polite">
        {estimateMessage(areaHectares, gridSize)}
      </p>
      {level !== 'ok' ? <p className="text-sm text-warning">{WARNING_COPY[level]}</p> : null}
    </div>
  );
}
