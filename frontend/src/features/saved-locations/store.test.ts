import { describe, expect, it } from 'vitest';
import { createIndexedDbSavedLocationStore, createMemorySavedLocationStore } from './store';
import { makeLocation } from './test-support';

describe('createMemorySavedLocationStore', () => {
  it('starts empty, or with what it is given', async () => {
    expect(await createMemorySavedLocationStore().list()).toEqual([]);
    const seeded = createMemorySavedLocationStore([makeLocation()]);
    expect(await seeded.list()).toHaveLength(1);
  });

  it('adds a location and replaces one with the same id', async () => {
    const store = createMemorySavedLocationStore();
    await store.put(makeLocation({ id: 'a', name: 'First' }));
    await store.put(makeLocation({ id: 'b', name: 'Second' }));
    await store.put(makeLocation({ id: 'a', name: 'First, renamed' }));
    const names = (await store.list()).map((item) => item.name).sort();
    expect(names).toEqual(['First, renamed', 'Second']);
  });

  it('deletes by id, and ignores an id it does not have', async () => {
    const store = createMemorySavedLocationStore([
      makeLocation({ id: 'a' }),
      makeLocation({ id: 'b' }),
    ]);
    await store.delete('a');
    await store.delete('missing');
    expect((await store.list()).map((item) => item.id)).toEqual(['b']);
  });

  it('does not let a caller change what it stored by editing the list it got back', async () => {
    const store = createMemorySavedLocationStore([makeLocation()]);
    const first = await store.list();
    first.pop();
    expect(await store.list()).toHaveLength(1);
  });
});

describe('createIndexedDbSavedLocationStore', () => {
  it('falls back to a working in-memory store when IndexedDB is not available', async () => {
    // jsdom has no IndexedDB, which is exactly the "blocked or missing database" case.
    const store = createIndexedDbSavedLocationStore();
    await store.put(makeLocation({ id: 'a' }));
    expect((await store.list()).map((item) => item.id)).toEqual(['a']);
    await store.delete('a');
    expect(await store.list()).toEqual([]);
  });
});
