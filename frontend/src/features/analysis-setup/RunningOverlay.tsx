import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

export interface RunningOverlayProps {
  readonly startedAt: number;
  readonly onCancel: () => void;
}

const STATUS_MESSAGE = 'Fetching satellite & weather data…';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Spec 3.4: a non-blocking progress state over the map while `/analyze` is in flight. An
 * indeterminate bar (never a fake percentage), elapsed time, and Cancel (`AbortController`,
 * via `useAnalysisFlow`'s `cancel`).
 *
 * The ticking elapsed time sits outside the `aria-live` region so it is not re-announced every
 * second; the status message is announced once and again only if it changes.
 */
export function RunningOverlay({ startedAt, onCancel }: RunningOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-border bg-surface p-4 shadow-float">
      <div aria-hidden="true" className="h-1.5 w-56 overflow-hidden rounded-full bg-surface-muted">
        <div className="fi-indeterminate-bar h-full w-1/3 rounded-full bg-accent" />
      </div>
      <p role="status" aria-live="polite" className="text-base font-medium text-fg">
        {STATUS_MESSAGE}
      </p>
      <p aria-hidden="true" className="text-sm tabular-nums text-fg-muted">
        {formatElapsed(now - startedAt)}
      </p>
      <Button variant="secondary" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <style>{`
        @keyframes fi-indeterminate-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .fi-indeterminate-bar { animation: fi-indeterminate-bar 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .fi-indeterminate-bar { animation: none; }
        }
      `}</style>
    </div>
  );
}
