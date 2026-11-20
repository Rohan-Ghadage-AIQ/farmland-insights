/**
 * Shared render helpers and fakes for the workspace composition layer's component tests
 * (WorkspaceContext, SetupSlot, MapSlot, InspectorSlot). Import this module only from
 * `*.test.ts(x)` files, never from app code.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { FarmFeatureCollection } from '@/domain';
import type { MapActions } from '@/features/map';
import { createThemeStorage, ThemeProvider } from '../theme';
import { createMemoryStorage } from '../test-utils';
import { WorkspaceProvider, type WorkspaceProviderProps } from './WorkspaceContext';

type ProviderOptions = Omit<WorkspaceProviderProps, 'children'>;

/** A fresh QueryClient per test: `useAnalysisFlow` needs a provider, with no retries. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

/** A small, valid field boundary, well under the grid-size warning thresholds. */
export function sampleFarm(): FarmFeatureCollection {
  const d = 0.001;
  const x = 77;
  const y = 28;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [x, y],
              [x + d, y],
              [x + d, y + d],
              [x, y + d],
              [x, y],
            ],
          ],
        },
        properties: {},
      },
    ],
  };
}

/** Every `MapActions` method as a `vi.fn()`, so tests can assert on calls without a real map. */
export function fakeMapActions(overrides: Partial<MapActions> = {}): MapActions {
  return {
    fitBounds: vi.fn(),
    setData: vi.fn(() => true),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    clearFeatureState: vi.fn(),
    setPaint: vi.fn(),
    resize: vi.fn(),
    flyTo: vi.fn(),
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat })),
    unproject: vi.fn(({ x, y }: { x: number; y: number }): [number, number] => [x, y]),
    onMove: vi.fn(() => () => undefined),
    exportPng: vi.fn(() => 'data:image/png;base64,fake'),
    capturePng: vi.fn(() => Promise.resolve('data:image/png;base64,fake')),
    installOverlay: vi.fn(() => false),
    onStyleReady: vi.fn(() => () => undefined),
    onLayerEvent: vi.fn(() => () => undefined),
    ...overrides,
  };
}

/** Renders `ui` inside a real `WorkspaceProvider`, with only the query client it needs. */
export function renderInWorkspace(
  ui: ReactNode,
  client: QueryClient = createTestQueryClient(),
  providerOptions: ProviderOptions = {},
): RenderResult {
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceProvider {...providerOptions}>{ui}</WorkspaceProvider>
    </QueryClientProvider>,
  );
}

/** As `renderInWorkspace`, plus an isolated `ThemeProvider` for slots (e.g. `MapSlot`) using it. */
export function renderInWorkspaceWithTheme(
  ui: ReactNode,
  client: QueryClient = createTestQueryClient(),
): RenderResult {
  const storage = createThemeStorage(() => createMemoryStorage());
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider storage={storage}>
        <WorkspaceProvider>{ui}</WorkspaceProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
