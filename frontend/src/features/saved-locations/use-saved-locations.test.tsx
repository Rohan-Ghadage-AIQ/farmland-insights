import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemorySavedLocationStore } from './store';
import { makeLocation, makeRun, squareFarm } from './test-support';
import { MAX_NAME_LENGTH, MAX_SAVED_LOCATIONS } from './types';
import { useSavedLocations, type SaveDraft } from './use-saved-locations';

const draft = (overrides: Partial<SaveDraft> = {}): SaveDraft => ({
  name: 'North field',
  farm: squareFarm(),
  inputs: { crop: 'Wheat', startDate: '2026-11-01', endDate: '2026-11-07', gridSize: 50 },
  run: null,
  ...overrides,
});

async function setup(initial = [makeLocation({ id: 'old', name: 'Old', savedAt: 1 })]) {
  const store = createMemorySavedLocationStore(initial);
  const hook = renderHook(() => useSavedLocations(store));
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return { store, hook };
}

describe('useSavedLocations', () => {
  it('loads what is already saved, newest first', async () => {
    const { hook } = await setup([
      makeLocation({ id: 'a', name: 'A', savedAt: 100 }),
      makeLocation({ id: 'b', name: 'B', savedAt: 300 }),
      makeLocation({ id: 'c', name: 'C', savedAt: 200 }),
    ]);
    expect(hook.result.current.entries.map((item) => item.name)).toEqual(['B', 'C', 'A']);
  });

  it('starts out loading', () => {
    const { result } = renderHook(() => useSavedLocations(createMemorySavedLocationStore()));
    expect(result.current.isLoading).toBe(true);
  });

  it('saves a new location with its field, settings and results', async () => {
    const { hook, store } = await setup([]);

    let saved: Awaited<ReturnType<typeof hook.result.current.save>> = null;
    await act(async () => {
      saved = await hook.result.current.save(draft({ run: makeRun() }));
    });

    expect(saved).toMatchObject({ name: 'North field', inputs: { crop: 'Wheat' } });
    expect(hook.result.current.entries).toHaveLength(1);
    expect(hook.result.current.entries[0]?.run).toEqual(makeRun());
    expect(await store.list()).toHaveLength(1);
  });

  it('updates the location with the same name instead of adding a copy, ignoring case and spacing', async () => {
    const { hook, store } = await setup([]);
    await act(async () => {
      await hook.result.current.save(draft({ name: 'North field' }));
    });
    const firstId = hook.result.current.entries[0]?.id;

    await act(async () => {
      await hook.result.current.save(
        draft({
          name: '  north   FIELD ',
          inputs: { crop: 'Maize', startDate: '', endDate: '', gridSize: 20 },
        }),
      );
    });

    expect(hook.result.current.entries).toHaveLength(1);
    expect(hook.result.current.entries[0]?.id).toBe(firstId);
    expect(hook.result.current.entries[0]?.inputs.crop).toBe('Maize');
    expect(await store.list()).toHaveLength(1);
  });

  it('refuses an empty name', async () => {
    const { hook } = await setup([]);
    let saved: unknown = 'unset';
    await act(async () => {
      saved = await hook.result.current.save(draft({ name: '   ' }));
    });
    expect(saved).toBeNull();
    expect(hook.result.current.entries).toHaveLength(0);
  });

  it('keeps names to a sensible length', async () => {
    const { hook } = await setup([]);
    await act(async () => {
      await hook.result.current.save(draft({ name: 'x'.repeat(MAX_NAME_LENGTH + 40) }));
    });
    expect(hook.result.current.entries[0]?.name).toHaveLength(MAX_NAME_LENGTH);
  });

  it('puts a new save at the top', async () => {
    const { hook } = await setup([makeLocation({ id: 'old', name: 'Old', savedAt: 1 })]);
    await act(async () => {
      await hook.result.current.save(draft({ name: 'Fresh' }));
    });
    expect(hook.result.current.entries.map((item) => item.name)).toEqual(['Fresh', 'Old']);
  });

  it('removes a location from the list and from storage', async () => {
    const { hook, store } = await setup([
      makeLocation({ id: 'a', name: 'A' }),
      makeLocation({ id: 'b', name: 'B' }),
    ]);
    await act(async () => {
      await hook.result.current.remove('a');
    });
    expect(hook.result.current.entries.map((item) => item.id)).toEqual(['b']);
    expect((await store.list()).map((item) => item.id)).toEqual(['b']);
  });

  it(`keeps only the newest ${String(MAX_SAVED_LOCATIONS)}`, async () => {
    const initial = Array.from({ length: MAX_SAVED_LOCATIONS }, (_, i) =>
      makeLocation({ id: `loc-${String(i)}`, name: `Loc ${String(i)}`, savedAt: 1000 + i }),
    );
    const { hook, store } = await setup(initial);
    await act(async () => {
      await hook.result.current.save(draft({ name: 'One too many' }));
    });
    expect(hook.result.current.entries).toHaveLength(MAX_SAVED_LOCATIONS);
    expect(hook.result.current.entries.some((item) => item.name === 'Loc 0')).toBe(false);
    expect(hook.result.current.entries[0]?.name).toBe('One too many');
    expect(await store.list()).toHaveLength(MAX_SAVED_LOCATIONS);
  });

  it('does not touch state after it is unmounted mid-load', async () => {
    const store = createMemorySavedLocationStore();
    const list = vi.spyOn(store, 'list');
    const { unmount } = renderHook(() => useSavedLocations(store));
    unmount();
    await Promise.resolve();
    expect(list).toHaveBeenCalled();
  });
});
