import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayLabel,
  monthLabel,
  shiftMonths,
  startOfMonth,
  weekdayIndex,
  WEEKDAY_NAMES,
} from './date-utils';
import { IconButton } from './IconButton';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export interface DateRange {
  readonly start: string | null;
  readonly end: string | null;
}

export interface DatePreset {
  readonly label: string;
  readonly range: { readonly start: string; readonly end: string };
}

export interface DateCalendarProps {
  readonly value: DateRange;
  readonly today: string;
  readonly minDate?: string | undefined;
  readonly maxDate?: string | undefined;
  readonly minDateReason?: string | undefined;
  readonly maxDateReason?: string | undefined;
  readonly presets?: readonly DatePreset[] | undefined;
  readonly onSelect: (range: { readonly start: string; readonly end: string }) => void;
}

const KEY_MOVES: Readonly<Record<string, (iso: string) => string>> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  Home: (d) => addDays(d, -weekdayIndex(d)),
  End: (d) => addDays(d, 6 - weekdayIndex(d)),
  PageUp: (d) => shiftMonths(d, -1),
  PageDown: (d) => shiftMonths(d, 1),
};

/** Month grid with a two-click range selection and full keyboard support. Mounts fresh on each open. */
export function DateCalendar({
  value,
  today,
  minDate,
  maxDate,
  minDateReason,
  maxDateReason,
  presets,
  onSelect,
}: DateCalendarProps) {
  const noteId = useId();
  const headingId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const wantsFocus = useRef(true);

  const initial = value.start ?? today;
  const [focusDate, setFocusDate] = useState(initial);
  const [month, setMonth] = useState(startOfMonth(initial));
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, month]);

  const isDisabled = (iso: string) =>
    (minDate !== undefined && iso < minDate) || (maxDate !== undefined && iso > maxDate);

  const start = pendingStart ?? value.start;
  const end = pendingStart === null ? value.end : null;
  const weeks = buildMonthGrid(month);
  const visible = weeks.flat().filter((iso) => iso.startsWith(month.slice(0, 7)));
  const blockedBefore = minDate !== undefined && visible.some((iso) => iso < minDate);
  const blockedAfter = maxDate !== undefined && visible.some((iso) => iso > maxDate);
  const notes = [
    blockedBefore ? minDateReason : undefined,
    blockedAfter ? maxDateReason : undefined,
  ].filter((note): note is string => note !== undefined);

  const press = (iso: string) => {
    if (isDisabled(iso)) return;
    if (pendingStart === null) {
      setPendingStart(iso);
      return;
    }
    onSelect(
      iso < pendingStart ? { start: iso, end: pendingStart } : { start: pendingStart, end: iso },
    );
  };

  const moveTo = (iso: string, requestFocus: boolean) => {
    wantsFocus.current = requestFocus;
    setFocusDate(iso);
    setMonth(startOfMonth(iso));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    // Stop the arrow/Home/End/PageUp/PageDown keys this grid owns from bubbling to any
    // window-level shortcut (e.g. the results grid's cell-navigation handler).
    event.stopPropagation();
    moveTo(move(focusDate), true);
  };

  const changeMonth = (delta: 1 | -1) => {
    moveTo(shiftMonths(focusDate, delta), false);
    setMonth(addMonths(month, delta));
  };

  return (
    <div className="flex w-72 flex-col gap-3">
      {presets && presets.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="secondary"
              size="sm"
              onClick={() => {
                onSelect(preset.range);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <IconButton
          label="Previous month"
          size="sm"
          icon={<ChevronLeftIcon />}
          onClick={() => {
            changeMonth(-1);
          }}
        />
        <p id={headingId} aria-live="polite" className="text-base font-medium text-fg">
          {monthLabel(month)}
        </p>
        <IconButton
          label="Next month"
          size="sm"
          icon={<ChevronRightIcon />}
          onClick={() => {
            changeMonth(1);
          }}
        />
      </div>

      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
        className="w-full border-collapse text-center"
      >
        <thead>
          <tr>
            {WEEKDAY_NAMES.map((name) => (
              <th
                key={name}
                scope="col"
                abbr={name}
                className="pb-1 text-xs font-medium text-fg-muted"
              >
                {name.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((iso) => {
                if (!iso.startsWith(month.slice(0, 7))) return <td key={iso} />;
                const disabled = isDisabled(iso);
                const isStart = iso === start;
                const isEnd = iso === end;
                const inRange = start !== null && end !== null && iso > start && iso < end;
                return (
                  <td
                    key={iso}
                    role="gridcell"
                    className={cn('p-0', inRange && 'bg-accent-subtle')}
                  >
                    <button
                      type="button"
                      data-date={iso}
                      aria-label={dayLabel(iso)}
                      aria-pressed={isStart || isEnd}
                      aria-disabled={disabled ? true : undefined}
                      aria-current={iso === today ? 'date' : undefined}
                      aria-describedby={disabled && notes.length > 0 ? noteId : undefined}
                      tabIndex={iso === focusDate ? 0 : -1}
                      onClick={() => {
                        setFocusDate(iso);
                        press(iso);
                      }}
                      className={cn(
                        'size-9 rounded-control text-base',
                        isStart || isEnd
                          ? 'bg-accent text-accent-fg'
                          : 'text-fg hover:bg-surface-muted',
                        disabled &&
                          'cursor-not-allowed text-fg-muted opacity-50 line-through hover:bg-transparent',
                        iso === today && !(isStart || isEnd) && 'font-bold underline',
                      )}
                    >
                      {String(Number(iso.slice(8, 10)))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p id={noteId} className={cn('text-sm text-fg-muted', notes.length === 0 && 'hidden')}>
        {notes.join(' ')}
      </p>
    </div>
  );
}
