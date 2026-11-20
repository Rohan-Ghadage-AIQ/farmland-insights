import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FarmFeatureCollection } from '@/domain';
import { UploadField } from './UploadField';

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

describe('UploadField', () => {
  it('renders a drop zone with a file picker button', () => {
    render(<UploadField onLoad={vi.fn()} />);
    expect(screen.getByText(/drag.*drop/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/choose a file/i)).toBeInTheDocument();
  });

  it('loads a valid GeoJSON file picked through the input and calls onLoad', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<UploadField onLoad={onLoad} />);

    const input = screen.getByLabelText(/choose a file/i);
    await user.upload(input, makeFile(JSON.stringify(VALID)));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0]?.[0]).toEqual(VALID);
  });

  it('strips foreign members (bbox, crs) from an uploaded file before calling onLoad', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<UploadField onLoad={onLoad} />);

    const withExtras = { ...VALID, bbox: [0, 0, 1, 1], crs: { type: 'name' } };
    await user.upload(
      screen.getByLabelText(/choose a file/i),
      makeFile(JSON.stringify(withExtras)),
    );

    expect(onLoad).toHaveBeenCalledWith(VALID);
  });

  it('shows a plain-language error for a file that is not valid JSON', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<UploadField onLoad={onLoad} />);

    await user.upload(screen.getByLabelText(/choose a file/i), makeFile('not json'));

    expect(await screen.findByText(/valid json/i)).toBeInTheDocument();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('shows the domain validation message for a geometry the backend would reject', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const openRing: FarmFeatureCollection = {
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
              ],
            ],
          },
          properties: {},
        },
      ],
    };
    render(<UploadField onLoad={onLoad} />);

    await user.upload(screen.getByLabelText(/choose a file/i), makeFile(JSON.stringify(openRing)));

    expect(await screen.findByText(/not closed/i)).toBeInTheDocument();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('rejects a file that is not .geojson or .json by its extension', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<UploadField onLoad={onLoad} />);

    await user.upload(
      screen.getByLabelText(/choose a file/i),
      makeFile(JSON.stringify(VALID), 'field.txt'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/\.geojson.*\.json/i);
    expect(onLoad).not.toHaveBeenCalled();
  });
});
