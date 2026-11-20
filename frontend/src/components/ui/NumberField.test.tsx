import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';
import './test-support';

function Harness({
  initial = 50,
  onValue,
  ...rest
}: {
  readonly initial?: number | null;
  readonly onValue?: (value: number | null) => void;
} & Partial<React.ComponentProps<typeof NumberField>>) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <NumberField
      label="Grid size"
      min={10}
      max={100}
      step={5}
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe('NumberField', () => {
  it('is a labelled spinbutton exposing its range to assistive technology', () => {
    render(<Harness initial={50} />);
    const field = screen.getByRole('spinbutton', { name: 'Grid size' });

    expect(field).toHaveValue('50');
    expect(field).toHaveAttribute('aria-valuenow', '50');
    expect(field).toHaveAttribute('aria-valuemin', '10');
    expect(field).toHaveAttribute('aria-valuemax', '100');
  });

  it('shows a unit', () => {
    render(<Harness unit="m" />);

    expect(screen.getByText('m')).toBeInTheDocument();
  });

  it('reports each valid number as it is typed', async () => {
    const onValue = vi.fn<(value: number | null) => void>();
    const user = userEvent.setup();
    render(<Harness initial={null} onValue={onValue} />);

    await user.type(screen.getByRole('spinbutton'), '75');

    expect(onValue.mock.calls.map(([v]) => v)).toEqual([7, 75]);
  });

  it('reports null when the field is emptied', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={50} onValue={onValue} />);

    await user.clear(screen.getByRole('spinbutton'));

    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('ignores characters that are not part of a number', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);

    await user.type(screen.getByRole('spinbutton'), 'a1b2');

    expect(screen.getByRole('spinbutton')).toHaveValue('12');
  });

  it('clamps to the range when the user leaves the field', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={50} onValue={onValue} />);
    const field = screen.getByRole('spinbutton');

    await user.clear(field);
    await user.type(field, '500');
    await user.tab();

    expect(field).toHaveValue('100');
    expect(onValue).toHaveBeenLastCalledWith(100);

    await user.clear(field);
    await user.type(field, '1');
    await user.tab();

    expect(field).toHaveValue('10');
    expect(onValue).toHaveBeenLastCalledWith(10);
  });

  it('rounds to a whole number on blur when integer is set', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} integer step={1} min={1} max={1000} />);
    const field = screen.getByRole('spinbutton');

    await user.type(field, '12.6');
    await user.tab();

    expect(field).toHaveValue('13');
  });

  it('leaves an emptied field empty on blur rather than inventing a value', async () => {
    const user = userEvent.setup();
    render(<Harness initial={50} />);
    const field = screen.getByRole('spinbutton');

    await user.clear(field);
    await user.tab();

    expect(field).toHaveValue('');
  });

  it('steps with the buttons and stops at the bounds', async () => {
    const user = userEvent.setup();
    render(<Harness initial={95} />);
    const field = screen.getByRole('spinbutton');

    await user.click(screen.getByRole('button', { name: 'Increase Grid size' }));
    expect(field).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'Increase Grid size' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Decrease Grid size' }));
    expect(field).toHaveValue('95');
  });

  it('steps with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness initial={50} />);
    const field = screen.getByRole('spinbutton');

    await user.click(field);
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}');

    expect(field).toHaveValue('55');
  });

  it('starts stepping from the minimum when empty', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);

    await user.click(screen.getByRole('button', { name: 'Increase Grid size' }));

    expect(screen.getByRole('spinbutton')).toHaveValue('10');
  });

  it('follows the controlled value when it changes from outside', async () => {
    const user = userEvent.setup();
    function WithPresets() {
      const [value, setValue] = useState<number | null>(50);
      return (
        <>
          <NumberField label="Size" value={value} onValueChange={setValue} min={10} max={100} />
          <button
            type="button"
            onClick={() => {
              setValue(20);
            }}
          >
            Preset 20
          </button>
        </>
      );
    }
    render(<WithPresets />);

    await user.click(screen.getByRole('button', { name: 'Preset 20' }));

    expect(screen.getByRole('spinbutton', { name: 'Size' })).toHaveValue('20');
  });

  it('shows an error and marks the field invalid', () => {
    render(<Harness error="Enter a whole number of metres." />);
    const field = screen.getByRole('spinbutton');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Enter a whole number of metres.');
  });

  it('can be disabled', async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);

    expect(screen.getByRole('spinbutton')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Increase Grid size' }));
    expect(screen.getByRole('spinbutton')).toHaveValue('50');
  });
});
