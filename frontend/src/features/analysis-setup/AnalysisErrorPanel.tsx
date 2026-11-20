import { ErrorBanner } from '@/components/ui';
import { userMessage, type ApiError, type ApiErrorKind } from '@/api';

export interface AnalysisErrorPanelProps {
  readonly error: ApiError;
  /** The copyable request summary (spec 2.6: 500s get one). Ignored for every other kind. */
  readonly requestSummary: string;
  readonly onRetry: () => void;
}

const TITLES: Record<ApiErrorKind, string> = {
  domain: "Couldn't run the analysis",
  validation: 'Check your inputs',
  auth: 'Session expired',
  notFound: 'Not found',
  rateLimited: 'Too many requests',
  server: 'Something went wrong',
  network: "Can't reach the server",
  aborted: 'Analysis cancelled',
  timeout: 'Taking too long',
  unknown: 'Unexpected error',
};

const WARNING_KINDS: ReadonlySet<ApiErrorKind> = new Set(['aborted', 'network', 'rateLimited']);

/** Spec 2.6: one banner for every `/analyze` failure, with Retry and (for 500) a copyable summary. */
export function AnalysisErrorPanel({ error, requestSummary, onRetry }: AnalysisErrorPanelProps) {
  return (
    <ErrorBanner
      title={TITLES[error.kind]}
      message={userMessage(error, { action: 'analyze' })}
      tone={WARNING_KINDS.has(error.kind) ? 'warning' : 'danger'}
      details={error.kind === 'server' ? requestSummary : undefined}
      onRetry={onRetry}
    />
  );
}
