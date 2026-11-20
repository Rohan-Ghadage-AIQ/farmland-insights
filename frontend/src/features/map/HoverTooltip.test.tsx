import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoverTooltip, tooltipPlacement } from './HoverTooltip';

describe('tooltipPlacement', () => {
  const container = { width: 1000, height: 600 };

  it('puts the tooltip below and to the right of the pointer by default', () => {
    expect(tooltipPlacement({ x: 100, y: 100 }, container)).toEqual({
      left: 112,
      top: 112,
      transform: 'none',
    });
  });

  it('flips to the left of the pointer near the right edge', () => {
    expect(tooltipPlacement({ x: 900, y: 100 }, container)).toEqual({
      left: 888,
      top: 112,
      transform: 'translateX(-100%)',
    });
  });

  it('flips above the pointer near the bottom edge', () => {
    expect(tooltipPlacement({ x: 100, y: 550 }, container)).toEqual({
      left: 112,
      top: 538,
      transform: 'translateY(-100%)',
    });
  });

  it('flips both ways in the bottom-right corner', () => {
    expect(tooltipPlacement({ x: 950, y: 580 }, container)).toEqual({
      left: 938,
      top: 568,
      transform: 'translate(-100%, -100%)',
    });
  });

  it('does not flip when the container size is unknown', () => {
    expect(tooltipPlacement({ x: 900, y: 550 }, null).transform).toBe('none');
  });
});

describe('HoverTooltip', () => {
  const props = {
    point: { x: 40, y: 60 },
    container: { width: 800, height: 600 },
    title: 'Cell 12',
    rows: [
      { label: 'Water & drought CPI', value: '0.42' },
      { label: 'NDVI', value: '0.71', unit: 'index' },
    ],
  } as const;

  it('shows the cell title and each row with its unit', () => {
    render(<HoverTooltip {...props} />);
    expect(screen.getByText('Cell 12')).toBeInTheDocument();
    expect(screen.getByText('Water & drought CPI')).toBeInTheDocument();
    expect(screen.getByText('0.42')).toBeInTheDocument();
    expect(screen.getByText('index')).toBeInTheDocument();
  });

  it('is a tooltip that never intercepts the pointer', () => {
    render(<HoverTooltip {...props} />);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('pointer-events-none');
  });

  it('is positioned from the pointer', () => {
    render(<HoverTooltip {...props} />);
    expect(screen.getByRole('tooltip')).toHaveStyle({ left: '52px', top: '72px' });
  });

  it('says so plainly when the cell has no data for the layer, instead of showing a value', () => {
    render(<HoverTooltip {...props} rows={[{ label: 'NDVI', value: null }]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByText('0.71')).not.toBeInTheDocument();
  });
});
