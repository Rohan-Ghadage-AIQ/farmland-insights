import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FarmAnalysisResponse } from '@/domain';
import { ResultsPanel } from './ResultsPanel';
import { makeCellGrid } from './test-support';

function responseFor(cells: ReturnType<typeof makeCellGrid>): FarmAnalysisResponse {
  return { type: 'FeatureCollection', features: cells };
}

describe('ResultsPanel', () => {
  it('shows an idle empty state before any analysis has run', () => {
    render(<ResultsPanel status="idle" />);
    expect(screen.getByText(/run an analysis/i)).toBeInTheDocument();
  });

  it('shows a loading state with an aria-live announcement', () => {
    render(<ResultsPanel status="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows an error state with a retry button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ResultsPanel
        status="error"
        error={{ title: 'Analysis failed', message: 'Something went wrong.' }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the farm summary by default on success, with no cell selected', () => {
    const cells = makeCellGrid(2, 2);
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} />);
    expect(screen.getByText('CPI by cluster')).toBeInTheDocument();
    expect(screen.getByText('Top recommended actions')).toBeInTheDocument();
  });

  it('shows a "stale" badge when the inputs changed since this result', () => {
    const cells = makeCellGrid(1, 1);
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} stale />);
    expect(screen.getByText(/inputs changed.*re-run to update/i)).toBeInTheDocument();
  });

  it('announces the "stale" badge in a polite live region, so it is never a silent change', () => {
    const cells = makeCellGrid(1, 1);
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} stale />);
    const staleText = screen.getByText(/inputs changed.*re-run to update/i);
    const liveRegion = staleText.closest('[role="status"]');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('switches to cell detail when a cell is selected, and back to the summary on close', async () => {
    const user = userEvent.setup();
    const cells = makeCellGrid(1, 2); // ids 1, 2
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} />);

    await user.click(screen.getByRole('button', { name: 'View as table' }));
    await user.click(screen.getByRole('row', { name: /^1 / }));

    expect(screen.getByText('Cell 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to farm summary/i }));
    expect(screen.getByText('CPI by cluster')).toBeInTheDocument();
  });

  it('toggles between the inspector and the table view', async () => {
    const user = userEvent.setup();
    const cells = makeCellGrid(1, 2);
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} />);
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('table', { name: /cells/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View as inspector' }));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('moves the selection with the arrow keys', () => {
    const cells = makeCellGrid(2, 2); // ids 1..4
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} />);
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    fireEvent.click(screen.getByRole('row', { name: /^1 / }));
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Cell 2')).toBeInTheDocument();
  });

  it('includes export controls once there are results', () => {
    const cells = makeCellGrid(1, 1);
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} />);
    expect(screen.getByRole('button', { name: /export geojson/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('clicking a recommended action highlights the matching rows in the table view', async () => {
    const user = userEvent.setup();
    const cells = makeCellGrid(1, 2, (_row, col, id) => ({
      metrics: { ndvi: 0.3 },
      advisories: col === 0 ? { ndvi: 'Routine scout for pests' } : {},
      cpi: { Structural: id === 1 ? 0.1 : 0.9 },
    }));
    render(<ResultsPanel status="success" cells={cells} response={responseFor(cells)} />);
    await user.click(screen.getByRole('button', { name: /routine scout for pests/i }));
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('row', { name: /^1 / })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('row', { name: /^2 / })).toHaveAttribute('data-highlighted', 'false');
  });
});
