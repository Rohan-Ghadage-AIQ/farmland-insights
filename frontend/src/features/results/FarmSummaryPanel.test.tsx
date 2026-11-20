import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FarmSummaryPanel } from './FarmSummaryPanel';
import { makeCell } from './test-support';

describe('FarmSummaryPanel', () => {
  it('shows an empty state when there are no cells', () => {
    render(<FarmSummaryPanel cells={[]} />);
    expect(screen.getByText(/no cells/i)).toBeInTheDocument();
  });

  it('shows five CPI cluster bars with the farm mean and min-max whisker', () => {
    const cells = [
      makeCell(1, { metrics: { ndvi: 0.6 }, cpi: { Structural: 0.8 } }),
      makeCell(2, { metrics: { ndvi: 0.5 }, cpi: { Structural: 0.4 } }),
    ];
    render(<FarmSummaryPanel cells={cells} />);
    const list = screen.getByRole('list', { name: 'CPI cluster scores' });
    expect(list).toBeInTheDocument();
    // Mean of 0.8 and 0.4 is 0.6.
    expect(
      screen.getByRole('listitem', { name: /Canopy structure: 0.60.*0.40 to 0.80/ }),
    ).toBeInTheDocument();
  });

  it('shows a cluster as "No data" when no cell has any of its metrics (ADR-003)', () => {
    const cells = [makeCell(1, { metrics: { ndvi: 0.6 } })]; // no Chlorophyll metrics at all
    render(<FarmSummaryPanel cells={cells} />);
    expect(screen.getByRole('listitem', { name: /Chlorophyll: No data/ })).toBeInTheDocument();
  });

  it('counts cells needing attention and labels the threshold as an app heuristic', () => {
    const cells = [
      makeCell(1, { metrics: { ndvi: 0.1 }, cpi: { Structural: 0.2 } }), // below 0.4: needs attention
      makeCell(2, { metrics: { ndvi: 0.9 }, cpi: { Structural: 0.9 } }),
    ];
    render(<FarmSummaryPanel cells={cells} />);
    expect(screen.getByText(/cells? needing attention/i)).toBeInTheDocument();
    expect(screen.getByText('1 of 2 cells')).toBeInTheDocument();
    expect(screen.getByText(/app heuristic/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.40/)).toBeInTheDocument();
  });

  it('lists top recommended actions, de-duplicated, with "applies to N of M cells"', () => {
    const cells = [
      makeCell(1, { metrics: { ndvi: 0.3 }, advisories: { ndvi: 'Routine scout for pests' } }),
      makeCell(2, { metrics: { ndvi: 0.3 }, advisories: { ndvi: 'Routine scout for pests' } }),
      makeCell(3, { metrics: { ndvi: 0.3 } }),
    ];
    render(<FarmSummaryPanel cells={cells} />);
    expect(screen.getByText('Routine scout for pests')).toBeInTheDocument();
    expect(screen.getByText('Applies to 2 of 3 cells')).toBeInTheDocument();
  });

  it('clicking a recommended action calls onHighlight with its cell ids', async () => {
    const user = userEvent.setup();
    const onHighlight = vi.fn();
    const cells = [
      makeCell(5, { metrics: { ndvi: 0.3 }, advisories: { ndvi: 'Routine scout for pests' } }),
    ];
    render(<FarmSummaryPanel cells={cells} onHighlight={onHighlight} />);
    await user.click(screen.getByRole('button', { name: /Routine scout for pests/ }));
    expect(onHighlight).toHaveBeenCalledWith(['5']);
  });

  it('keeps advisories for metrics with no raw value out of the top list (ADR-004)', () => {
    const cells = [makeCell(1, { advisories: { ndvi: 'Critical: missing data' } })]; // no raw_metrics
    render(<FarmSummaryPanel cells={cells} />);
    expect(
      screen.queryByText('Critical: missing data', {
        selector: 'ul[aria-label="Top recommended actions"] *',
      }),
    ).toBeNull();
    expect(screen.getByRole('group', { name: /no data/i })).toBeInTheDocument();
  });

  it('shows a "Satellite data unavailable" banner when no cell has any satellite metric', () => {
    const cells = [makeCell(1, { metrics: { t2m: 25 } })]; // farm-level only
    render(<FarmSummaryPanel cells={cells} />);
    expect(screen.getByText(/satellite data unavailable/i)).toBeInTheDocument();
  });

  it('does not show the satellite banner when a cell has a satellite metric', () => {
    const cells = [makeCell(1, { metrics: { ndvi: 0.5 } })];
    render(<FarmSummaryPanel cells={cells} />);
    expect(screen.queryByText(/satellite data unavailable/i)).toBeNull();
  });
});
