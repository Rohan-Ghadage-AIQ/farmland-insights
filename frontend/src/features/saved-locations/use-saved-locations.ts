import { useCallback, useEffect, useState } from 'react';
import type { FarmFeatureCollection } from '@/domain';
import { createIndexedDbSavedLocationStore, type SavedLocationStore } from './store';
import {
  MAX_NAME_LENGTH,
  MAX_SAVED_LOCATIONS,
  normaliseName,
  sameName,
  type SavedInputs,
  type SavedLocation,
  type SavedRun,
} from './types';

export interface SaveDraft {
  readonly name: string;
  readonly farm: FarmFeatureCollection;
  readonly inputs: SavedInputs;
  readonly run: SavedRun | null;
}

export interface UseSavedLocationsResult {
  /** Newest first. */
  readonly entries: readonly SavedLocation[];
  readonly isLoading: boolean;
  /**
   * Saves a location. A location with the same name (any case) is replaced, so saving again updates
   * it. Returns the saved location, or null when the name is empty.
   */
  readonly save: (draft: SaveDraft) => Promise<SavedLocation | null>;
  readonly remove: (id: string) => Promise<void>;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Only needs to be unique within this browser's store.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const newestFirst = (items: readonly SavedLocation[]): SavedLocation[] =>
  [...items].sort((a, b) => b.savedAt - a.savedAt);

/**
 * Named, persistent locations (field + settings + results), kept in IndexedDB so they survive a
 * reload. `store` is injectable for tests; each mount otherwise gets its own real store.
 */
export function useSavedLocations(store?: SavedLocationStore): UseSavedLocationsResult {
  const [resolvedStore] = useState<SavedLocationStore>(
    () => store ?? createIndexedDbSavedLocationStore(),
  );
  const [entries, setEntries] = useState<readonly SavedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void resolvedStore.list().then((loaded) => {
      if (cancelled) return;
      setEntries(newestFirst(loaded));
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedStore]);

  const save = useCallback(
    async (draft: SaveDraft): Promise<SavedLocation | null> => {
      const name = normaliseName(draft.name).slice(0, MAX_NAME_LENGTH);
      if (name === '') return null;

      const existing = (await resolvedStore.list()).find((item) => sameName(item.name, name));
      const location: SavedLocation = {
        id: existing?.id ?? makeId(),
        name,
        savedAt: Date.now(),
        farm: draft.farm,
        inputs: draft.inputs,
        run: draft.run,
      };
      await resolvedStore.put(location);

      const kept = newestFirst(await resolvedStore.list());
      const overflow = kept.slice(MAX_SAVED_LOCATIONS);
      await Promise.all(overflow.map((item) => resolvedStore.delete(item.id)));
      setEntries(kept.slice(0, MAX_SAVED_LOCATIONS));
      return location;
    },
    [resolvedStore],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await resolvedStore.delete(id);
      setEntries((current) => current.filter((item) => item.id !== id));
    },
    [resolvedStore],
  );

  return { entries, isLoading, save, remove };
}
