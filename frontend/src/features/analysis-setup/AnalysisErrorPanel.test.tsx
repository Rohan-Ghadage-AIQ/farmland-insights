import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError, ApiErrorFields } from '@/api';
import { AnalysisErrorPanel } from './AnalysisErrorPanel';

function error(fields: ApiErrorFields & { message?: string }): ApiError {
  const err = new Error(fields.message ?? 'x') as ApiError;
  return Object.assign(err, { name: 'ApiError' }, fields);
}

describe('AnalysisErrorPanel', () => {
  it('400: shows the domain detail and offers Retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <AnalysisErrorPanel
        error={error({
          kind: 'domain',
          status: 400,
          detail: 'invalid polygon',
          details: {},
          fieldErrors: {},
        })}
        requestSummary=""
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('invalid polygon')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('422: shows the validation message', () => {
    render(
      <AnalysisErrorPanel
        error={error({ kind: 'validation', status: 422, issues: [], fieldErrors: {} })}
        requestSummary=""
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/check the highlighted fields/i)).toBeVisible();
  });

  it('500: shows a friendly message and a copyable request summary', async () => {
    const user = userEvent.setup();
    render(
      <AnalysisErrorPanel
        error={error({
          kind: 'server',
          status: 500,
          detail: 'boom',
          code: 'internal_server_error',
        })}
        requestSummary={'{"endpoint":"POST /api/v1/analyze"}'}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/something went wrong on our side/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(screen.getByTestId('error-details')).toHaveTextContent('POST /api/v1/analyze');
    expect(screen.getByRole('button', { name: 'Copy details' })).toBeVisible();
  });

  it('network: explains the server could not be reached', () => {
    render(
      <AnalysisErrorPanel error={error({ kind: 'network' })} requestSummary="" onRetry={vi.fn()} />,
    );

    expect(screen.getByText(/check your connection and try again/i)).toBeVisible();
  });

  it('aborted: says the analysis was cancelled', () => {
    render(
      <AnalysisErrorPanel error={error({ kind: 'aborted' })} requestSummary="" onRetry={vi.fn()} />,
    );

    expect(screen.getByText('Analysis cancelled.')).toBeVisible();
  });

  it('429: shows the rate-limit message', () => {
    render(
      <AnalysisErrorPanel
        error={error({ kind: 'rateLimited', status: 429, detail: 'x', retryAfterSeconds: 30 })}
        requestSummary=""
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Too many requests. Try again in 30 seconds.')).toBeVisible();
  });

  it('does not show technical details for a non-500 error', () => {
    render(
      <AnalysisErrorPanel error={error({ kind: 'network' })} requestSummary="" onRetry={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Technical details' })).not.toBeInTheDocument();
  });
});
