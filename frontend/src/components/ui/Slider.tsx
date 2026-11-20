import * as RadixSlider from '@radix-ui/react-slider';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';
import { useFieldIds } from './Field';

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * Stops the arrow/Home/End keys the Radix thumb owns from bubbling past this wrapper to any
 * window-level shortcut (e.g. the results grid's cell-navigation handler), once Radix's own
 * (focused, genuinely interactive) thumb has already handled them. Must run on `onKeyDown`
 * (React's delegated listener), not a native `addEventListener` on the wrapper: Radix's own
 * key handling lives on the slider Root, an ancestor of the thumb but a descendant of the
 * wrapper, and only React's single delegated listener guarantees the Root sees the key before
 * this wrapper's handler stops it going any further.
 */
function stopOwnedKeysPropagating(event: KeyboardEvent<HTMLDivElement>) {
  if (ARROW_KEYS.has(event.key)) {
    event.stopPropagation();
  }
}

export interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** Text for the current value, shown beside the label and spoken by screen readers. */
  readonly formatValue?: (value: number) => string;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

/** Single-value slider. Pair it with a NumberField when users need to type an exact value. */
export function Slider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  formatValue = String,
  description,
  disabled = false,
  id,
  className,
}: SliderProps) {
  const ids = useFieldIds(id);
  const text = formatValue(value);
  return (
    // This wrapper is not itself an interactive control: it only relays a key its interactive
    // descendant (the Radix thumb) already handled, so it never reaches a window-level shortcut.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={cn('flex flex-col gap-2', className)} onKeyDown={stopOwnedKeysPropagating}>
      <div className="flex items-baseline justify-between gap-2">
        <span id={ids.labelId} className="text-sm font-medium text-fg">
          {label}
        </span>
        <span className="text-sm text-fg-muted">{text}</span>
      </div>
      <RadixSlider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([next]) => {
          if (next !== undefined) onValueChange(next);
        }}
        className="relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50"
      >
        <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-border">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={label}
          aria-valuetext={text}
          {...(description ? { 'aria-describedby': ids.descriptionId } : {})}
          className="block size-4 rounded-full border-2 border-accent bg-surface data-[disabled]:cursor-not-allowed"
        />
      </RadixSlider.Root>
      {description ? (
        <p id={ids.descriptionId} className="text-sm text-fg-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
