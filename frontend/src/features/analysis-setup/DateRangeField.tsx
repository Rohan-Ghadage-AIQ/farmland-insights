import { useMemo } from 'react';
import { useController, type Control } from 'react-hook-form';
import { Button, TextField } from '@/components/ui';
import {
  dayCount,
  getDatePresets,
  MAX_FORECAST_DAYS,
  MAX_PERIOD_DAYS,
  maxEndDate,
  parseIsoDate,
  todayIso,
  type IsoDate,
} from '@/domain';
import type { AnalysisSetupFormValues } from './schema';

/** Beyond this many days a run takes noticeably longer, so say so before it starts. */
const LONG_PERIOD_DAYS = 60;

export interface DateRangeFieldProps {
  readonly control: Control<AnalysisSetupFormValues>;
  readonly disabled?: boolean;
  /** Injected "today" so tests and the app share one clock. Defaults to the local date. */
  readonly today?: IsoDate;
  /**
   * Called after either date changes. The form uses it to re-check both dates together, because a
   * problem with the range (end before start) belongs to the pair, not to the field just edited.
   */
  readonly onRangeChange?: () => void;
}

/**
 * Spec 3.3 step 3: a separate Start date and End date (type the date or use the calendar), with
 * one-click presets for the common periods. The end date cannot go past the +16-day forecast limit.
 */
export function DateRangeField({
  control,
  disabled = false,
  today = todayIso(),
  onRangeChange,
}: DateRangeFieldProps) {
  const start = useController({ control, name: 'startDate' });
  const end = useController({ control, name: 'endDate' });
  const presets = useMemo(() => getDatePresets(today), [today]);
  const limit = maxEndDate(today);
  const startDay = parseIsoDate(start.field.value);
  const endDay = parseIsoDate(end.field.value);
  const days =
    startDay !== null && endDay !== null && startDay <= endDay ? dayCount(startDay, endDay) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <TextField
          label="Start date"
          type="date"
          name={start.field.name}
          value={start.field.value}
          max={limit}
          disabled={disabled}
          error={start.fieldState.error?.message}
          onChange={(event) => {
            start.field.onChange(event.target.value);
            onRangeChange?.();
          }}
          onBlur={start.field.onBlur}
        />
        <TextField
          label="End date"
          type="date"
          name={end.field.name}
          value={end.field.value}
          max={limit}
          disabled={disabled}
          error={end.fieldState.error?.message}
          onChange={(event) => {
            end.field.onChange(event.target.value);
            onRangeChange?.();
          }}
          onBlur={end.field.onBlur}
        />
      </div>

      <div role="group" aria-label="Quick periods" className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              start.field.onChange(preset.start);
              end.field.onChange(preset.end);
              onRangeChange?.();
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <p aria-live="polite" className="text-fg-muted min-h-4 text-xs font-medium">
        {days === null
          ? ''
          : `${String(days)} ${days === 1 ? 'day' : 'days'} selected${days > LONG_PERIOD_DAYS ? '. Long periods can take a minute or two.' : ''}`}
      </p>

      <p className="text-fg-muted text-xs">
        A period can be up to {MAX_PERIOD_DAYS} days (about a year). Forecasts reach only{' '}
        {MAX_FORECAST_DAYS} days ahead, so the end date cannot be after {limit}.
      </p>
    </div>
  );
}
