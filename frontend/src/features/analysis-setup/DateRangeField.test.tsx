import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import type { IsoDate } from '@/domain';
import type { AnalysisSetupFormValues } from './schema';
import { defaultAnalysisSetupValues } from './schema';
import { DateRangeField } from './DateRangeField';

const TODAY = '2026-11-04' as IsoDate;

function Harness({
  endError,
  onRangeChange,
}: {
  readonly endError?: string;
  readonly onRangeChange?: () => void;
}) {
  const { control, setError } = useForm<AnalysisSetupFormValues>({
    defaultValues: defaultAnalysisSetupValues(),
  });
  const start = useWatch({ control, name: 'startDate' });
  const end = useWatch({ control, name: 'endDate' });
  useEffect(() => {
    if (endError !== undefined) setError('endDate', { type: 'custom', message: endError });
  }, [endError, setError]);
  return (
    <>
      <DateRangeField
        control={control}
        today={TODAY}
        {...(onRangeChange === undefined ? {} : { onRangeChange })}
      />
      <output data-testid="start">{start}</output>
      <output data-testid="end">{end}</output>
    </>
  );
}

const startInput = () => screen.getByLabelText('Start date');
const endInput = () => screen.getByLabelText('End date');

describe('DateRangeField', () => {
  it('has a separate field for the start date and for the end date', () => {
    render(<Harness />);
    expect(startInput()).toHaveAttribute('type', 'date');
    expect(endInput()).toHaveAttribute('type', 'date');
    expect(startInput()).not.toBe(endInput());
  });

  it('keeps the start and end dates independent', () => {
    render(<Harness />);
    fireEvent.change(startInput(), { target: { value: '2026-10-01' } });
    expect(screen.getByTestId('start')).toHaveTextContent('2026-10-01');
    expect(screen.getByTestId('end')).toBeEmptyDOMElement();

    fireEvent.change(endInput(), { target: { value: '2026-10-20' } });
    expect(screen.getByTestId('start')).toHaveTextContent('2026-10-01');
    expect(screen.getByTestId('end')).toHaveTextContent('2026-10-20');
  });

  it('shows the value in each field', () => {
    render(<Harness />);
    fireEvent.change(startInput(), { target: { value: '2026-10-01' } });
    fireEvent.change(endInput(), { target: { value: '2026-10-20' } });
    expect(startInput()).toHaveValue('2026-10-01');
    expect(endInput()).toHaveValue('2026-10-20');
  });

  it('stops the calendar at the 16-day forecast limit and says why', () => {
    render(<Harness />);
    expect(endInput()).toHaveAttribute('max', '2026-11-20');
    expect(startInput()).toHaveAttribute('max', '2026-11-20');
    expect(screen.getByText(/forecasts reach only 16 days ahead/i)).toBeVisible();
    expect(screen.getByText(/cannot be after 2026-11-20/)).toBeVisible();
  });

  it('applies the "Last 7 days" preset to both fields', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(startInput()).toHaveValue('2026-10-29');
    expect(endInput()).toHaveValue('2026-11-04');
  });

  it('offers the quick periods, from a week up to a year', () => {
    render(<Harness />);
    const presets = screen.getByRole('group', { name: 'Quick periods' });
    expect(presets).toBeVisible();
    for (const name of [
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'Last 12 months',
      'Next 16 days (forecast)',
    ]) {
      expect(screen.getByRole('button', { name })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: /Season to date/ })).toBeVisible();
  });

  it('can still edit one date after a preset', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    fireEvent.change(endInput(), { target: { value: '2026-11-01' } });
    expect(screen.getByTestId('start')).toHaveTextContent('2026-10-06');
    expect(screen.getByTestId('end')).toHaveTextContent('2026-11-01');
  });

  it('shows an error under the field it belongs to', async () => {
    render(<Harness endError="The end date cannot be after 2026-11-20." />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(endInput()).toHaveAttribute('aria-invalid', 'true');
    expect(startInput()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('The end date cannot be after 2026-11-20.')).toBeVisible();
  });

  it('tells the form after every change to either date or a preset, so it can re-check the pair', async () => {
    const onRangeChange = vi.fn();
    render(<Harness onRangeChange={onRangeChange} />);
    fireEvent.change(startInput(), { target: { value: '2026-10-01' } });
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    fireEvent.change(endInput(), { target: { value: '2026-10-20' } });
    expect(onRangeChange).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(onRangeChange).toHaveBeenCalledTimes(3);
  });

  it('applies the "Last 12 months" preset: a full year ending today', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Last 12 months' }));
    expect(startInput()).toHaveValue('2025-11-05');
    expect(endInput()).toHaveValue('2026-11-04');
    expect(screen.getByText(/^365 days selected/)).toBeVisible();
  });

  it('says how many days are selected as the dates change', () => {
    render(<Harness />);
    expect(screen.queryByText(/days? selected/)).not.toBeInTheDocument();
    fireEvent.change(startInput(), { target: { value: '2026-10-01' } });
    expect(screen.queryByText(/days? selected/)).not.toBeInTheDocument();
    fireEvent.change(endInput(), { target: { value: '2026-10-01' } });
    expect(screen.getByText('1 day selected')).toBeVisible();
    fireEvent.change(endInput(), { target: { value: '2026-10-10' } });
    expect(screen.getByText('10 days selected')).toBeVisible();
  });

  it('warns that long periods take longer, but not for short ones', () => {
    render(<Harness />);
    fireEvent.change(startInput(), { target: { value: '2026-10-01' } });
    fireEvent.change(endInput(), { target: { value: '2026-11-04' } });
    expect(screen.getByText(/^35 days selected$/)).toBeVisible();

    fireEvent.change(startInput(), { target: { value: '2026-04-01' } });
    expect(screen.getByText(/Long periods can take a minute or two/)).toBeVisible();
  });

  it('shows no count while the end is before the start', () => {
    render(<Harness />);
    fireEvent.change(startInput(), { target: { value: '2026-10-20' } });
    fireEvent.change(endInput(), { target: { value: '2026-10-05' } });
    expect(screen.queryByText(/days? selected/)).not.toBeInTheDocument();
  });

  it('tells people up front that a year is the longest period', () => {
    render(<Harness />);
    expect(screen.getByText(/up to 366 days \(about a year\)/)).toBeVisible();
  });
});
