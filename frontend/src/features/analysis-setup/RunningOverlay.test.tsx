import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunningOverlay } from './RunningOverlay';

describe('RunningOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the honest status message, never a fake percentage', () => {
    render(<RunningOverlay startedAt={Date.now()} onCancel={vi.fn()} />);

    expect(screen.getByText('Fetching satellite & weather data…')).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('announces the status through an aria-live region', () => {
    render(<RunningOverlay startedAt={Date.now()} onCancel={vi.fn()} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Fetching satellite & weather data');
  });

  it('counts elapsed time up from the start', () => {
    const startedAt = Date.now();
    render(<RunningOverlay startedAt={startedAt} onCancel={vi.fn()} />);

    expect(screen.getByText('0:00')).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText('0:05')).toBeVisible();
  });

  it('formats minutes and seconds past the first minute', () => {
    const startedAt = Date.now();
    render(<RunningOverlay startedAt={startedAt} onCancel={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(75_000);
    });

    expect(screen.getByText('1:15')).toBeVisible();
  });
});

describe('RunningOverlay cancel', () => {
  it('cancels the run', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RunningOverlay startedAt={Date.now()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
