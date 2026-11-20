import * as Collapsible from '@radix-ui/react-collapsible';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { AlertIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon } from './icons';

export interface ErrorBannerProps {
  readonly title: string;
  /** What happened and what to do next, in plain language. */
  readonly message: ReactNode;
  /** Raw detail for support (response body, request summary). Shown only under "Technical details". */
  readonly details?: unknown;
  /** danger for failures; warning for problems that did not stop the work. */
  readonly tone?: 'danger' | 'warning';
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly className?: string;
}

/** Renders details as readable text without ever throwing (circular objects, BigInt, ...). */
export function formatDetails(details: unknown): string | null {
  if (details === undefined || details === null) return null;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    // Circular structures, BigInt and the like: say so rather than printing [object Object].
    return '[These details could not be displayed]';
  }
}

type CopyState = 'idle' | 'copied' | 'failed';

function CopyButton({ text }: { readonly text: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = window.setTimeout(() => {
      setState('idle');
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setState('copied');
      },
      () => {
        setState('failed');
      },
    );
  };

  const label =
    state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : 'Copy details';
  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      <CopyIcon />
      {label}
    </Button>
  );
}

export function ErrorBanner({
  title,
  message,
  details,
  tone = 'danger',
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorBannerProps) {
  const [open, setOpen] = useState(false);
  const detailText = formatDetails(details);
  const toneClasses =
    tone === 'danger'
      ? 'border-danger bg-danger-bg text-danger'
      : 'border-warning bg-warning-bg text-warning';

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn('flex flex-col gap-2 rounded-panel border p-3', toneClasses, className)}
    >
      <div className="flex items-start gap-2">
        <AlertIcon className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-base font-semibold">{title}</p>
          <div className="text-base">{message}</div>
        </div>
      </div>

      {onRetry || detailText !== null ? (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {detailText === null ? null : (
            <Collapsible.Root open={open} onOpenChange={setOpen} className="w-full">
              <div className="flex items-center gap-1">
                <Collapsible.Trigger asChild>
                  <Button variant="ghost" size="sm">
                    {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    Technical details
                  </Button>
                </Collapsible.Trigger>
                {open ? <CopyButton text={detailText} /> : null}
              </div>
              <Collapsible.Content>
                <pre
                  data-testid="error-details"
                  className="mt-2 max-h-48 overflow-auto rounded-control border border-border bg-surface p-2 text-xs whitespace-pre-wrap text-fg"
                >
                  {detailText}
                </pre>
              </Collapsible.Content>
            </Collapsible.Root>
          )}
        </div>
      ) : null}
    </div>
  );
}
