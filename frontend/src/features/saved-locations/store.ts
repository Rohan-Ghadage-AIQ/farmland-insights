import type { SavedLocation } from './types';

/** The storage surface the saved-locations feature needs. Swappable for tests. */
export interface SavedLocationStore {
  list(): Promise<SavedLocation[]>;
  put(location: SavedLocation): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'farmland-insights-saved-locations';
const DB_VERSION = 1;
const STORE_NAME = 'locations';

/** In memory: the fallback when IndexedDB is unavailable, and the test double. */
export function createMemorySavedLocationStore(
  initial: readonly SavedLocation[] = [],
): SavedLocationStore {
  let items = new Map(initial.map((item) => [item.id, item]));
  return {
    list() {
      return Promise.resolve([...items.values()]);
    },
    put(location) {
      items = new Map(items);
      items.set(location.id, location);
      return Promise.resolve();
    },
    delete(id) {
      items = new Map(items);
      items.delete(id);
      return Promise.resolve();
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error('Failed to open the saved locations database.'));
    };
  });
}

function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  onFallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        resolve(onFallback);
      };
    } catch {
      resolve(onFallback);
    }
  });
}

/**
 * The browser's IndexedDB, so locations survive closing the tab and are big enough to hold results.
 * Every operation is caught: a blocked or missing database means "nothing saved", never a crash.
 */
export function createIndexedDbSavedLocationStore(): SavedLocationStore {
  if (typeof indexedDB === 'undefined') return createMemorySavedLocationStore();
  return {
    async list() {
      try {
        const db = await openDatabase();
        // Only this store's own put() writes here, so every record read back is a SavedLocation.
        return await runRequest<SavedLocation[]>(
          db,
          'readonly',
          (store) => store.getAll() as IDBRequest<SavedLocation[]>,
          [],
        );
      } catch {
        return [];
      }
    },
    async put(location) {
      try {
        const db = await openDatabase();
        await runRequest<IDBValidKey>(db, 'readwrite', (store) => store.put(location), location.id);
      } catch {
        // Best effort: saving is a convenience, never load-bearing.
      }
    },
    async delete(id) {
      try {
        const db = await openDatabase();
        await runRequest<undefined>(db, 'readwrite', (store) => store.delete(id), undefined);
      } catch {
        // Best effort.
      }
    },
  };
}
