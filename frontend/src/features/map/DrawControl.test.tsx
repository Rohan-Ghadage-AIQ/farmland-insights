import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawControl, type DrawControlProps } from './DrawControl';
import type * as DrawModule from './draw';
import { polygon, ring, type FakeDraw } from './draw-fake';
import { FakeMap } from './maplibre-fake';
import { MapView } from './MapView';
import type { FarmFeatureCollection } from './types';

vi.mock('maplibre-gl', async () => (await import('./maplibre-fake')).maplibreFakeModule);

// Terra Draw needs WebGL. The controller logic is real; only the Terra Draw instance is faked.
const created: FakeDraw[] = [];
vi.mock('./draw', async (importOriginal) => {
  const actual = await importOriginal<typeof DrawModule>();
  const fake = await import('./draw-fake');
  return {
    ...actual,
    createTerraDraw: vi.fn(() => {
      const next = fake.createFakeDraw();
      created.push(next);
      return next.draw;
    }),
  };
});

const farmOf = (x: number): FarmFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(x)] }, properties: {} },
  ],
});

function latestMap(): FakeMap {
  const map = FakeMap.instances[FakeMap.instances.length - 1];
  if (map === undefined) throw new Error('no map was created');
  return map;
}

function latestDraw(): FakeDraw {
  const draw = created[created.length - 1];
  if (draw === undefined) throw new Error('Terra Draw was not created');
  return draw;
}

function mount(props: Partial<DrawControlProps> = {}, { styleReady = true } = {}) {
  const ui = (p: Partial<DrawControlProps>, theme: 'light' | 'dark') => (
    <MapView theme={theme} basemapConfig={{}}>
      <DrawControl {...p} />
    </MapView>
  );
  const view = render(ui(props, 'light'));
  if (styleReady)
    act(() => {
      latestMap().emit('style.load');
    });
  return {
    ...view,
    update: (next: Partial<DrawControlProps>, theme: 'light' | 'dark' = 'light') => {
      view.rerender(ui(next, theme));
    },
  };
}

describe('DrawControl', () => {
  beforeEach(() => {
    FakeMap.reset();
    created.length = 0;
  });

  it('creates and starts Terra Draw only once the map style is ready', () => {
    mount({}, { styleReady: false });
    expect(created).toHaveLength(0);
    act(() => {
      latestMap().emit('style.load');
    });
    expect(created).toHaveLength(1);
    expect(latestDraw().raw.start).toHaveBeenCalledTimes(1);
  });

  it('offers a labelled toolbar of drawing tools', () => {
    mount();
    const toolbar = screen.getByRole('toolbar', { name: 'Drawing tools' });
    expect(toolbar).toBeInTheDocument();
    for (const name of ['Draw field', 'Edit vertices', 'Undo', 'Redo', 'Clear']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('Draw field enters polygon mode and shows a pressed state', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Draw field' }));
    expect(latestDraw().raw.setMode).toHaveBeenLastCalledWith('polygon');
    expect(screen.getByRole('button', { name: 'Draw field' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports a finished polygon through onChange and moves to vertex editing', () => {
    const onChange = vi.fn();
    mount({ onChange });
    const draw = latestDraw();
    draw.store.push(polygon('a', 0));
    act(() => {
      draw.emit('finish', 'a', { mode: 'polygon', action: 'draw' });
    });
    expect(onChange).toHaveBeenCalledWith(farmOf(0));
    expect(draw.raw.selectFeature).toHaveBeenCalledWith('a');
    expect(screen.getByRole('button', { name: 'Edit vertices' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('disables Undo and Redo until there is history, then delegates to Terra Draw', async () => {
    mount();
    const draw = latestDraw();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    draw.setHistory(true, true);
    act(() => {
      draw.emit('history', { cause: 'push' });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(draw.raw.undo).toHaveBeenCalledTimes(1);
    expect(draw.raw.redo).toHaveBeenCalledTimes(1);
  });

  it('Edit vertices is disabled until a polygon exists', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Edit vertices' })).toBeDisabled();
  });

  it('loads an external value (upload, paste, sample) into the editor', () => {
    const onChange = vi.fn();
    mount({ value: farmOf(0), onChange });
    expect(latestDraw().raw.addFeatures).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces the drawing when the value changes, and leaves it alone when it is the same', () => {
    const { update } = mount({ value: farmOf(0) });
    const draw = latestDraw();
    update({ value: farmOf(0) });
    expect(draw.raw.addFeatures).toHaveBeenCalledTimes(1);
    update({ value: farmOf(5) });
    expect(draw.raw.addFeatures).toHaveBeenCalledTimes(2);
  });

  it('does not feed its own edits back into itself', () => {
    const onChange = vi.fn();
    const { update } = mount({ onChange });
    const draw = latestDraw();
    draw.store.push(polygon('a', 0));
    act(() => {
      draw.emit('finish', 'a', { mode: 'polygon', action: 'draw' });
    });
    update({ onChange, value: farmOf(0) });
    expect(draw.raw.addFeatures).not.toHaveBeenCalled();
  });

  it('Clear empties the drawing and reports null', async () => {
    const onChange = vi.fn();
    mount({ onChange });
    const draw = latestDraw();
    draw.store.push(polygon('a', 0));
    act(() => {
      draw.emit('finish', 'a', { mode: 'polygon', action: 'draw' });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('stops Terra Draw on unmount', () => {
    const { unmount } = mount();
    const draw = latestDraw();
    unmount();
    expect(draw.raw.stop).toHaveBeenCalledTimes(1);
  });

  it('rebuilds Terra Draw after a basemap style reload and keeps the drawn field', () => {
    const { update } = mount({ value: farmOf(0) });
    const first = latestDraw();
    // A theme change reloads the basemap style, which wipes Terra Draw's map layers.
    update({ value: farmOf(0) }, 'dark');
    act(() => {
      latestMap().emit('style.load');
    });
    expect(created).toHaveLength(2);
    expect(first.raw.stop).toHaveBeenCalledTimes(1);
    const second = latestDraw();
    expect(second.raw.start).toHaveBeenCalledTimes(1);
    expect(second.store).toHaveLength(1);
  });

  it('disables the tools when disabled', () => {
    mount({ disabled: true });
    expect(screen.getByRole('button', { name: 'Draw field' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  describe('keyboard shortcuts', () => {
    it('D starts drawing and Escape cancels it', async () => {
      mount();
      await userEvent.keyboard('d');
      expect(latestDraw().raw.setMode).toHaveBeenLastCalledWith('polygon');
      await userEvent.keyboard('{Escape}');
      expect(latestDraw().raw.setMode).toHaveBeenLastCalledWith('static');
    });

    it('ignores shortcuts while typing in a form field', async () => {
      mount();
      const input = document.createElement('input');
      document.body.append(input);
      input.focus();
      await userEvent.keyboard('d');
      expect(latestDraw().raw.setMode).not.toHaveBeenCalledWith('polygon');
      input.remove();
    });

    it('can be turned off', async () => {
      mount({ shortcuts: false });
      await userEvent.keyboard('d');
      expect(latestDraw().raw.setMode).not.toHaveBeenCalledWith('polygon');
    });
  });
});
