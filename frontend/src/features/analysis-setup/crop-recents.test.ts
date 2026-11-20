import { beforeEach, describe, expect, it } from 'vitest';
import { createRecentCropsStore, RECENT_CROPS_LIMIT } from './crop-recents';
import type { SafeStorage } from '@/lib/session';

function fakeStorage(): SafeStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('createRecentCropsStore', () => {
  let storage: SafeStorage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it('starts empty', () => {
    const store = createRecentCropsStore(storage);
    expect(store.getRecents()).toEqual([]);
  });

  it('adds a crop to the front', () => {
    const store = createRecentCropsStore(storage);
    store.addRecent('Wheat');
    expect(store.getRecents()).toEqual(['Wheat']);
  });

  it('moves a repeated pick back to the front instead of duplicating it', () => {
    const store = createRecentCropsStore(storage);
    store.addRecent('Wheat');
    store.addRecent('Mustard');
    store.addRecent('Wheat');

    expect(store.getRecents()).toEqual(['Wheat', 'Mustard']);
  });

  it(`keeps only the ${String(RECENT_CROPS_LIMIT)} most recent picks`, () => {
    const store = createRecentCropsStore(storage);
    const crops = Array.from({ length: RECENT_CROPS_LIMIT + 3 }, (_, i) => `Crop ${String(i)}`);
    for (const crop of crops) store.addRecent(crop);

    const recents = store.getRecents();
    expect(recents).toHaveLength(RECENT_CROPS_LIMIT);
    expect(recents[0]).toBe(crops.at(-1));
  });

  it('persists recents across store instances sharing the same storage', () => {
    createRecentCropsStore(storage).addRecent('Wheat');
    const second = createRecentCropsStore(storage);

    expect(second.getRecents()).toEqual(['Wheat']);
  });

  it('tolerates corrupted storage content', () => {
    storage.setItem('fi.recent-crops', 'not json');
    const store = createRecentCropsStore(storage);

    expect(store.getRecents()).toEqual([]);
  });

  it('tolerates storage holding something other than a string array', () => {
    storage.setItem('fi.recent-crops', JSON.stringify({ not: 'an array' }));
    const store = createRecentCropsStore(storage);

    expect(store.getRecents()).toEqual([]);
  });
});
