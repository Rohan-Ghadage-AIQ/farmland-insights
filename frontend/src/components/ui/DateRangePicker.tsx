import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { DateCalendar, type DatePreset, type DateRange } from './DateCalendar';
import { daysInclusive, todayIso } from './date-utils';
import { describedBy, FieldShell, useFieldIds } from './Field';
import { CalendarIcon } from './icons';

export type { DatePreset, DateRange } from './DateCalendar';

export interface DateRangePickerProps {
  readonly label: string;
  readonly value: DateRange;
  readonly onChange: (range: { readonly start: string; readonly end: string }) => void;
  /** Earliest selectable day (ISO). */
  readonly minDate?: string;
  /** Latest selectable day (ISO). */
  readonly maxDate?: string;
  /** Shown in the calendar whenever days are blocked by minDate, so the limit is never a mystery. */
  readonly minDateReason?: string;
  readonly maxDateReason?: string;
  readonly presets?: readonly DatePreset[];
  /** Injected "today" (ISO) so tests and the app share one clock. Defaults to the local date. */
  readonly today?: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

function summarise({ start, end }: DateRange): string | null {
  if (start === null || end === null) return null;
  const days = daysInclusive(start, end);
  return `${start} \u2013 ${end} \u00b7 ${String(days)} ${days === 1 ? 'day' : 'days'}`;
}

/** Date range in one popover: presets for the common cases, a calendar for anything else. */
export function DateRangePicker({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  minDateReason,
  maxDateReason,
  presets,
  today,
  description,
  error,
  disabled = false,
  id,
  className,
}: DateRangePickerProps) {
  const ids = useFieldIds(id);
  const valueId = `${ids.id}-value`;
  const [open, setOpen] = useState(false);
  const summary = summarise(value);

  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      className={className}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            id={ids.id}
            variant="secondary"
            disabled={disabled}
            aria-labelledby={`${ids.labelId} ${valueId}`}
            aria-describedby={describedBy(ids, { description, error })}
            aria-invalid={error ? true : undefined}
            className="w-full justify-start font-normal"
          >
            <CalendarIcon className="shrink-0 text-fg-muted" />
            <span id={valueId} className={summary === null ? 'text-fg-muted' : undefined}>
              {summary ?? 'Select dates'}
            </span>
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-label={label}
            align="start"
            sideOffset={6}
            collisionPadding={8}
            // The calendar moves focus to the right day itself once it has mounted.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
            }}
            className="fi-fade-in z-50 rounded-panel border border-border bg-surface p-3 shadow-float"
          >
            <DateCalendar
              value={value}
              today={today ?? todayIso()}
              minDate={minDate}
              maxDate={maxDate}
              minDateReason={minDateReason}
              maxDateReason={maxDateReason}
              presets={presets}
              onSelect={(range) => {
                onChange(range);
                setOpen(false);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </FieldShell>
  );
}
