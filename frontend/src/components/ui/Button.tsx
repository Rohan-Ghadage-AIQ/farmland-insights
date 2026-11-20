import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps, MouseEvent } from 'react';
import { cn } from './cn';
import { SpinnerIcon } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm';

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'disabled'> {
  /** There is exactly one primary action per screen ("Analyze"); everything else is secondary or ghost. */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /**
   * Looks and behaves disabled but stays focusable (aria-disabled), so a tooltip can explain
   * why, for example what is missing before "Analyze" can run.
   */
  readonly disabled?: boolean;
  /** Shows a spinner, keeps the label, announces busy and ignores clicks. */
  readonly loading?: boolean;
  /** Render the single child (for example a link) with the button's look. */
  readonly asChild?: boolean;
}

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap ' +
  'select-none transition-colors duration-150 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg enabled:hover:brightness-95 enabled:active:brightness-90 ' +
    'aria-disabled:hover:brightness-100',
  secondary:
    'border border-border-strong bg-surface text-fg hover:bg-surface-muted active:bg-surface-muted ' +
    'aria-disabled:hover:bg-surface',
  ghost:
    'text-fg hover:bg-surface-muted active:bg-surface-muted aria-disabled:hover:bg-transparent',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-sm',
  md: 'h-9 px-3 text-base',
  icon: 'size-9',
  'icon-sm': 'size-7',
};

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  asChild = false,
  type = 'button',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const inert = disabled || loading;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      // Also stops a disabled submit button from submitting its form.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);
  const shared = {
    'data-variant': variant,
    'aria-disabled': inert ? true : undefined,
    'aria-busy': loading ? true : undefined,
    className: classes,
    onClick: handleClick,
    ...rest,
  } as const;

  if (asChild) {
    return <Slot {...shared}>{children}</Slot>;
  }
  return (
    <button type={type} {...shared}>
      {loading ? <SpinnerIcon /> : null}
      {children}
    </button>
  );
}
