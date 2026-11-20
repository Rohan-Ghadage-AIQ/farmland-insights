import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClusterBarChart, type ClusterBarDatum } from './ClusterBarChart';
import { nth } from './test-support';

const DATA: ClusterBarDatum[] = [
  { cluster: 'Structural', label: 'Canopy structure', value: 0.62, min: 0.41, max: 0.81 },
  { cluster: 'Chlorophyll', label: 'Chlorophyll', value: null, min: null, max: null },
  { cluster: 'Water_Drought', label: 'Water & drought', value: 0.55, min: 0.3, max: 0.7 },
  { cluster: 'Environmental', label: 'Environment', value: 0.7, min: 0.6, max: 0.9 },
  { cluster: 'Agro_Meteo', label: 'Agro-meteorology', value: 0.4, min: 0.2, max: 0.6 },
];

describe('ClusterBarChart', () => {
  it('lists one row per cluster, in the order given', () => {
    render(<ClusterBarChart data={DATA} />);
    const list = screen.getByRole('list', { name: 'CPI cluster scores' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(nth(items, 0)).getByText('Canopy structure')).toBeInTheDocument();
    expect(within(nth(items, 4)).getByText('Agro-meteorology')).toBeInTheDocument();
  });

  it('shows the mean and the min-max range for a cluster with data', () => {
    render(<ClusterBarChart data={DATA} />);
    const row = screen.getByRole('listitem', { name: /Canopy structure/ });
    expect(within(row).getByText('0.62')).toBeInTheDocument();
    expect(row).toHaveAccessibleName(expect.stringContaining('0.41'));
    expect(row).toHaveAccessibleName(expect.stringContaining('0.81'));
  });

  it('shows "No data" instead of a bar when the cluster has no data (ADR-003)', () => {
    render(<ClusterBarChart data={DATA} />);
    const row = screen.getByRole('listitem', { name: /Chlorophyll/ });
    expect(within(row).getByText('No data')).toBeInTheDocument();
    expect(within(row).queryByTestId('cluster-bar-fill')).toBeNull();
  });

  it('positions the bar fill and whiskers proportionally to the 0..1 domain', () => {
    render(<ClusterBarChart data={[nth(DATA, 0)]} />);
    const row = screen.getByRole('listitem', { name: /Canopy structure/ });
    expect(within(row).getByTestId('cluster-bar-fill')).toHaveStyle({ width: '62%' });
    expect(within(row).getByTestId('cluster-whisker-min')).toHaveStyle({ left: '41%' });
    expect(within(row).getByTestId('cluster-whisker-max')).toHaveStyle({ left: '81%' });
  });

  it('renders a reference tick (e.g. the farm mean) when given, with a label', () => {
    render(
      <ClusterBarChart
        data={[
          { cluster: 'Structural', label: 'Canopy structure', value: 0.3, referenceValue: 0.6 },
        ]}
        referenceLabel="Farm mean"
      />,
    );
    const row = screen.getByRole('listitem', { name: /Canopy structure/ });
    const tick = within(row).getByTestId('cluster-reference-tick');
    expect(tick).toHaveStyle({ left: '60%' });
    expect(row).toHaveAccessibleName(expect.stringContaining('Farm mean 0.60'));
  });

  it('omits the reference tick when referenceValue is null or not given', () => {
    render(<ClusterBarChart data={DATA} />);
    const row = screen.getByRole('listitem', { name: /Canopy structure/ });
    expect(within(row).queryByTestId('cluster-reference-tick')).toBeNull();
  });
});
