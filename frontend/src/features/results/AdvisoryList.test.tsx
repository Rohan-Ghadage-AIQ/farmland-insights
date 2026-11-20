import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdvisoryItem } from '@/domain';
import { AdvisoryList } from './AdvisoryList';

function item(overrides: Partial<AdvisoryItem>): AdvisoryItem {
  return {
    metric: 'ndvi',
    cluster: 'Structural',
    text: 'Routine scout for pests',
    cellIds: ['1', '2'] as unknown as AdvisoryItem['cellIds'],
    cellCount: 2,
    totalCells: 5,
    ...overrides,
  };
}

describe('AdvisoryList', () => {
  it('shows each advisory with "applies to N of M cells"', () => {
    render(<AdvisoryList heading="Top recommended actions" items={[item({})]} />);
    expect(screen.getByText('Routine scout for pests')).toBeInTheDocument();
    expect(screen.getByText('Applies to 2 of 5 cells')).toBeInTheDocument();
  });

  it("calls onHighlight with the item's cell ids when clicked", async () => {
    const onHighlight = vi.fn();
    const user = userEvent.setup();
    render(
      <AdvisoryList
        heading="Top recommended actions"
        items={[item({ cellIds: ['7', '9'] as unknown as AdvisoryItem['cellIds'] })]}
        onHighlight={onHighlight}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Routine scout for pests/ }));
    expect(onHighlight).toHaveBeenCalledWith(['7', '9']);
  });

  it("marks a farm-level metric's advisory with a note (ADR-005)", () => {
    render(
      <AdvisoryList
        heading="Top recommended actions"
        items={[item({ metric: 't2m', cluster: 'Environmental', text: 'Irrigate soon' })]}
      />,
    );
    expect(screen.getByText(/same for every cell/i)).toBeInTheDocument();
  });

  it('does not show the farm-level note for a per-cell metric', () => {
    render(<AdvisoryList heading="Top recommended actions" items={[item({})]} />);
    expect(screen.queryByText(/same for every cell/i)).toBeNull();
  });

  it('renders no-data advisories only in a muted, separate group (ADR-004)', () => {
    render(
      <AdvisoryList
        heading="Top recommended actions"
        items={[item({ text: 'Has value' })]}
        noDataItems={[item({ text: 'Missing value critical text', metric: 'evi' })]}
      />,
    );
    const mainList = screen.getByRole('list', { name: 'Top recommended actions' });
    expect(within(mainList).queryByText('Missing value critical text')).toBeNull();

    const noDataGroup = screen.getByRole('group', { name: /no data/i });
    expect(within(noDataGroup).getByText('Missing value critical text')).toBeInTheDocument();
  });

  it('shows an empty state when there are no advisories at all', () => {
    render(<AdvisoryList heading="Top recommended actions" items={[]} />);
    expect(screen.getByText(/no recommended actions/i)).toBeInTheDocument();
  });
});
