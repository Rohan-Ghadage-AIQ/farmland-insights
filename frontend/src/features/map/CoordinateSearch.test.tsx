import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CoordinateSearch } from './CoordinateSearch';

function setup(disabled = false) {
  const onGo = vi.fn();
  render(<CoordinateSearch onGo={onGo} disabled={disabled} />);
  return { onGo, input: screen.getByRole('textbox', { name: /coordinates/i }) };
}

describe('CoordinateSearch', () => {
  it('goes to the typed position when Go is pressed', async () => {
    const { onGo, input } = setup();
    await userEvent.type(input, '23.6025, 72.4025');
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onGo).toHaveBeenCalledWith({ lat: 23.6025, lon: 72.4025 });
  });

  it('goes when Enter is pressed', async () => {
    const { onGo, input } = setup();
    await userEvent.type(input, '12.5 S, 45 W{Enter}');
    expect(onGo).toHaveBeenCalledWith({ lat: -12.5, lon: -45 });
  });

  it('understands degrees, minutes and seconds', async () => {
    const { onGo, input } = setup();
    await userEvent.type(input, `23°36'9"N 72°24'9"E{Enter}`);
    const [value] = onGo.mock.calls[0] as [{ lat: number; lon: number }];
    expect(value.lat).toBeCloseTo(23.6025, 6);
    expect(value.lon).toBeCloseTo(72.4025, 6);
  });

  it('explains a position it cannot read, and does not move the map', async () => {
    const { onGo, input } = setup();
    await userEvent.type(input, 'not a place{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(/latitude and longitude/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(onGo).not.toHaveBeenCalled();
  });

  it('names an out-of-range value', async () => {
    const { input } = setup();
    await userEvent.type(input, '95, 100{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(/latitude must be between -90 and 90/i);
  });

  it('shows a hint when empty', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears the message as soon as the person edits', async () => {
    const { input } = setup();
    await userEvent.type(input, 'oops{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.type(input, '1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('cannot be used until the map exists', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  });
});
