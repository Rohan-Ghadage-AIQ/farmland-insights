import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import './test-support';

const TODAY = '2025-03-15';

function setup(props: Partial<React.ComponentProps<typeof DateRangePicker>> = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <DateRangePicker
      label="Period"
      value={{ start: null, end: null }}
      onChange={onChange}
      today={TODAY}
      {...props}
    />,
  );
  return { user, onChange, trigger: screen.getByRole('button', { name: /Period/ }) };
}

const day = (name: string) => screen.getByRole('button', { name });

describe('DateRangePicker', () => {
  it('prompts for dates when empty', () => {
    const { trigger } = setup();

    expect(trigger).toHaveTextContent('Select dates');
  });

  it('shows the chosen range and its length in days', () => {
    const { trigger } = setup({ value: { start: '2025-03-01', end: '2025-03-30' } });

    expect(trigger).toHaveTextContent('2025-03-01');
    expect(trigger).toHaveTextContent('2025-03-30');
    expect(trigger).toHaveTextContent('30 days');
  });

  it('uses a singular for a one-day range', () => {
    const { trigger } = setup({ value: { start: '2025-03-01', end: '2025-03-01' } });

    expect(trigger).toHaveTextContent('1 day');
    expect(trigger).not.toHaveTextContent('1 days');
  });

  it('opens a calendar on the month of the start date', async () => {
    const { user, trigger } = setup({ value: { start: '2025-02-10', end: '2025-02-20' } });

    await user.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'Period' })).toBeInTheDocument();
    expect(screen.getByText('February 2025')).toBeInTheDocument();
  });

  it('opens on the current month when nothing is chosen', async () => {
    const { user, trigger } = setup();

    await user.click(trigger);

    expect(await screen.findByText('March 2025')).toBeInTheDocument();
  });

  it('picks a range with two clicks, then reports it and closes', async () => {
    const { user, trigger, onChange } = setup();
    await user.click(trigger);

    await user.click(await screen.findByRole('button', { name: 'Monday, 3 March 2025' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(day('Friday, 7 March 2025'));

    expect(onChange).toHaveBeenCalledWith({
      start: '2025-03-03',
      end: '2025-03-07',
    } satisfies DateRange);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('swaps the dates when the second click is earlier than the first', async () => {
    const { user, trigger, onChange } = setup();
    await user.click(trigger);

    await user.click(await screen.findByRole('button', { name: 'Friday, 7 March 2025' }));
    await user.click(day('Monday, 3 March 2025'));

    expect(onChange).toHaveBeenCalledWith({ start: '2025-03-03', end: '2025-03-07' });
  });

  it('marks start and end days as selected for assistive technology', async () => {
    const { user, trigger } = setup({ value: { start: '2025-03-03', end: '2025-03-07' } });
    await user.click(trigger);

    expect(await screen.findByRole('button', { name: 'Monday, 3 March 2025' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(day('Friday, 7 March 2025')).toHaveAttribute('aria-pressed', 'true');
    expect(day('Wednesday, 5 March 2025')).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables days after the maximum, ignores clicks on them and explains why', async () => {
    const { user, trigger, onChange } = setup({
      maxDate: '2025-03-31',
      maxDateReason: 'Forecasts only reach 16 days ahead.',
    });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Next month' }));

    const blocked = day('Tuesday, 1 April 2025');
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await user.click(blocked);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Forecasts only reach 16 days ahead.')).toBeInTheDocument();
  });

  it('disables days before the minimum', async () => {
    const { user, trigger } = setup({ minDate: '2025-03-10' });
    await user.click(trigger);

    expect(await screen.findByRole('button', { name: 'Sunday, 9 March 2025' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(day('Monday, 10 March 2025')).not.toHaveAttribute('aria-disabled');
  });

  it('applies a preset in one click', async () => {
    const preset = { label: 'Last 7 days', range: { start: '2025-03-09', end: '2025-03-15' } };
    const { user, trigger, onChange } = setup({ presets: [preset] });
    await user.click(trigger);

    await user.click(await screen.findByRole('button', { name: 'Last 7 days' }));

    expect(onChange).toHaveBeenCalledWith(preset.range);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates between months with the header buttons', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.click(await screen.findByRole('button', { name: 'Next month' }));
    expect(screen.getByText('April 2025')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('February 2025')).toBeInTheDocument();
  });

  it('puts keyboard focus on a day when opened and moves with the arrow keys', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    const today = await screen.findByRole('button', { name: 'Saturday, 15 March 2025' });
    expect(today).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(day('Sunday, 16 March 2025')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(day('Sunday, 23 March 2025')).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(day('Saturday, 15 March 2025')).toHaveFocus();
  });

  it('does not let its own arrow keys bubble to a window-level shortcut', async () => {
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);
    try {
      const { user, trigger } = setup();
      await user.click(trigger);
      await screen.findByRole('button', { name: 'Saturday, 15 March 2025' });

      await user.keyboard('{ArrowRight}');

      expect(day('Sunday, 16 March 2025')).toHaveFocus();
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydown);
    }
  });

  it('keeps arrow-key focus going across a month boundary', async () => {
    const { user, trigger } = setup({ value: { start: '2025-03-31', end: '2025-03-31' } });
    await user.click(trigger);

    await screen.findByRole('button', { name: 'Monday, 31 March 2025' });
    await user.keyboard('{ArrowRight}');

    expect(screen.getByText('April 2025')).toBeInTheDocument();
    expect(day('Tuesday, 1 April 2025')).toHaveFocus();
  });

  it('selects with the keyboard', async () => {
    const { user, trigger, onChange } = setup();
    await user.click(trigger);
    await screen.findByRole('button', { name: 'Saturday, 15 March 2025' });

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowLeft}{ArrowLeft}{Enter}');

    expect(onChange).toHaveBeenCalledWith({ start: '2025-03-13', end: '2025-03-15' });
  });

  it('closes on Escape without changing anything', async () => {
    const { user, trigger, onChange } = setup();
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an error under the trigger', () => {
    const { trigger } = setup({ error: 'Choose a start and end date.' });

    expect(trigger).toHaveAccessibleDescription('Choose a start and end date.');
  });

  it('can be disabled', async () => {
    const { user, trigger } = setup({ disabled: true });

    await user.click(trigger);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
