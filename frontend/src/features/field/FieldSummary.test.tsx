import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FarmFeatureCollection } from '@/domain';
import { FieldSummary } from './FieldSummary';

// A roughly 1 ha square (100m x 100m at the equator, ~0.0009 degrees per side).
const FIELD: FarmFeatureCollection = {
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
            [0.0009, 0],
            [0.0009, 0.0009],
            [0, 0.0009],
            [0, 0],
          ],
        ],
      },
      properties: {},
    },
  ],
};

describe('FieldSummary', () => {
  it('shows area in hectares and acres and the vertex count', () => {
    render(<FieldSummary field={FIELD} />);
    expect(screen.getByText(/ha/i)).toBeInTheDocument();
    expect(screen.getByText(/ac/i)).toBeInTheDocument();
    expect(screen.getByText('Vertices').nextElementSibling).toHaveTextContent('4');
  });

  it('calls onZoomToField when the button is clicked', async () => {
    const user = userEvent.setup();
    const onZoomToField = vi.fn();
    render(<FieldSummary field={FIELD} onZoomToField={onZoomToField} />);

    await user.click(screen.getByRole('button', { name: /zoom to field/i }));

    expect(onZoomToField).toHaveBeenCalledTimes(1);
  });

  it('disables the zoom button when there is no onZoomToField handler', () => {
    render(<FieldSummary field={FIELD} />);
    expect(screen.getByRole('button', { name: /zoom to field/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
