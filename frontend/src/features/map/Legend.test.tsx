import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Legend } from './Legend';
import type { LegendModel } from './legend-model';

const base: LegendModel = {
  title: 'Water & drought CPI',
  unit: null,
  gradient: 'linear-gradient(to right, #440154 0%, #fde725 100%)',
  min: '0.00',
  max: '1.00',
  midpoint: null,
  clippedNote: null,
  flatNote: null,
  noData: null,
};

describe('Legend', () => {
  it('is a labelled group with the title and min and max labels', () => {
    render(<Legend model={base} />);
    const group = screen.getByRole('group', { name: 'Legend: Water & drought CPI' });
    expect(within(group).getByText('Water & drought CPI')).toBeInTheDocument();
    expect(within(group).getByText('0.00')).toBeInTheDocument();
    expect(within(group).getByText('1.00')).toBeInTheDocument();
  });

  it('shows the unit next to the title when there is one', () => {
    render(<Legend model={{ ...base, title: 'Air temperature', unit: '°C' }} />);
    expect(screen.getByText('°C')).toBeInTheDocument();
  });

  it('paints the continuous colour bar from the model gradient and hides it from assistive tech', () => {
    const { container } = render(<Legend model={base} />);
    const bar = container.querySelector('[data-legend-bar]');
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar).toHaveStyle({ backgroundImage: base.gradient });
  });

  it('labels the midpoint of a diverging scale', () => {
    render(<Legend model={{ ...base, midpoint: '0.00', min: '-2.00', max: '2.00' }} />);
    expect(screen.getByText('-2.00')).toBeInTheDocument();
    expect(screen.getByTestId('legend-midpoint')).toHaveTextContent('0.00');
  });

  it('shows no midpoint, clipping note or no-data row when there is nothing to say', () => {
    render(<Legend model={base} />);
    expect(screen.queryByTestId('legend-midpoint')).not.toBeInTheDocument();
    expect(screen.queryByText(/clipped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument();
  });

  it('shows the clipping note so a clipped scale is never silently misleading', () => {
    render(
      <Legend
        model={{
          ...base,
          clippedNote: 'Colours clipped to the 2nd to 98th percentile. Observed range 1 to 5,000.',
        }}
      />,
    );
    expect(screen.getByText(/clipped to the 2nd to 98th percentile/i)).toBeInTheDocument();
  });

  it('explains a flat scale', () => {
    render(
      <Legend
        model={{
          ...base,
          flatNote: 'Same for every cell. Weather is measured at the farm centre.',
        }}
      />,
    );
    expect(screen.getByText(/same for every cell/i)).toBeInTheDocument();
  });

  it('lists no-data cells with a hatch swatch in the legend, with the count', () => {
    render(
      <Legend model={{ ...base, noData: { label: 'No data', count: 12, color: '#595959' } }} />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('12 cells')).toBeInTheDocument();
    expect(screen.getByTestId('legend-no-data-swatch')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the singular for one cell', () => {
    render(
      <Legend model={{ ...base, noData: { label: 'No data', count: 1, color: '#595959' } }} />,
    );
    expect(screen.getByText('1 cell')).toBeInTheDocument();
  });
});
