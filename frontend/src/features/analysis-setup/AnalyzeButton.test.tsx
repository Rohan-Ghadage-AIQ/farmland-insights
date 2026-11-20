import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import { AnalyzeButton } from './AnalyzeButton';

describe('AnalyzeButton', () => {
  it('is disabled with a tooltip listing exactly what is missing', async () => {
    const user = userEvent.setup();
    render(
      <AnalyzeButton
        canSubmit={false}
        missingReasons={['Add a field boundary.', 'Choose a crop.']}
        isRunning={false}
        onSubmit={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Analyze' });
    expect(button).toHaveAttribute('aria-disabled', 'true');

    await user.hover(button);
    expect(await screen.findByText('Add a field boundary.')).toBeVisible();
    expect(await screen.findByText('Choose a crop.')).toBeVisible();
  });

  it('is enabled and clickable once the form is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AnalyzeButton canSubmit missingReasons={[]} isRunning={false} onSubmit={onSubmit} />);

    const button = screen.getByRole('button', { name: 'Analyze' });
    expect(button).not.toHaveAttribute('aria-disabled');

    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('is disabled while already running', () => {
    render(<AnalyzeButton canSubmit missingReasons={[]} isRunning onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
