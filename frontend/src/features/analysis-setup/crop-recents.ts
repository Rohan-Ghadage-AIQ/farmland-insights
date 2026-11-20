import { createSafeStorage, type SafeStorage } from '@/lib/session';

const STORAGE_KEY = 'fi.recent-crops';
/** How many recent picks to remember and show first. */
export const RECENT_CROPS_LIMIT = 5;

export interface RecentCropsStore {
  /** Most recent first. */
  getRecents: () => string[];
  /** Moves `cropEnglish` to the front (adding it if new) and returns the updated list. */
  addRecent: (cropEnglish: string) => string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Even reading `window.localStorage` can throw (blocked site data), so guard the access. */
function resolveLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Recently-picked crops (spec 3.3 step 2), a per-viewer convenience kept in `localStorage`
 * through the same safe wrapper the session store uses, so a blocked or full storage backend
 * never breaks the combobox.
 */
export function createRecentCropsStore(
  storage: SafeStorage = createSafeStorage(resolveLocalStorage()),
): RecentCropsStore {
  function read(): string[] {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return isStringArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(list: string[]): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  return {
    getRecents: read,
    addRecent(cropEnglish) {
      const next = [cropEnglish, ...read().filter((entry) => entry !== cropEnglish)].slice(
        0,
        RECENT_CROPS_LIMIT,
      );
      write(next);
      return next;
    },
  };
}
