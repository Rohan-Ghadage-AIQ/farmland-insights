import type { HistoryEntry } from '@/domain';

/** The storage surface the history feature needs. Swappable for tests. */
export interface HistoryStore {
  list(): Promise<HistoryEntry[]>;
  put(entry: HistoryEntry): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'farmland-insights-history';
const DB_VERSION = 1;
const STORE_NAME = 'runs';

/**
 * An in-memory store: the safe fallback `createIndexedDbHistoryStore` degrades to when IndexedDB
 * is unavailable, and the test double other modules inject instead of the real thing.
 */
export function createMemoryHistoryStore(initial: readonly HistoryEntry[] = []): HistoryStore {
  let entries = new Map(initial.map((entry) => [entry.id, entry]));
  return {
    list() {
      return Promise.resolve([...entries.values()]);
    },
    put(entry) {
      entries = new Map(entries);
      entries.set(entry.id, entry);
      return Promise.resolve();
    },
    delete(id) {
      entries = new Map(entries);
      entries.delete(id);
      return Promise.resolve();
    },
    clear() {
      entries = new Map();
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
      reject(new Error('Failed to open the history database.'));
    };
  });
}

/** Runs one request against a fresh transaction, resolving `onFallback` instead of rejecting. */
function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  onFallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
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
 * Wraps the browser's IndexedDB. Every operation is caught: a blocked, missing or failing
 * database degrades to "no history" rather than throwing or breaking the app — session history
 * (spec 3.4) is explicitly optional local storage, never load-bearing.
 */
export function createIndexedDbHistoryStore(): HistoryStore {
  if (typeof indexedDB === 'undefined') {
    return createMemoryHistoryStore();
  }
  return {
    async list() {
      try {
        const db = await openDatabase();
        // IDBObjectStore.getAll() is typed `IDBRequest<any>` by lib.dom; this store's own put()
        // is the only writer, so every record read back is a HistoryEntry.
        const result = await runRequest<HistoryEntry[]>(
          db,
          'readonly',
          (store) => store.getAll() as IDBRequest<HistoryEntry[]>,
          [],
        );
        return result;
      } catch {
        return [];
      }
    },
    async put(entry) {
      try {
        const db = await openDatabase();
        await runRequest<IDBValidKey>(db, 'readwrite', (store) => store.put(entry), entry.id);
      } catch {
        // Best-effort: history is never load-bearing.
      }
    },
    async delete(id) {
      try {
        const db = await openDatabase();
        await runRequest<undefined>(db, 'readwrite', (store) => store.delete(id), undefined);
      } catch {
        // Best-effort.
      }
    },
    async clear() {
      try {
        const db = await openDatabase();
        await runRequest<undefined>(db, 'readwrite', (store) => store.clear(), undefined);
      } catch {
        // Best-effort.
      }
    },
  };
}
