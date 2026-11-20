import { useCallback, useEffect, useState } from 'react';
import {
  trimHistory,
  type FarmAnalysisRequest,
  type FarmAnalysisResponse,
  type HistoryEntry,
} from '@/domain';
import { createIndexedDbHistoryStore, type HistoryStore } from './store';

export interface UseSessionHistoryResult {
  readonly entries: readonly HistoryEntry[];
  readonly isLoading: boolean;
  /** Saves a completed run, then trims storage to the last 10 (spec 3.4). */
  readonly add: (request: FarmAnalysisRequest, response: FarmAnalysisResponse) => Promise<void>;
  readonly clear: () => Promise<void>;
}

function makeHistoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID needs a secure context; this id only needs to be unique within one
  // browser's history store, not globally or cryptographically.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Session history (spec 3.4, Phase 7): the last 10 runs, kept in IndexedDB so they survive a
 * reload, with a "Clear history" action. `store` is injectable for tests and to swap the backend;
 * with no argument, each mount gets its own real IndexedDB-backed store (constructed lazily, not
 * at module load, so every test file's jsdom environment — which has no IndexedDB — gets its own
 * isolated in-memory fallback instead of silently sharing one global store across tests).
 */
export function useSessionHistory(store?: HistoryStore): UseSessionHistoryResult {
  const [resolvedStore] = useState<HistoryStore>(() => store ?? createIndexedDbHistoryStore());
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);
  // Starts true (not set inside the effect below): a component mounts this hook once with a
  // stable store, so "true until the first load resolves" is exactly right.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void resolvedStore.list().then((loaded) => {
      if (cancelled) return;
      setEntries(trimHistory(loaded));
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedStore]);

  const add = useCallback(
    async (request: FarmAnalysisRequest, response: FarmAnalysisResponse) => {
      const entry: HistoryEntry = { id: makeHistoryId(), savedAt: Date.now(), request, response };
      await resolvedStore.put(entry);
      const all = await resolvedStore.list();
      const kept = trimHistory(all);
      const keptIds = new Set(kept.map((item) => item.id));
      const overflow = all.filter((item) => !keptIds.has(item.id));
      await Promise.all(overflow.map((item) => resolvedStore.delete(item.id)));
      setEntries(kept);
    },
    [resolvedStore],
  );

  const clear = useCallback(async () => {
    await resolvedStore.clear();
    setEntries([]);
  }, [resolvedStore]);

  return { entries, isLoading, add, clear };
}
