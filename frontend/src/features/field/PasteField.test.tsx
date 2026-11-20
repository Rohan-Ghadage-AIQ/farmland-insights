import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasteField } from './PasteField';

const VALID = JSON.stringify({
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
});

describe('PasteField', () => {
  it('renders an empty textarea and calls onLoad with nothing yet', () => {
    render(<PasteField onLoad={vi.fn()} />);
    expect(screen.getByLabelText(/paste geojson/i)).toHaveValue('');
  });

  it('shows no error for an empty textarea', () => {
    render(<PasteField onLoad={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls onLoad with the validated collection once the pasted text is valid', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<PasteField onLoad={onLoad} />);

    await user.click(screen.getByLabelText(/paste geojson/i));
    await user.paste(VALID);

    expect(onLoad).toHaveBeenCalledWith(JSON.parse(VALID));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a plain-language error while the text is not valid JSON yet, without calling onLoad', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<PasteField onLoad={onLoad} />);

    await user.click(screen.getByLabelText(/paste geojson/i));
    await user.paste('{ not json');

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid json/i);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('shows the domain validation message for an invalid geometry', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const unclosed = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 0],
              ],
            ],
          },
          properties: {},
        },
      ],
    });
    render(<PasteField onLoad={onLoad} />);

    await user.click(screen.getByLabelText(/paste geojson/i));
    await user.paste(unclosed);

    expect(await screen.findByRole('alert')).toHaveTextContent(/not closed/i);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('clears the error once the text becomes valid again', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<PasteField onLoad={onLoad} />);
    const textarea = screen.getByLabelText(/paste geojson/i);

    await user.click(textarea);
    await user.paste('not json');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.clear(textarea);
    await user.paste(VALID);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledWith(JSON.parse(VALID));
  });
});
