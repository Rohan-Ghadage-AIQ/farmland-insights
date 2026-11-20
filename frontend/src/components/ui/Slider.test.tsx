import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from './Slider';
import './test-support';

function Harness({ onValue }: { readonly onValue?: (value: number) => void }) {
  const [value, setValue] = useState(50);
  return (
    <Slider
      label="Grid size"
      min={10}
      max={100}
      step={10}
      value={value}
      formatValue={(v) => `${String(v)} m`}
      onValueChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe('Slider', () => {
  it('exposes a named slider with its value and range', () => {
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: 'Grid size' });

    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(slider).toHaveAttribute('aria-valuemin', '10');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
  });

  it('shows the formatted value and uses it as the spoken value text', () => {
    render(<Harness />);

    expect(screen.getByText('50 m')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Grid size' })).toHaveAttribute(
      'aria-valuetext',
      '50 m',
    );
  });

  it('changes with the arrow, Home and End keys', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    const slider = screen.getByRole('slider', { name: 'Grid size' });

    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(onValue).toHaveBeenLastCalledWith(60);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(onValue).toHaveBeenLastCalledWith(40);
    await user.keyboard('{End}');
    expect(onValue).toHaveBeenLastCalledWith(100);
    await user.keyboard('{Home}');
    expect(onValue).toHaveBeenLastCalledWith(10);
    expect(screen.getByText('10 m')).toBeInTheDocument();
  });

  it('does not let its own arrow keys bubble to a window-level shortcut', async () => {
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);
    try {
      const onValue = vi.fn();
      const user = userEvent.setup();
      render(<Harness onValue={onValue} />);
      const slider = screen.getByRole('slider', { name: 'Grid size' });

      slider.focus();
      await user.keyboard('{ArrowRight}');

      expect(onValue).toHaveBeenLastCalledWith(60);
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydown);
    }
  });

  it('does not respond when disabled', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Slider
        label="Grid size"
        min={10}
        max={100}
        value={50}
        disabled
        onValueChange={onValueChange}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Grid size' });

    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute('data-disabled');
  });
});
