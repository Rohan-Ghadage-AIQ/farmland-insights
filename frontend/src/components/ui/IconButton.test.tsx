import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import './test-support';

describe('IconButton', () => {
  it('uses the required label as its accessible name', () => {
    render(<IconButton label="Close panel" icon={<CloseIcon />} />);

    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
  });

  it('shows the label as a tooltip on focus, so sighted keyboard users see it too', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Close panel" icon={<CloseIcon />} tooltipDelay={0} />);

    await user.tab();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Close panel');
  });

  it('can opt out of the tooltip (inside dialogs, where it would swallow the first Escape)', async () => {
    const user = userEvent.setup();
    render(<IconButton label="Close" icon={<CloseIcon />} tooltip={false} tooltipDelay={0} />);

    await user.tab();

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton label="Close" icon={<CloseIcon />} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reports a toggled state through aria-pressed only when pressed is provided', () => {
    const { rerender } = render(<IconButton label="Layer" icon={<CloseIcon />} />);
    expect(screen.getByRole('button', { name: 'Layer' })).not.toHaveAttribute('aria-pressed');

    rerender(<IconButton label="Layer" icon={<CloseIcon />} pressed />);
    expect(screen.getByRole('button', { name: 'Layer' })).toHaveAttribute('aria-pressed', 'true');

    rerender(<IconButton label="Layer" icon={<CloseIcon />} pressed={false} />);
    expect(screen.getByRole('button', { name: 'Layer' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores clicks when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton label="Close" icon={<CloseIcon />} disabled onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('hides the decorative icon from assistive technology', () => {
    render(<IconButton label="Close" icon={<CloseIcon />} />);

    expect(screen.getByRole('button', { name: 'Close' }).querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
