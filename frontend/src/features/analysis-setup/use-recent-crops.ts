import { useCallback, useState } from 'react';
import { createRecentCropsStore, type RecentCropsStore } from './crop-recents';

export interface UseRecentCropsResult {
  readonly recents: readonly string[];
  readonly addRecent: (cropEnglish: string) => void;
}

/** React binding over {@link createRecentCropsStore}: re-renders CropField when recents change. */
export function useRecentCrops(
  store: RecentCropsStore = createRecentCropsStore(),
): UseRecentCropsResult {
  const [recents, setRecents] = useState<readonly string[]>(() => store.getRecents());

  const addRecent = useCallback(
    (cropEnglish: string) => {
      setRecents(store.addRecent(cropEnglish));
    },
    [store],
  );

  return { recents, addRecent };
}
