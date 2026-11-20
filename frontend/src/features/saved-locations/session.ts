import { validateFarmGeometry, type FarmFeatureCollection } from '@/domain';
import type { SavedInputs } from './types';

/** The working state worth remembering between visits: the field and the form settings. */
export interface SavedSession {
  readonly farm: FarmFeatureCollection | null;
  readonly inputs: SavedInputs;
}

/** Where the last session is kept. Synchronous, so the app can start with it already restored. */
export interface SessionStore {
  load(): SavedSession | null;
  save(session: SavedSession): void;
}

const STORAGE_KEY = 'farmland-insights-session-v1';

/** Remembers nothing. The default, so tests and previews never share state through storage. */
export const noSessionStore: SessionStore = {
  load: () => null,
  save: () => undefined,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseInputs(raw: unknown): SavedInputs | null {
  if (!isRecord(raw)) return null;
  const { crop, startDate, endDate, gridSize, imageDate } = raw;
  if (typeof crop !== 'string' || typeof startDate !== 'string' || typeof endDate !== 'string') {
    return null;
  }
  if (gridSize !== null && (typeof gridSize !== 'number' || !Number.isFinite(gridSize))) {
    return null;
  }
  // A missing or malformed date is simply dropped: the picker chooses one again.
  return typeof imageDate === 'string'
    ? { crop, startDate, endDate, gridSize, imageDate }
    : { crop, startDate, endDate, gridSize };
}

/**
 * Reads a stored session back, trusting nothing: the field must still pass the same geometry
 * checks as a freshly drawn one, so a corrupted or hand-edited value can never reach the map.
 */
export function parseSession(raw: unknown): SavedSession | null {
  if (!isRecord(raw)) return null;
  const inputs = parseInputs(raw.inputs);
  if (inputs === null) return null;
  if (raw.farm === null || raw.farm === undefined) return { farm: null, inputs };
  const checked = validateFarmGeometry(raw.farm);
  return checked.ok ? { farm: checked.collection, inputs } : { farm: null, inputs };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Some browsers throw on access when storage is blocked.
    return null;
  }
}

/** The browser's localStorage. Every call is guarded: blocked or full storage just means no memory. */
export function createLocalSessionStore(
  storage: StorageLike | null = defaultStorage(),
): SessionStore {
  if (storage === null) return noSessionStore;
  return {
    load() {
      try {
        const text = storage.getItem(STORAGE_KEY);
        return text === null ? null : parseSession(JSON.parse(text));
      } catch {
        return null;
      }
    },
    save(session) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Storage full or blocked: not worth interrupting anyone for.
      }
    },
  };
}
