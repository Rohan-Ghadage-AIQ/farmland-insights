/** Minimal storage surface the session code needs. */
export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Wraps a `Storage` so a blocked, full or missing backend (private mode, disabled site data)
 * never throws: values then live in memory for the life of the page.
 */
export function createSafeStorage(backend: Storage | undefined): SafeStorage {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      try {
        const value = backend?.getItem(key);
        if (value !== null && value !== undefined) return value;
      } catch {
        // Fall through to the in-memory copy.
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        backend?.setItem(key, value);
      } catch {
        // Quota or security error: the in-memory copy still serves this page.
      }
    },
    removeItem(key) {
      memory.delete(key);
      try {
        backend?.removeItem(key);
      } catch {
        // Nothing else to clear.
      }
    },
  };
}

/** Even reading `window.sessionStorage` can throw (blocked site data), so guard the access. */
export function resolveSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
