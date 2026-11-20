import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '@/domain';
import { HistoryPanel } from './HistoryPanel';

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'h1',
    savedAt: Date.UTC(2026, 9, 15, 14, 30),
    request: {
      farm_geojson: { type: 'FeatureCollection', features: [] },
      start_date: '2026-10-01',
      end_date: '2026-10-30',
      crop_category: 'cereals_c3_temperate',
      grid_size: 50,
    },
    response: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 1,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
          properties: {
            grid_id: 1,
            cpi_scores: {
              Structural: 0.5,
              Chlorophyll: 0.5,
              Water_Drought: 0.5,
              Environmental: 0.5,
              Agro_Meteo: 0.5,
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('HistoryPanel', () => {
  it('shows a loading state', () => {
    render(<HistoryPanel entries={[]} isLoading onReopen={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an empty state when there are no saved runs', () => {
    render(<HistoryPanel entries={[]} isLoading={false} onReopen={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(/no saved runs/i)).toBeInTheDocument();
  });

  it('lists each saved run with its summary and a Reopen button', () => {
    render(
      <HistoryPanel entries={[entry()]} isLoading={false} onReopen={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.getByText(/Cereals \(C3, temperate\)/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-01/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reopen/i })).toBeInTheDocument();
  });

  it('calls onReopen with the entry when Reopen is clicked', async () => {
    const onReopen = vi.fn();
    const oneEntry = entry();
    render(
      <HistoryPanel entries={[oneEntry]} isLoading={false} onReopen={onReopen} onClear={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /reopen/i }));
    expect(onReopen).toHaveBeenCalledWith(oneEntry);
  });

  it('calls onClear when Clear history is clicked', async () => {
    const onClear = vi.fn();
    render(
      <HistoryPanel entries={[entry()]} isLoading={false} onReopen={vi.fn()} onClear={onClear} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /clear history/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('has no Clear history button when there is nothing to clear', () => {
    render(<HistoryPanel entries={[]} isLoading={false} onReopen={vi.fn()} onClear={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /clear history/i })).not.toBeInTheDocument();
  });
});
