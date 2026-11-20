import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmAnalysisRequest, FarmAnalysisResponse } from '@/domain';
import { ExportControls } from './ExportControls';
import { makeCell } from './test-support';

const cells = [makeCell(1, { metrics: { ndvi: 0.6 } })];
const response: FarmAnalysisResponse = { type: 'FeatureCollection', features: cells };

describe('ExportControls', () => {
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  let createObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn<() => void>();
    createObjectUrl = vi.fn(() => 'blob:fake-url');
    vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clickSpy();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads the response as GeoJSON', async () => {
    const user = userEvent.setup();
    render(<ExportControls response={response} cells={cells} />);
    await user.click(screen.getByRole('button', { name: /geojson/i }));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const [blob] = createObjectUrl.mock.calls[0] as [Blob];
    expect(blob.type).toBe('application/geo+json');
  });

  it('downloads the flattened CSV', async () => {
    const user = userEvent.setup();
    render(<ExportControls response={response} cells={cells} />);
    await user.click(screen.getByRole('button', { name: /csv/i }));
    const [blob] = createObjectUrl.mock.calls[0] as [Blob];
    expect(blob.type).toBe('text/csv');
  });

  it('disables the PNG export when no map export function is supplied', () => {
    render(<ExportControls response={response} cells={cells} />);
    expect(screen.getByRole('button', { name: /png/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('exports the map PNG using the supplied function, without touching URL.createObjectURL', async () => {
    const user = userEvent.setup();
    const exportMapPng = vi.fn(() => 'data:image/png;base64,AAAA');
    render(<ExportControls response={response} cells={cells} exportMapPng={exportMapPng} />);
    const button = screen.getByRole('button', { name: /png/i });
    expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(exportMapPng).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('disables GeoJSON and CSV export when there are no cells', () => {
    render(<ExportControls response={{ type: 'FeatureCollection', features: [] }} cells={[]} />);
    expect(screen.getByRole('button', { name: /geojson/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: /csv/i })).toHaveAttribute('aria-disabled', 'true');
  });

  describe('HTML report', () => {
    const REQUEST: FarmAnalysisRequest = {
      farm_geojson: { type: 'FeatureCollection', features: [] },
      start_date: '2024-01-01',
      end_date: '2024-02-15',
      crop_category: 'cereals_c3_temperate',
      grid_size: 50,
    };

    it('downloads an HTML report that embeds the captured map and every cell value', async () => {
      const user = userEvent.setup();
      const captureMap = vi.fn(() => Promise.resolve('data:image/png;base64,iVBORw0KGgo='));
      render(
        <ExportControls
          response={response}
          cells={cells}
          report={{ request: REQUEST, captureMap, mapCaption: 'Layer shown: NDVI.' }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Export HTML report' }));

      await vi.waitFor(() => {
        expect(createObjectUrl).toHaveBeenCalledTimes(1);
      });
      expect(captureMap).toHaveBeenCalledTimes(1);
      const [blob] = createObjectUrl.mock.calls[0] as [Blob];
      expect(blob.type).toBe('text/html');
      const html = await blob.text();
      expect(html).toContain('<img class="photo" src="data:image/png;base64,iVBORw0KGgo="');
      expect(html).toContain('Layer shown: NDVI.');
      expect(html).toContain('2024-01-01 to 2024-02-15');
      expect(html).toContain('>0.60<');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('still exports, and says the map is missing, when the capture fails', async () => {
      const user = userEvent.setup();
      render(
        <ExportControls
          response={response}
          cells={cells}
          report={{ captureMap: () => Promise.reject(new Error('tainted canvas')) }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Export HTML report' }));

      expect(await screen.findByRole('status')).toHaveTextContent(/without it/i);
      const [blob] = createObjectUrl.mock.calls[0] as [Blob];
      expect(await blob.text()).not.toContain('<img');
    });

    it('exports without a map image when no capture function is supplied', async () => {
      const user = userEvent.setup();
      render(<ExportControls response={response} cells={cells} />);
      await user.click(screen.getByRole('button', { name: 'Export HTML report' }));
      await vi.waitFor(() => {
        expect(createObjectUrl).toHaveBeenCalledTimes(1);
      });
    });

    it('is disabled when there are no cells', () => {
      render(<ExportControls response={response} cells={[]} />);
      expect(screen.getByRole('button', { name: 'Export HTML report' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });
  });
});
