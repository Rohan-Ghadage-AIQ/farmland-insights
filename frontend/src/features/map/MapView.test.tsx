import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OSM_TILE_URL } from './basemap';
import { FakeMap } from './maplibre-fake';
import { useMapActions } from './map-context';
import { MapView } from './MapView';

vi.mock('maplibre-gl', async () => (await import('./maplibre-fake')).maplibreFakeModule);

const SATELLITE = { satelliteUrl: 'https://tiles.example.com/sat/{z}/{x}/{y}.jpg' } as const;

function latestMap(): FakeMap {
  const map = FakeMap.instances[FakeMap.instances.length - 1];
  if (map === undefined) throw new Error('no map was created');
  return map;
}

function ActionsProbe() {
  const actions = useMapActions();
  return (
    <button
      onClick={() => {
        actions.resize();
      }}
    >
      probe resize
    </button>
  );
}

describe('MapView', () => {
  beforeEach(() => {
    FakeMap.reset();
  });
  afterEach(() => {
    FakeMap.reset();
    vi.unstubAllGlobals();
  });

  it('renders a labelled map region and creates one map on the OSM raster basemap', () => {
    render(<MapView theme="light" basemapConfig={{}} />);
    expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(1);
    const style = latestMap().options.style as { sources: Record<string, { tiles: string[] }> };
    expect(style.sources.basemap?.tiles).toEqual([OSM_TILE_URL]);
  });

  it('gives children the typed actions through context once the map exists', async () => {
    render(
      <MapView theme="light" basemapConfig={{}}>
        <ActionsProbe />
      </MapView>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'probe resize' }));
    expect(latestMap().resize).toHaveBeenCalled();
  });

  it('removes the map on unmount', () => {
    const { unmount } = render(<MapView theme="light" basemapConfig={{}} />);
    const map = latestMap();
    unmount();
    expect(map.removed).toBe(true);
  });

  it('survives StrictMode double mounting and leaves exactly one live map', () => {
    render(
      <StrictMode>
        <MapView theme="light" basemapConfig={{}} />
      </StrictMode>,
    );
    expect(FakeMap.instances.filter((m) => !m.removed)).toHaveLength(1);
  });

  it('always offers Streets, Satellite and Hybrid, even with nothing configured', () => {
    render(<MapView theme="light" basemapConfig={{}} />);
    expect(screen.getByRole('group', { name: 'Basemap' })).toBeInTheDocument();
    for (const name of ['Streets', 'Satellite', 'Hybrid']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  describe('go to coordinates', () => {
    const coordinates = () => screen.getByRole('textbox', { name: /coordinates/i });

    it('flies to the typed position at street level and drops a pin there', async () => {
      render(<MapView theme="light" basemapConfig={{}} />);
      await userEvent.type(coordinates(), '23.6, 72.4');
      await userEvent.click(screen.getByRole('button', { name: 'Go' }));

      expect(latestMap().flyTo).toHaveBeenCalledWith({ center: [72.4, 23.6], zoom: 16 });
      expect(screen.getByRole('status')).toHaveTextContent('23.6000, 72.4000');
    });

    it('moves the pin when another position is entered, and removes it on request', async () => {
      render(<MapView theme="light" basemapConfig={{}} />);
      await userEvent.type(coordinates(), '23.6, 72.4{Enter}');
      await userEvent.clear(coordinates());
      await userEvent.type(coordinates(), '12.5 S, 45 W{Enter}');
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent('-12.5000, -45.0000');

      await userEvent.click(screen.getByRole('button', { name: 'Remove pin' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps the pin on its spot when the map moves', async () => {
      render(<MapView theme="light" basemapConfig={{}} />);
      await userEvent.type(coordinates(), '23.6, 72.4{Enter}');
      const map = latestMap();
      map.project.mockReturnValue({ x: 500, y: 300 });
      act(() => {
        map.emit('move');
      });
      const pin = screen.getByRole('status').parentElement;
      expect(pin).toHaveStyle({ left: '500px', top: '300px' });
    });

    it('does not move the map for text it cannot read', async () => {
      render(<MapView theme="light" basemapConfig={{}} />);
      await userEvent.type(coordinates(), 'nowhere{Enter}');
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(latestMap().flyTo).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('hides and shows the grid, farm boundary and basemap layers from the layer panel', async () => {
    render(<MapView theme="light" basemapConfig={{}} />);
    const map = latestMap();
    for (const id of ['basemap', 'grid-fill', 'farm-outline', 'td-polygon']) map.addLayer({ id });
    map.setLayoutProperty.mockClear();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Grid cells' }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-fill', 'visibility', 'none');
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith('basemap', 'visibility', 'none');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Farm boundary' }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('farm-outline', 'visibility', 'none');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('td-polygon', 'visibility', 'none');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Basemap (satellite or streets)' }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('basemap', 'visibility', 'none');
  });

  it('re-applies the layer switches after a basemap change replaces the style', async () => {
    render(<MapView theme="light" basemapConfig={{}} />);
    const map = latestMap();
    map.addLayer({ id: 'grid-fill' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Grid cells' }));
    map.setLayoutProperty.mockClear();

    // The new style brings the grid layer back visible; MapLibre then announces it.
    map.emit('styledata');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-fill', 'visibility', 'none');
  });

  it('turns the basemap back on when a basemap is chosen', async () => {
    render(<MapView theme="light" basemapConfig={{}} />);
    const map = latestMap();
    map.addLayer({ id: 'basemap' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Basemap (satellite or streets)' }));
    expect(
      screen.getByRole('checkbox', { name: 'Basemap (satellite or streets)' }),
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(screen.getByRole('checkbox', { name: 'Basemap (satellite or streets)' })).toBeChecked();
  });

  it('switches to Hybrid on the free Esri imagery with a labels layer on top', async () => {
    render(<MapView theme="light" basemapConfig={{}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hybrid' }));
    expect(screen.getByRole('button', { name: 'Hybrid' })).toHaveAttribute('aria-pressed', 'true');
    const [style] = latestMap().setStyle.mock.calls[0] as [
      { sources: Record<string, { tiles: string[] }>; layers: { id: string }[] },
      unknown,
    ];
    expect(style.sources.basemap?.tiles[0]).toContain('World_Imagery');
    expect(style.sources['basemap-labels']?.tiles[0]).toContain('World_Boundaries_and_Places');
    expect(style.layers.map((layer) => layer.id)).toEqual(['basemap', 'basemap-labels']);
  });

  it('switches to the configured satellite URL when one is set', async () => {
    render(<MapView theme="light" basemapConfig={SATELLITE} />);
    const group = screen.getByRole('group', { name: 'Basemap' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Streets' })).toHaveAttribute('aria-pressed', 'true');
    expect(latestMap().setStyle).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(screen.getByRole('button', { name: 'Satellite' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Streets' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(latestMap().setStyle).toHaveBeenCalledTimes(1);
    const [style, options] = latestMap().setStyle.mock.calls[0] as [
      { sources: Record<string, { tiles: string[] }> },
      unknown,
    ];
    expect(style.sources.basemap?.tiles).toEqual([SATELLITE.satelliteUrl]);
    expect(options).toEqual({ diff: false });
  });

  it('switches the basemap with the theme without recreating the map', () => {
    const { rerender } = render(<MapView theme="light" basemapConfig={{}} />);
    const map = latestMap();
    rerender(<MapView theme="dark" basemapConfig={{}} />);
    expect(FakeMap.instances).toHaveLength(1);
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    const [style] = map.setStyle.mock.calls[0] as [{ layers: { paint: Record<string, number> }[] }];
    expect(style.layers[0]?.paint['raster-brightness-max']).toBe(0.25);
  });

  it('does not reload the style when nothing about it changed', () => {
    const { rerender } = render(<MapView theme="light" basemapConfig={{}} />);
    rerender(<MapView theme="light" basemapConfig={{}} />);
    expect(latestMap().setStyle).not.toHaveBeenCalled();
  });

  it('fits the map to the field when bounds are provided, and again when they change', () => {
    const { rerender } = render(
      <MapView theme="light" basemapConfig={{}} fieldBounds={[10, 20, 11, 21]} />,
    );
    expect(latestMap().fitBounds).toHaveBeenCalledTimes(1);
    expect(latestMap().fitBounds.mock.calls[0]?.[0]).toEqual([
      [10, 20],
      [11, 21],
    ]);
    rerender(<MapView theme="light" basemapConfig={{}} fieldBounds={[10, 20, 11, 21]} />);
    expect(latestMap().fitBounds).toHaveBeenCalledTimes(1);
    rerender(<MapView theme="light" basemapConfig={{}} fieldBounds={[30, 20, 31, 21]} />);
    expect(latestMap().fitBounds).toHaveBeenCalledTimes(2);
  });

  it('has a Fit to field button that is disabled without bounds and refits when pressed', async () => {
    const { rerender } = render(<MapView theme="light" basemapConfig={{}} />);
    expect(screen.getByRole('button', { name: 'Fit to field' })).toBeDisabled();
    rerender(<MapView theme="light" basemapConfig={{}} fieldBounds={[1, 2, 3, 4]} />);
    const button = screen.getByRole('button', { name: 'Fit to field' });
    expect(button).toBeEnabled();
    latestMap().fitBounds.mockClear();
    await userEvent.click(button);
    expect(latestMap().fitBounds).toHaveBeenCalledTimes(1);
  });

  it('skips fit animation when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    render(<MapView theme="light" basemapConfig={{}} fieldBounds={[1, 2, 3, 4]} />);
    expect(latestMap().fitBounds.mock.calls[0]?.[1]).toMatchObject({ duration: 0 });
  });

  it('resizes the map when its container changes size', () => {
    let notify: () => void = () => undefined;
    class FakeResizeObserver {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe() {
        /* the fake only needs to capture the callback */
      }
      disconnect() {
        /* nothing to release */
      }
      unobserve() {
        /* nothing to release */
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    render(<MapView theme="light" basemapConfig={{}} />);
    notify();
    expect(latestMap().resize).toHaveBeenCalled();
  });
});

describe('useMapActions outside a map', () => {
  it('throws a clear error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ActionsProbe />)).toThrow(/inside <MapView>/);
    spy.mockRestore();
  });
});
