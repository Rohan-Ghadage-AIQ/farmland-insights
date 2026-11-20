import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/domain';
import { createIndexedDbHistoryStore, createMemoryHistoryStore } from './store';

function entry(id: string, savedAt: number): HistoryEntry {
  return {
    id,
    savedAt,
    request: {
      farm_geojson: { type: 'FeatureCollection', features: [] },
      start_date: '2026-10-01',
      end_date: '2026-10-30',
      crop_category: 'cereals_c3_temperate',
      grid_size: 50,
    },
    response: { type: 'FeatureCollection', features: [] },
  };
}

describe('createMemoryHistoryStore', () => {
  it('starts empty', async () => {
    const store = createMemoryHistoryStore();
    await expect(store.list()).resolves.toEqual([]);
  });

  it('lists what was put', async () => {
    const store = createMemoryHistoryStore();
    await store.put(entry('a', 1));
    await store.put(entry('b', 2));
    const entries = await store.list();
    expect(entries.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });

  it('overwrites an entry with the same id instead of duplicating it', async () => {
    const store = createMemoryHistoryStore();
    await store.put(entry('a', 1));
    await store.put(entry('a', 2));
    const entries = await store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.savedAt).toBe(2);
  });

  it('deletes one entry by id', async () => {
    const store = createMemoryHistoryStore();
    await store.put(entry('a', 1));
    await store.put(entry('b', 2));
    await store.delete('a');
    const entries = await store.list();
    expect(entries.map((item) => item.id)).toEqual(['b']);
  });

  it('clears every entry', async () => {
    const store = createMemoryHistoryStore();
    await store.put(entry('a', 1));
    await store.clear();
    await expect(store.list()).resolves.toEqual([]);
  });

  it('returns a copy, not a live reference, so a caller cannot mutate its internal state', async () => {
    const store = createMemoryHistoryStore();
    await store.put(entry('a', 1));
    const entries = await store.list();
    entries.push(entry('b', 2));
    await expect(store.list()).resolves.toHaveLength(1);
  });
});

describe('createIndexedDbHistoryStore', () => {
  // jsdom (this project's unit-test environment) does not implement IndexedDB, so these tests
  // exercise the store's safe-degradation path: every operation must resolve without throwing
  // rather than break the app (history is explicitly optional local storage, spec 3.4). The real
  // IndexedDB-backed path is exercised in a real browser (see tests/e2e/history.spec.ts).
  it('never throws when IndexedDB is unavailable, and reads back as empty', async () => {
    const store = createIndexedDbHistoryStore();
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.put(entry('a', 1))).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
    await expect(store.delete('a')).resolves.toBeUndefined();
  });
});
