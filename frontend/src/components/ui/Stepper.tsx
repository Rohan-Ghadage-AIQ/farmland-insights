import * as Collapsible from '@radix-ui/react-collapsible';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from './icons';

export type StepStatus = 'incomplete' | 'complete' | 'error';

export function Stepper({ className, ...rest }: ComponentProps<'ol'>) {
  return <ol className={cn('m-0 flex list-none flex-col gap-2 p-0', className)} {...rest} />;
}

export interface StepperStepProps {
  readonly number: number;
  readonly title: string;
  readonly status: StepStatus;
  /** One line shown under the title once the step is complete and collapsed. */
  readonly summary?: ReactNode;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Blocks opening and closing, for example while an analysis is running. */
  readonly locked?: boolean;
  readonly children: ReactNode;
}

const MARKER: Record<StepStatus, string> = {
  incomplete: 'border border-border-strong text-fg-muted',
  complete: 'bg-accent text-accent-fg',
  error: 'border border-danger bg-danger-bg text-danger',
};

const STATUS_WORDS: Record<StepStatus, string> = {
  incomplete: '',
  complete: 'Complete: ',
  error: 'Needs attention: ',
};

/** One step of progressive disclosure: a header that shows state and a summary, and an editable body. */
export function StepperStep({
  number,
  title,
  status,
  summary,
  open,
  onOpenChange,
  locked = false,
  children,
}: StepperStepProps) {
  const showSummary = status === 'complete' && !open && summary !== undefined && summary !== null;
  return (
    <li className="rounded-panel border border-border bg-surface">
      <Collapsible.Root
        open={open}
        onOpenChange={(next) => {
          if (!locked) onOpenChange(next);
        }}
      >
        <Collapsible.Trigger
          aria-disabled={locked ? true : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-panel p-3 text-left',
            locked ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-muted',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-medium',
              MARKER[status],
            )}
          >
            {status === 'complete' ? <CheckIcon size={14} /> : number}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-medium text-fg">
              <span className="sr-only">{STATUS_WORDS[status]}</span>
              <span className="sr-only">{`Step ${String(number)}: `}</span>
              {title}
            </span>
            {showSummary ? <span className="truncate text-sm text-fg-muted">{summary}</span> : null}
          </span>
          {open ? (
            <ChevronDownIcon className="text-fg-muted" />
          ) : (
            <ChevronRightIcon className="text-fg-muted" />
          )}
        </Collapsible.Trigger>
        <Collapsible.Content className="px-3 pb-3">{children}</Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
}
