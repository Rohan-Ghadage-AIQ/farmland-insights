import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorBanner } from './ErrorBanner';
import { Skeleton } from './Skeleton';
import './test-support';

describe('Badge', () => {
  it('shows its text and defaults to the neutral tone', () => {
    render(<Badge>Stale</Badge>);

    expect(screen.getByText('Stale')).toHaveAttribute('data-tone', 'neutral');
  });

  it.each(['accent', 'success', 'warning', 'danger'] as const)('supports the %s tone', (tone) => {
    render(<Badge tone={tone}>Label</Badge>);

    expect(screen.getByText('Label')).toHaveAttribute('data-tone', tone);
  });

  it('adds a status dot that is hidden from assistive technology', () => {
    render(
      <Badge tone="success" dot>
        Healthy
      </Badge>,
    );

    const badge = screen.getByText('Healthy');
    expect(badge.querySelector('[data-badge-dot]')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the requested number of text lines', () => {
    const { container } = render(<Skeleton lines={3} />);

    expect(container.querySelectorAll('[data-skeleton-line]')).toHaveLength(3);
  });

  it('applies explicit size', () => {
    const { container } = render(<Skeleton width={120} height={16} />);

    expect(container.firstElementChild).toHaveStyle({ width: '120px', height: '16px' });
  });
});

describe('EmptyState', () => {
  it('shows a title and a description', () => {
    render(<EmptyState title="No field yet" description="Draw a boundary on the map." />);

    expect(screen.getByRole('heading', { name: 'No field yet', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Draw a boundary on the map.')).toBeInTheDocument();
  });

  it('lets the caller choose the heading level so the outline stays correct', () => {
    render(<EmptyState title="Nothing here" headingLevel={2} />);

    expect(screen.getByRole('heading', { name: 'Nothing here', level: 2 })).toBeInTheDocument();
  });

  it('renders an action', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<EmptyState title="No field" action={<Button onClick={onClick}>Load sample</Button>} />);

    await user.click(screen.getByRole('button', { name: 'Load sample' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBanner', () => {
  it('announces itself as an alert with a title and a message', () => {
    render(<ErrorBanner title="Analysis failed" message="The area is too large." />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Analysis failed');
    expect(alert).toHaveTextContent('The area is too large.');
  });

  it('keeps technical details collapsed until asked, then shows them', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBanner
        title="Analysis failed"
        message="Something went wrong."
        details={{ error: 'bad_request', status: 400 }}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Technical details' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/bad_request/)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/bad_request/)).toBeInTheDocument();
  });

  it('pretty-prints object details and shows string details verbatim', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ErrorBanner title="t" message="m" details={{ a: 1 }} />);
    await user.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(screen.getByTestId('error-details').textContent).toBe('{\n  "a": 1\n}');

    rerender(<ErrorBanner title="t" message="m" details="plain text" />);
    expect(screen.getByTestId('error-details').textContent).toBe('plain text');
  });

  it('does not break on details that cannot be serialised (circular objects)', async () => {
    const user = userEvent.setup();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    render(<ErrorBanner title="t" message="m" details={circular} />);

    await user.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByTestId('error-details')).toHaveTextContent('could not be displayed');
  });

  it('has no Technical details control when there is nothing technical to show', () => {
    render(<ErrorBanner title="Oops" message="Nope." />);

    expect(screen.queryByRole('button', { name: 'Technical details' })).not.toBeInTheDocument();
  });

  it('offers a retry action when given a handler', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorBanner title="Oops" message="Try again." onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('copies the technical details so they can be pasted into a bug report', async () => {
    const user = userEvent.setup();
    render(<ErrorBanner title="Oops" message="m" details={{ status: 500 }} />);
    await user.click(screen.getByRole('button', { name: 'Technical details' }));

    await user.click(screen.getByRole('button', { name: 'Copy details' }));

    expect(await navigator.clipboard.readText()).toBe('{\n  "status": 500\n}');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('supports a warning tone for non-fatal problems, announced politely rather than as an alert', () => {
    render(<ErrorBanner tone="warning" title="Heads up" message="Large area." />);

    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'warning');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
