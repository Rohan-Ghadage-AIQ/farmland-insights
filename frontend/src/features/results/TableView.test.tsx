import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableView } from './TableView';
import { makeCell, nth } from './test-support';

const CELLS = [
  makeCell(3, { cpi: { Structural: 0.9 }, metrics: { ndvi: 0.9 } }),
  makeCell(1, { cpi: { Structural: 0.2 }, metrics: { ndvi: 0.2 } }),
  makeCell(2, { metrics: {} }), // no Structural data -> "No data"
];

describe('TableView', () => {
  it('is an accessible table with a caption and one row per cell', () => {
    render(<TableView cells={CELLS} />);
    const table = screen.getByRole('table', { name: /cells/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3 cells
  });

  it('sorts by grid id ascending by default', () => {
    render(<TableView cells={CELLS} />);
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(nth(bodyRows, 0)).getByText('1')).toBeInTheDocument();
    expect(within(nth(bodyRows, 1)).getByText('2')).toBeInTheDocument();
    expect(within(nth(bodyRows, 2)).getByText('3')).toBeInTheDocument();
  });

  it('shows "No data" for a cluster with no data, never a 0 score', () => {
    render(<TableView cells={CELLS} />);
    const bodyRows = screen.getAllByRole('row').slice(1);
    // Cell 2 (second row) has an empty raw_metrics, so every cluster shows "No data".
    expect(within(nth(bodyRows, 1)).getAllByText('No data')).toHaveLength(5);
  });

  it('toggles sort direction when a column header is activated again', async () => {
    const user = userEvent.setup();
    render(<TableView cells={CELLS} />);
    const header = screen.getByRole('button', { name: /grid id/i });
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    await user.click(header);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending');
    let bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(nth(bodyRows, 0)).getByText('3')).toBeInTheDocument();

    await user.click(header);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(nth(bodyRows, 0)).getByText('1')).toBeInTheDocument();
  });

  it('sorts by a CPI column when its header is clicked', async () => {
    const user = userEvent.setup();
    render(<TableView cells={CELLS} />);
    await user.click(screen.getByRole('button', { name: /canopy structure/i }));
    const bodyRows = screen.getAllByRole('row').slice(1);
    // Ascending by Structural score: cell 1 (0.2), cell 3 (0.9), cell 2 (no data sorts last).
    expect(within(nth(bodyRows, 0)).getByText('1')).toBeInTheDocument();
    expect(within(nth(bodyRows, 1)).getByText('3')).toBeInTheDocument();
    expect(within(nth(bodyRows, 2)).getByText('2')).toBeInTheDocument();
  });

  it('calls onSelect when a row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TableView cells={CELLS} onSelect={onSelect} />);
    await user.click(screen.getByRole('row', { name: /^1 / }));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('marks the selected row with aria-selected', () => {
    render(<TableView cells={CELLS} selectedId="2" />);
    expect(screen.getByRole('row', { name: /^2 / })).toHaveAttribute('aria-selected', 'true');
  });

  it('uses a roving tabindex: only one row is a tab stop at a time', () => {
    render(<TableView cells={CELLS} />);
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0]).toHaveAttribute('tabIndex', '0');
    expect(bodyRows[1]).toHaveAttribute('tabIndex', '-1');
    expect(bodyRows[2]).toHaveAttribute('tabIndex', '-1');
  });

  it('moves focus to the next/previous row with ArrowDown/ArrowUp', async () => {
    const user = userEvent.setup();
    render(<TableView cells={CELLS} />);
    const bodyRows = screen.getAllByRole('row').slice(1);
    nth(bodyRows, 0).focus();

    await user.keyboard('{ArrowDown}');
    expect(nth(bodyRows, 1)).toHaveFocus();
    expect(nth(bodyRows, 1)).toHaveAttribute('tabIndex', '0');
    expect(nth(bodyRows, 0)).toHaveAttribute('tabIndex', '-1');

    await user.keyboard('{ArrowDown}');
    expect(nth(bodyRows, 2)).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(nth(bodyRows, 1)).toHaveFocus();
  });

  it('does not move focus past the first or last row', async () => {
    const user = userEvent.setup();
    render(<TableView cells={CELLS} />);
    const bodyRows = screen.getAllByRole('row').slice(1);
    nth(bodyRows, 0).focus();

    await user.keyboard('{ArrowUp}');
    expect(nth(bodyRows, 0)).toHaveFocus();

    nth(bodyRows, 2).focus();
    await user.keyboard('{ArrowDown}');
    expect(nth(bodyRows, 2)).toHaveFocus();
  });

  it('jumps to the first/last row with Home/End', async () => {
    const user = userEvent.setup();
    render(<TableView cells={CELLS} />);
    const bodyRows = screen.getAllByRole('row').slice(1);
    nth(bodyRows, 1).focus();

    await user.keyboard('{End}');
    expect(nth(bodyRows, 2)).toHaveFocus();

    await user.keyboard('{Home}');
    expect(nth(bodyRows, 0)).toHaveFocus();
  });

  it('does not let its row-navigation keys bubble to a window-level shortcut', async () => {
    const windowKeydown = vi.fn();
    window.addEventListener('keydown', windowKeydown);
    try {
      const user = userEvent.setup();
      render(<TableView cells={CELLS} />);
      const bodyRows = screen.getAllByRole('row').slice(1);
      nth(bodyRows, 0).focus();

      await user.keyboard('{ArrowDown}');

      expect(nth(bodyRows, 1)).toHaveFocus();
      expect(windowKeydown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydown);
    }
  });

  it('selects a focused row with the Enter key', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TableView cells={CELLS} onSelect={onSelect} />);
    const row = screen.getByRole('row', { name: /^3 / });
    row.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('3');
  });

  it('shows an empty state with no cells', () => {
    render(<TableView cells={[]} />);
    expect(screen.getByText(/no cells/i)).toBeInTheDocument();
  });

  it('marks highlighted rows (e.g. from a clicked advisory) with data-highlighted', () => {
    render(<TableView cells={CELLS} highlightIds={['1', '3']} />);
    expect(screen.getByRole('row', { name: /^1 / })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('row', { name: /^3 / })).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByRole('row', { name: /^2 / })).toHaveAttribute('data-highlighted', 'false');
  });
});
