import { act, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import {
  createLocalSessionStore,
  createMemorySavedLocationStore,
  type SavedSession,
  type SessionStore,
} from '@/features/saved-locations';
import { makeLocation, makeRun, squareFarm } from '@/features/saved-locations/test-support';
import { makeCell } from '@/features/results/test-support';
import { useWorkspace, type WorkspaceApi } from './WorkspaceContext';
import { renderInWorkspace, createTestQueryClient } from './test-support';

let api: WorkspaceApi;

/** Captures the workspace API for the test to call, and shows a few values as text. */
function Probe() {
  const workspace = useWorkspace();
  useEffect(() => {
    api = workspace;
  });
  const { farm, flow, savedLocations, historyView, cells } = workspace;
  const crop = useWatch({ control: flow.form.control, name: 'crop' });
  const startDate = useWatch({ control: flow.form.control, name: 'startDate' });
  const gridSize = useWatch({ control: flow.form.control, name: 'gridSize' });
  return (
    <div>
      <span data-testid="farm">{farm === null ? 'no-farm' : 'has-farm'}</span>
      <span data-testid="crop">{crop}</span>
      <span data-testid="start">{startDate}</span>
      <span data-testid="grid">{String(gridSize)}</span>
      <span data-testid="saved">{savedLocations.map((item) => item.name).join('|')}</span>
      <span data-testid="view">{historyView === null ? 'live' : historyView.id}</span>
      <span data-testid="cells">{cells.length}</span>
    </div>
  );
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const SESSION: SavedSession = {
  farm: squareFarm(),
  inputs: { crop: 'Wheat', startDate: '2026-11-01', endDate: '2026-11-07', gridSize: 20 },
};

function mount(options: Parameters<typeof renderInWorkspace>[2] = {}) {
  return renderInWorkspace(<Probe />, createTestQueryClient(), options);
}

describe('last session', () => {
  it('starts with nothing by default', () => {
    mount();
    expect(screen.getByTestId('farm')).toHaveTextContent('no-farm');
    expect(screen.getByTestId('crop')).toBeEmptyDOMElement();
  });

  it('restores the field and the form settings from the last visit', () => {
    const sessionStore: SessionStore = { load: () => SESSION, save: vi.fn() };
    mount({ sessionStore });
    expect(screen.getByTestId('farm')).toHaveTextContent('has-farm');
    expect(screen.getByTestId('crop')).toHaveTextContent('Wheat');
    expect(screen.getByTestId('start')).toHaveTextContent('2026-11-01');
    expect(screen.getByTestId('grid')).toHaveTextContent('20');
  });

  it('remembers a new field as soon as it is drawn', () => {
    const save = vi.fn();
    mount({ sessionStore: { load: () => null, save } });
    act(() => {
      api.setFarm(squareFarm());
    });
    const last = save.mock.calls.at(-1)?.[0] as SavedSession;
    expect(last.farm).toEqual(squareFarm());
  });

  it('remembers form changes too', () => {
    const save = vi.fn();
    mount({ sessionStore: { load: () => null, save } });
    act(() => {
      api.flow.form.setValue('crop', 'Maize');
      api.flow.form.setValue('gridSize', 100);
    });
    const last = save.mock.calls.at(-1)?.[0] as SavedSession;
    expect(last.inputs).toMatchObject({ crop: 'Maize', gridSize: 100 });
  });

  it('comes back after a reload, through the real localStorage-backed store', () => {
    const storage = memoryStorage();
    const first = mount({ sessionStore: createLocalSessionStore(storage) });
    act(() => {
      api.setFarm(squareFarm());
      api.flow.form.setValue('crop', 'Rice');
    });
    first.unmount();

    mount({ sessionStore: createLocalSessionStore(storage) });
    expect(screen.getByTestId('farm')).toHaveTextContent('has-farm');
    expect(screen.getByTestId('crop')).toHaveTextContent('Rice');
  });

  it('starts clean when the remembered field is damaged', () => {
    const storage = memoryStorage({
      'farmland-insights-session-v1': JSON.stringify({
        farm: squareFarm(900, 900),
        inputs: SESSION.inputs,
      }),
    });
    mount({ sessionStore: createLocalSessionStore(storage) });
    expect(screen.getByTestId('farm')).toHaveTextContent('no-farm');
    expect(screen.getByTestId('crop')).toHaveTextContent('Wheat');
  });
});

describe('saved locations', () => {
  async function ready(store = createMemorySavedLocationStore()) {
    mount({ savedLocationStore: store });
    await waitFor(() => {
      expect(api.isSavedLocationsLoading).toBe(false);
    });
    return store;
  }

  it('saves the current field and settings under a name', async () => {
    const store = await ready();
    act(() => {
      api.setFarm(squareFarm());
      api.flow.form.setValue('crop', 'Wheat');
      api.flow.form.setValue('startDate', '2026-11-01');
      api.flow.form.setValue('endDate', '2026-11-07');
    });
    await act(async () => {
      await api.saveLocation('North field');
    });

    expect(screen.getByTestId('saved')).toHaveTextContent('North field');
    const [saved] = await store.list();
    expect(saved).toMatchObject({
      name: 'North field',
      farm: squareFarm(),
      inputs: { crop: 'Wheat', startDate: '2026-11-01', endDate: '2026-11-07', gridSize: 50 },
      run: null,
    });
  });

  it('does nothing when there is no field to save', async () => {
    const store = await ready();
    await act(async () => {
      await api.saveLocation('Nothing');
    });
    expect(await store.list()).toEqual([]);
  });

  it('opens a saved location: its field and settings come back, and the map is told the field changed', async () => {
    await ready(createMemorySavedLocationStore([makeLocation({ id: 'a', name: 'North field' })]));
    expect(screen.getByTestId('saved')).toHaveTextContent('North field');

    act(() => {
      api.openSavedLocation(makeLocation({ id: 'a', name: 'North field' }));
    });

    expect(screen.getByTestId('farm')).toHaveTextContent('has-farm');
    expect(api.farm).toEqual(squareFarm());
    expect(screen.getByTestId('crop')).toHaveTextContent('Wheat');
    expect(screen.getByTestId('start')).toHaveTextContent('2026-11-01');
    expect(screen.getByTestId('view')).toHaveTextContent('live');
  });

  it('opens a location that has results straight onto them, with no new analysis', async () => {
    const run = {
      ...makeRun(),
      response: {
        type: 'FeatureCollection' as const,
        features: [
          makeCell('1', { metrics: { ndvi: 0.4 } }),
          makeCell('2', { metrics: { ndvi: 0.6 } }),
        ],
      },
    };
    await ready();
    act(() => {
      api.openSavedLocation(makeLocation({ id: 'with-results', run }));
    });
    expect(screen.getByTestId('view')).toHaveTextContent('with-results');
    expect(screen.getByTestId('cells')).toHaveTextContent('2');
    expect(api.historyView?.request).toEqual(run.request);
  });

  it('leaves a previous saved result behind when a location without results is opened', async () => {
    const run = {
      ...makeRun(),
      response: { type: 'FeatureCollection' as const, features: [makeCell('1')] },
    };
    await ready();
    act(() => {
      api.openSavedLocation(makeLocation({ id: 'with-results', run }));
    });
    expect(screen.getByTestId('cells')).toHaveTextContent('1');
    act(() => {
      api.openSavedLocation(makeLocation({ id: 'plain', run: null }));
    });
    expect(screen.getByTestId('view')).toHaveTextContent('live');
    expect(screen.getByTestId('cells')).toHaveTextContent('0');
  });

  it('saves the results on screen with the location, so reopening it needs no re-run', async () => {
    const store = await ready();
    const run = {
      ...makeRun(),
      response: { type: 'FeatureCollection' as const, features: [makeCell('1')] },
    };
    act(() => {
      api.openSavedLocation(makeLocation({ id: 'seed', name: 'Seed', run }));
    });
    await act(async () => {
      await api.saveLocation('Copy of seed');
    });
    const copy = (await store.list()).find((item) => item.name === 'Copy of seed');
    expect(copy?.run?.response.features).toHaveLength(1);
  });

  it('deletes a saved location', async () => {
    const store = await ready(
      createMemorySavedLocationStore([
        makeLocation({ id: 'a', name: 'A' }),
        makeLocation({ id: 'b', name: 'B' }),
      ]),
    );
    await act(async () => {
      await api.deleteSavedLocation('a');
    });
    expect(screen.getByTestId('saved')).toHaveTextContent('B');
    expect(screen.getByTestId('saved')).not.toHaveTextContent('A|');
    expect((await store.list()).map((item) => item.id)).toEqual(['b']);
  });
});
