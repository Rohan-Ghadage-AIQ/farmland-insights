import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ClusterKey } from '@/domain';
import { CellDetailPanel } from './CellDetailPanel';
import { makeCell } from './test-support';

const FARM_MEANS: Record<ClusterKey, number | null> = {
  Structural: 0.5,
  Chlorophyll: null,
  Water_Drought: 0.6,
  Environmental: 0.55,
  Agro_Meteo: 0.45,
};

describe('CellDetailPanel', () => {
  it('shows the CPI bars with the farm mean as a reference tick', () => {
    const cell = makeCell(3, { metrics: { ndvi: 0.6 }, cpi: { Structural: 0.7 } });
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    const row = screen.getByRole('listitem', { name: /Canopy structure/ });
    expect(row).toHaveAccessibleName(expect.stringContaining('0.70'));
    expect(within(row).getByTestId('cluster-reference-tick')).toBeInTheDocument();
  });

  it('shows raw metrics grouped by cluster with full name, value and unit', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.645, t2m: 24.8 } });
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    expect(screen.getByText('Normalized Difference Vegetation Index')).toBeInTheDocument();
    expect(screen.getByText('0.65')).toBeInTheDocument(); // ndvi: 2 decimals
    expect(screen.getByText('Air temperature at 2 meters height')).toBeInTheDocument();
    expect(screen.getByText('24.8 °C')).toBeInTheDocument();
  });

  it('shows a measured/derived badge per metric', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.6, cmi: 10 } }); // ndvi measured, cmi derived
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    expect(screen.getByText('Measured')).toBeInTheDocument();
    expect(screen.getByText('Derived')).toBeInTheDocument();
  });

  it('gives the abbreviation a tooltip with the full name', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.6 } });
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    const abbr = screen.getByText('NDVI');
    expect(abbr).toHaveAttribute('title', 'Normalized Difference Vegetation Index');
  });

  it('notes an unverified scale for precip and et_actual (gdd is now in degree-days)', () => {
    const cell = makeCell(1, { metrics: { precip: 0.4, et_actual: 0.3, gdd: 120, ndvi: 0.5 } });
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    expect(screen.getAllByText(/unverified scale/i)).toHaveLength(2);
  });

  it('does not note an unverified scale for an ordinary metric', () => {
    const cell = makeCell(1, { metrics: { ndvi: 0.5 } });
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    expect(screen.queryByText(/unverified scale/i)).toBeNull();
  });

  it('shows a clear message when raw_metrics is empty', () => {
    const cell = makeCell(1); // no metrics key at all
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    expect(screen.getByText(/no raw metrics/i)).toBeInTheDocument();
  });

  it("groups this cell's advisories by cluster", () => {
    const cell = makeCell(1, {
      metrics: { ndvi: 0.3, t2m: 24 },
      advisories: { ndvi: 'Routine scout for pests', t2m: 'Irrigate soon' },
    });
    render(<CellDetailPanel cell={cell} farmMeans={FARM_MEANS} />);
    expect(screen.getByText('Routine scout for pests')).toBeInTheDocument();
    expect(screen.getByText('Irrigate soon')).toBeInTheDocument();
  });

  it('calls onPrevious / onNext from the buttons, honouring the has-flags', async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const cell = makeCell(1, { metrics: { ndvi: 0.5 } });
    render(
      <CellDetailPanel
        cell={cell}
        farmMeans={FARM_MEANS}
        onPrevious={onPrevious}
        onNext={onNext}
        hasPrevious={false}
        hasNext={true}
      />,
    );
    expect(screen.getByRole('button', { name: /previous/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('moves to the next/previous cell on "]" and "[" keys', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const cell = makeCell(1, { metrics: { ndvi: 0.5 } });
    render(
      <CellDetailPanel
        cell={cell}
        farmMeans={FARM_MEANS}
        onPrevious={onPrevious}
        onNext={onNext}
        hasPrevious
        hasNext
      />,
    );
    fireEvent.keyDown(window, { key: ']' });
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: '[' });
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });
});
