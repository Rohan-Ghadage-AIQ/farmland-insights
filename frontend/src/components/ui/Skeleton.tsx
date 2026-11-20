import type { CSSProperties } from 'react';
import { cn } from './cn';

export interface SkeletonProps {
  readonly width?: number | string;
  readonly height?: number | string;
  /** Renders this many text-like lines instead of a single block (the last one is shorter). */
  readonly lines?: number;
  readonly className?: string;
}

const BLOCK = 'fi-skeleton rounded-control bg-surface-muted';

/**
 * Placeholder shape for content that is loading. Purely visual and hidden from assistive
 * technology: pair it with an aria-live status elsewhere if the wait needs announcing.
 */
export function Skeleton({ width, height, lines, className }: SkeletonProps) {
  if (lines !== undefined && lines > 0) {
    return (
      <div aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            data-skeleton-line=""
            className={cn(BLOCK, 'h-3')}
            style={{ width: index === lines - 1 && lines > 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    );
  }

  const style: CSSProperties = {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
  return (
    <div
      aria-hidden="true"
      className={cn(BLOCK, height === undefined && 'h-4', className)}
      style={style}
    />
  );
}
