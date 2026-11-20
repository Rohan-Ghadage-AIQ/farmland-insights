import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'size' | 'asChild'> {
  /** Required: it is the accessible name and the tooltip text. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: 'sm' | 'md';
  /** For toggle buttons. Leave undefined for plain actions so aria-pressed is not announced. */
  readonly pressed?: boolean;
  readonly tooltipDelay?: number;
  /**
   * Set false inside layers that manage their own focus and Escape handling (dialogs, toasts):
   * a tooltip that opens on autofocus would swallow the first Escape press.
   */
  readonly tooltip?: boolean;
}

export function IconButton({
  label,
  icon,
  size = 'md',
  variant = 'ghost',
  pressed,
  tooltipDelay,
  tooltip = true,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip
      content={tooltip ? label : null}
      {...(tooltipDelay === undefined ? {} : { delayDuration: tooltipDelay })}
    >
      <Button
        {...rest}
        variant={variant}
        size={size === 'sm' ? 'icon-sm' : 'icon'}
        aria-label={label}
        {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
        className={['aria-pressed:bg-accent-subtle aria-pressed:text-accent', className]
          .filter(Boolean)
          .join(' ')}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}
