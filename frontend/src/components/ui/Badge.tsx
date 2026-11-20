import type { ComponentProps } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends ComponentProps<'span'> {
  readonly tone?: BadgeTone;
  /** Adds a small status dot. The text still carries the meaning; colour is never the only signal. */
  readonly dot?: boolean;
}

const TONES: Record<BadgeTone, { readonly badge: string; readonly dot: string }> = {
  neutral: { badge: 'bg-surface-muted text-fg-muted', dot: 'bg-fg-muted' },
  accent: { badge: 'bg-accent-subtle text-accent', dot: 'bg-accent' },
  success: { badge: 'bg-success-bg text-success', dot: 'bg-success' },
  warning: { badge: 'bg-warning-bg text-warning', dot: 'bg-warning' },
  danger: { badge: 'bg-danger-bg text-danger', dot: 'bg-danger' },
};

export function Badge({ tone = 'neutral', dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone].badge,
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span
          data-badge-dot=""
          aria-hidden="true"
          className={cn('inline-block size-2 rounded-full', TONES[tone].dot)}
        />
      ) : null}
      {children}
    </span>
  );
}
