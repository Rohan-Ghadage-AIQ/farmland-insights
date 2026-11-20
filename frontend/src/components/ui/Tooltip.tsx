import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  /** Nothing to say (null, undefined, false or empty) renders the trigger alone. */
  readonly content: ReactNode;
  /** A single element that can hold a ref. It also opens on keyboard focus. */
  readonly children: ReactElement;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly delayDuration?: number;
}

/** Supplementary text only: never put essential information or interactive content in a tooltip. */
export function Tooltip({ content, children, side = 'top', delayDuration = 300 }: TooltipProps) {
  if (content === null || content === undefined || content === false || content === '') {
    return children;
  }
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className="fi-fade-in z-50 max-w-72 rounded-control bg-fg px-2 py-1 text-xs text-bg shadow-float"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
