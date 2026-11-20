import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DrawControlLazy, MapViewLazy } from './lazy';

vi.mock('maplibre-gl', async () => (await import('./maplibre-fake')).maplibreFakeModule);
// Only the import boundary is under test, so every Terra Draw export is an inert stand-in.
vi.mock('terra-draw', () => {
  class Stub {
    readonly stub = true;
  }
  return {
    TerraDraw: Stub,
    TerraDrawPolygonMode: Stub,
    TerraDrawSelectMode: Stub,
    TerraDrawSessionUndoRedo: Stub,
    TerraDrawModeUndoRedo: Stub,
    TerraDrawUndoRedoKeyboardShortcuts: Stub,
    ValidateNotSelfIntersecting: () => ({ valid: true }),
  };
});
vi.mock('terra-draw-maplibre-gl-adapter', () => {
  class Stub {
    readonly stub = true;
  }
  return { TerraDrawMapLibreGLAdapter: Stub };
});

describe('code-split entry points', () => {
  it('MapViewLazy shows the fallback, then the map', async () => {
    render(
      <Suspense fallback={<p>Loading map</p>}>
        <MapViewLazy theme="light" basemapConfig={{}} />
      </Suspense>,
    );
    expect(screen.getByText('Loading map')).toBeInTheDocument();
    // Generous timeout: the first dynamic import transforms MapView cold, slow on a busy machine.
    expect(
      await screen.findByRole('region', { name: 'Map' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });

  it('DrawControlLazy resolves to the drawing toolbar inside a map', async () => {
    render(
      <Suspense fallback={<p>Loading map</p>}>
        <MapViewLazy theme="light" basemapConfig={{}}>
          <Suspense fallback={null}>
            <DrawControlLazy />
          </Suspense>
        </MapViewLazy>
      </Suspense>,
    );
    expect(
      await screen.findByRole('toolbar', { name: 'Drawing tools' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });
});
