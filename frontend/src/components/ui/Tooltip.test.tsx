import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';
import './test-support';

describe('Tooltip', () => {
  it('is hidden until the trigger is hovered', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Dates after today + 16 days are unavailable" delayDuration={0}>
        <button type="button">Date</button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Date' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Dates after today + 16 days are unavailable',
    );
  });

  it('shows on keyboard focus and links the trigger to the text', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Explains the control" delayDuration={0}>
        <button type="button">Control</button>
      </Tooltip>,
    );

    await user.tab();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Explains the control');
    expect(screen.getByRole('button', { name: 'Control' })).toHaveAccessibleDescription(
      'Explains the control',
    );
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Hint" delayDuration={0}>
        <button type="button">Control</button>
      </Tooltip>,
    );
    await user.tab();
    await screen.findByRole('tooltip');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders no tooltip when there is nothing to say', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={null} delayDuration={0}>
        <button type="button">Control</button>
      </Tooltip>,
    );

    await user.hover(screen.getByRole('button', { name: 'Control' }));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
