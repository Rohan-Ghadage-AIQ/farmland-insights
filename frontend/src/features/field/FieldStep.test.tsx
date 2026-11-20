import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FarmFeatureCollection } from '@/domain';
import { FieldStep } from './FieldStep';
import { SAMPLE_FIELD } from './sample-field';

const VALID: FarmFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'f1',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      },
      properties: {},
    },
  ],
};

function makeFile(content: string, name = 'field.geojson'): File {
  return new File([content], name, { type: 'application/geo+json' });
}

describe('FieldStep', () => {
  it('shows Draw, Upload and Paste tabs, with Draw active by default', () => {
    render(<FieldStep value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /draw/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /paste/i })).toBeInTheDocument();
  });

  it('shows an empty-state hint on the Draw tab when there is no field yet', () => {
    render(<FieldStep value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/draw the field outline on the map/i)).toBeInTheDocument();
  });

  it('shows no summary or "Zoom to field" when there is no field', () => {
    render(<FieldStep value={null} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /zoom to field/i })).not.toBeInTheDocument();
  });

  it('shows the area/vertex summary once a field exists', () => {
    render(<FieldStep value={VALID} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /zoom to field/i })).toBeInTheDocument();
  });

  it('loads the sample field when "Load sample field" is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldStep value={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /load sample field/i }));

    expect(onChange).toHaveBeenCalledWith(SAMPLE_FIELD);
  });

  it('loads a field uploaded on the Upload tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldStep value={null} onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: /upload/i }));
    await user.upload(screen.getByLabelText(/choose a file/i), makeFile(JSON.stringify(VALID)));

    expect(onChange).toHaveBeenCalledWith(VALID);
  });

  it('loads a field pasted on the Paste tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldStep value={null} onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: /paste/i }));
    await user.click(screen.getByLabelText(/paste geojson/i));
    await user.paste(JSON.stringify(VALID));

    expect(onChange).toHaveBeenCalledWith(VALID);
  });

  it('calls onZoomToField from the summary', async () => {
    const user = userEvent.setup();
    const onZoomToField = vi.fn();
    render(<FieldStep value={VALID} onChange={vi.fn()} onZoomToField={onZoomToField} />);

    await user.click(screen.getByRole('button', { name: /zoom to field/i }));

    expect(onZoomToField).toHaveBeenCalledTimes(1);
  });

  it('disables the tabs and actions while locked', () => {
    render(<FieldStep value={VALID} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /load sample field/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
