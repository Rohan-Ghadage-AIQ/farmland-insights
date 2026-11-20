import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import type * as MapFeature from '@/features/map';
import { makeCell } from '@/features/results/test-support';
import { CellPopup } from './CellPopup';
import { fakeMapActions } from './test-support';

let moveHandler: (() => void) | null = null;
let position = { x: 100, y: 50 };
const unsubscribe = vi.fn();
const actions = fakeMapActions({
  project: vi.fn(() => position),
  onMove: vi.fn((handler: () => void) => {
    moveHandler = handler;
    return unsubscribe;
  }),
});

vi.mock('@/features/map', async (importOriginal) => {
  const actual = await importOriginal<typeof MapFeature>();
  return { ...actual, useMapActions: () => actions };
});

const CELL = makeCell('7', {
  metrics: { ndvi: 0.31, gndvi: 0.82, t2m: 22.4 },
  cpi: { Structural: 0.3, Chlorophyll: 0.9, Environmental: 0.55 },
  advisories: { ndvi: 'Scout this cell for pests.' },
});

function mount(onClose = vi.fn()) {
  position = { x: 100, y: 50 };
  render(<CellPopup cell={CELL} lngLat={[72.4, 23.6]} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Details for cell 7' }) };
}

describe('CellPopup', () => {
  it('shows the cell, each area with its score and rating, and its parameter values', () => {
    const { dialog } = mount();
    expect(within(dialog).getByRole('heading', { name: 'Grid cell 7' })).toBeInTheDocument();

    const canopy = within(dialog).getByRole('region', { name: 'Canopy structure' });
    expect(within(canopy).getByText('0.30')).toBeInTheDocument();
    expect(within(canopy).getByText('Needs attention')).toBeInTheDocument();
    expect(within(canopy).getByText('NDVI')).toBeInTheDocument();
    expect(within(canopy).getByText('0.31')).toBeInTheDocument();

    const chlorophyll = within(dialog).getByRole('region', { name: 'Chlorophyll' });
    expect(within(chlorophyll).getByText('Good')).toBeInTheDocument();

    const environment = within(dialog).getByRole('region', { name: 'Environment' });
    expect(within(environment).getByText('Fair')).toBeInTheDocument();
  });

  it('marks an area with no data instead of inventing a score', () => {
    const { dialog } = mount();
    const water = within(dialog).getByRole('region', { name: 'Water & drought' });
    expect(within(water).getByText('No data')).toBeInTheDocument();
    expect(within(water).getByText('—')).toBeInTheDocument();
  });

  it('lists the advice that applies to the cell', () => {
    const { dialog } = mount();
    const advice = within(dialog).getByRole('region', { name: 'Advice' });
    expect(within(advice).getByText(/Scout this cell for pests\./)).toBeInTheDocument();
  });

  it('sits beside the click, kept inside the map edges', () => {
    const { dialog } = mount();
    expect(dialog.style.left).toMatch(/^clamp\(8px, 112px, (calc\()?100% - 296px\)?\)$/);
    expect(dialog.style.top).toMatch(/^clamp\(8px, 62px, (calc\()?100% - 344px\)?\)$/);
  });

  it('follows the cell when the map pans or zooms, and stops listening when it goes away', () => {
    const { dialog } = mount();
    position = { x: 300, y: 220 };
    act(() => {
      moveHandler?.();
    });
    expect(dialog.style.left).toMatch(/^clamp\(8px, 312px, /);
    expect(dialog.style.top).toMatch(/^clamp\(8px, 232px, /);
  });

  it('unsubscribes from map movement when it closes', () => {
    unsubscribe.mockClear();
    const { unmount } = render(<CellPopup cell={CELL} lngLat={[72.4, 23.6]} onClose={vi.fn()} />);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', async () => {
    const { onClose } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Close cell details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const { onClose } = mount();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
