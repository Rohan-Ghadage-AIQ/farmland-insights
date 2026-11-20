import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { CONTROL_CLASSES, describedBy, FieldShell, useFieldIds } from './Field';
import { MinusIcon, PlusIcon } from './icons';

export interface NumberFieldProps {
  readonly label: string;
  /** null means "empty". The field never invents a number for the user. */
  readonly value: number | null;
  readonly onValueChange: (value: number | null) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Round to a whole number when the user leaves the field. */
  readonly integer?: boolean;
  /** Shown after the value, for example "m". */
  readonly unit?: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

function parseText(text: string): number | null {
  if (text === '' || text === '.' || text === '-' || text === '-.') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function decimalsOf(step: number): number {
  const [, fraction] = String(step).split('.');
  return fraction?.length ?? 0;
}

export function NumberField({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  integer = false,
  unit,
  description,
  error,
  disabled = false,
  id,
  className,
}: NumberFieldProps) {
  const ids = useFieldIds(id);
  const [text, setText] = useState(formatNumber(value));
  const [previous, setPrevious] = useState(value);

  // Follow the controlled value when it changes from outside (a preset, a reset), but keep
  // what the user is typing when it already means the same number ("12." means 12).
  if (value !== previous) {
    setPrevious(value);
    if (value !== parseText(text)) setText(formatNumber(value));
  }

  const current = parseText(text);
  const allowNegative = min === undefined || min < 0;
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const commit = (next: number | null) => {
    setText(formatNumber(next));
    setPrevious(next);
    onValueChange(next);
  };

  const stepBy = (direction: 1 | -1) => {
    if (disabled) return;
    const base = current ?? (direction > 0 ? (min ?? 0) : (max ?? 0));
    const raw = current === null ? base : base + direction * step;
    commit(clamp(Number(raw.toFixed(decimalsOf(step)))));
  };

  const handleChange = (input: string) => {
    const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    if (!pattern.test(input)) return;
    setText(input);
    const next = parseText(input);
    setPrevious(next);
    onValueChange(next);
  };

  const handleBlur = () => {
    if (current === null) {
      setText('');
      return;
    }
    const normalised = clamp(integer ? Math.round(current) : current);
    setText(formatNumber(normalised));
    if (normalised !== current) commit(normalised);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1);
    }
  };

  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      className={className}
    >
      <div className="flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <input
            id={ids.id}
            type="text"
            role="spinbutton"
            inputMode={integer ? 'numeric' : 'decimal'}
            autoComplete="off"
            value={text}
            disabled={disabled}
            aria-valuenow={current ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ids, { description, error })}
            onChange={(event) => {
              handleChange(event.target.value);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn(CONTROL_CLASSES, unit ? 'pr-8' : false)}
          />
          {unit ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-muted">
              {unit}
            </span>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Decrease ${label}`}
          disabled={disabled || (current !== null && min !== undefined && current <= min)}
          onClick={() => {
            stepBy(-1);
          }}
        >
          <MinusIcon />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Increase ${label}`}
          disabled={disabled || (current !== null && max !== undefined && current >= max)}
          onClick={() => {
            stepBy(1);
          }}
        >
          <PlusIcon />
        </Button>
      </div>
    </FieldShell>
  );
}
