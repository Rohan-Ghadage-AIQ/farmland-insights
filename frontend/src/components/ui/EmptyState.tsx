import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  /** Match the surrounding outline so the heading order stays valid. */
  readonly headingLevel?: 2 | 3 | 4;
  readonly className?: string;
}

/** Designed empty state: says what is missing and what to do next. Never a blank area. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const Heading = `h${String(headingLevel)}` as 'h2' | 'h3' | 'h4';
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-8 text-center', className)}>
      {icon ? <div className="text-fg-muted">{icon}</div> : null}
      <Heading className="text-md font-semibold text-fg">{title}</Heading>
      {description ? <p className="max-w-prose text-base text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
