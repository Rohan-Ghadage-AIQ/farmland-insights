import * as RadixToast from '@radix-ui/react-toast';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';
import { IconButton } from './IconButton';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
  /** Milliseconds before it goes away. Infinity keeps it until dismissed. Default 5000. */
  readonly duration?: number;
  readonly action?: { readonly label: string; readonly onAction: () => void };
}

interface ToastApi {
  /** Shows a toast and returns its id. Use for background or async events, never for validation. */
  readonly toast: (options: ToastOptions) => string;
  readonly dismiss: (id: string) => void;
}

interface ToastEntry extends ToastOptions {
  readonly id: string;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be used inside a <ToastProvider>.');
  }
  return api;
}

const TONES: Record<ToastTone, { readonly label: string; readonly classes: string }> = {
  info: { label: '', classes: 'text-accent' },
  success: { label: 'Success', classes: 'text-success' },
  warning: { label: 'Warning', classes: 'text-warning' },
  danger: { label: 'Error', classes: 'text-danger' },
};

function ToastIcon({ tone }: { readonly tone: ToastTone }) {
  if (tone === 'success') return <CheckIcon />;
  if (tone === 'info') return <InfoIcon />;
  return <AlertIcon />;
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const id = `toast-${String(counter.current)}`;
    setToasts((current) => [...current, { ...options, id }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((entry) => {
          const tone = entry.tone ?? 'info';
          return (
            <RadixToast.Root
              key={entry.id}
              // Failures interrupt screen readers; everything else waits its turn.
              type={tone === 'danger' || tone === 'warning' ? 'foreground' : 'background'}
              {...(entry.duration === undefined ? {} : { duration: entry.duration })}
              onOpenChange={(open) => {
                if (!open) dismiss(entry.id);
              }}
              className="fi-slide-in flex items-start gap-3 rounded-panel border border-border bg-surface p-3 shadow-float"
            >
              <span className={cn('mt-0.5 shrink-0', TONES[tone].classes)}>
                <ToastIcon tone={tone} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <RadixToast.Title className="text-base font-medium text-fg">
                  {TONES[tone].label ? <span className="sr-only">{TONES[tone].label}</span> : null}
                  {entry.title}
                </RadixToast.Title>
                {entry.description ? (
                  <RadixToast.Description className="text-sm text-fg-muted">
                    {entry.description}
                  </RadixToast.Description>
                ) : null}
                {entry.action ? (
                  <div className="mt-1">
                    <RadixToast.Action asChild altText={entry.action.label}>
                      <Button variant="secondary" size="sm" onClick={entry.action.onAction}>
                        {entry.action.label}
                      </Button>
                    </RadixToast.Action>
                  </div>
                ) : null}
              </div>
              <RadixToast.Close asChild>
                <IconButton
                  label="Dismiss notification"
                  size="sm"
                  tooltip={false}
                  icon={<CloseIcon />}
                />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className="fixed right-4 bottom-4 z-50 m-0 flex w-96 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
