import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/lib/logger';

export interface ErrorFallbackProps {
  readonly error: Error;
  /** Clears the error and tries to render the children again. */
  readonly reset: () => void;
}

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: (props: ErrorFallbackProps) => ReactNode;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
  /** When any of these change while showing the fallback, the boundary resets itself. */
  readonly resetKeys?: readonly unknown[];
}

interface State {
  readonly error: Error | null;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));
}

/** Base error boundary. Use AppErrorBoundary at the root and PanelErrorBoundary around each panel. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  static getDerivedStateFromError(error: unknown): State {
    return { error: toError(error) };
  }

  override state: State = { error: null };

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('UI error caught by boundary', error.message, info.componentStack);
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error !== null && keysChanged(previous.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return this.props.fallback({ error, reset: this.reset });
    }
    return this.props.children;
  }
}

/** What to show under "Technical details": enough for a bug report, never shown by default. */
export function errorDetails(error: Error): Record<string, string> {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };
}
