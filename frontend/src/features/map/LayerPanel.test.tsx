import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LayerPanel, type LayerPanelProps } from './LayerPanel';
import { DEFAULT_LAYER_STATE } from './layer-visibility';

function setup(overrides: Partial<LayerPanelProps> = {}) {
  const onChange = vi.fn();
  const onBasemapChange = vi.fn();
  render(
    <LayerPanel
      state={DEFAULT_LAYER_STATE}
      onChange={onChange}
      basemaps={['streets', 'satellite', 'hybrid']}
      basemapKind="streets"
      onBasemapChange={onBasemapChange}
      {...overrides}
    />,
  );
  return { onChange, onBasemapChange };
}

describe('LayerPanel', () => {
  it('lists the basemap, grid and farm boundary switches, all on by default', () => {
    setup();
    expect(screen.getByRole('region', { name: 'Map layers' })).toBeInTheDocument();
    for (const name of ['Basemap (satellite or streets)', 'Grid cells', 'Farm boundary']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
  });

  it.each([
    ['Basemap (satellite or streets)', 'basemap'],
    ['Grid cells', 'grid'],
    ['Farm boundary', 'boundary'],
  ] as const)('switching %s off reports only that change', async (name, key) => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('checkbox', { name }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_LAYER_STATE, [key]: false });
  });

  it('shows the current basemap and reports a different choice', async () => {
    const { onBasemapChange } = setup({ basemapKind: 'hybrid' });
    expect(screen.getByRole('button', { name: 'Hybrid' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(onBasemapChange).toHaveBeenCalledWith('satellite');
  });

  it('fades the grid with the opacity slider and shows the percentage', () => {
    const { onChange } = setup({ state: { ...DEFAULT_LAYER_STATE, gridOpacity: 0.6 } });
    const slider = screen.getByRole('slider', { name: 'Grid opacity' });
    expect(slider).toHaveValue('60');
    expect(screen.getByText('60%')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '35' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_LAYER_STATE, gridOpacity: 0.35 });
  });

  it('disables the opacity slider while the grid is switched off', () => {
    setup({ state: { ...DEFAULT_LAYER_STATE, grid: false } });
    expect(screen.getByRole('slider', { name: 'Grid opacity' })).toBeDisabled();
  });

  it('collapses to a header and expands again', async () => {
    setup();
    const header = screen.getByRole('button', { name: /layers/i });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Grid cells' })).not.toBeInTheDocument();
    await userEvent.click(header);
    expect(screen.getByRole('checkbox', { name: 'Grid cells' })).toBeInTheDocument();
  });
});
