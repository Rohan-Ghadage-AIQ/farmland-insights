import { useCallback, useMemo, useState } from 'react';
import { gridIdOf, type GridAnalysisFeature } from '@/domain';
import { buildGridIndex, findNeighbor, type GridDirection } from './grid-navigation';

export interface UseCellSelectionResult {
  readonly selectedId: string | null;
  /** Cells to emphasise on the map, e.g. the ids an advisory "applies to N of M cells" covers. */
  readonly highlightIds: readonly string[];
  readonly select: (id: string | null) => void;
  readonly highlight: (ids: readonly string[]) => void;
  readonly clearHighlight: () => void;
  /** Steps to the next cell in list order. Selects the first cell when nothing is selected yet. */
  readonly next: () => void;
  /** Steps to the previous cell in list order. Selects the last cell when nothing is selected yet. */
  readonly previous: () => void;
  /** Steps to the spatial neighbor in an arrow-key direction. A no-op at the edge of the grid. */
  readonly move: (direction: GridDirection) => void;
}

/**
 * Owns the inspector's selected cell and map highlight set. One owner for this state (the results
 * feature), passed down to both the map slot (selection/highlight props) and the inspector slot.
 */
export function useCellSelection(cells: readonly GridAnalysisFeature[]): UseCellSelectionResult {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<readonly string[]>([]);

  const ids = useMemo(() => cells.map((cell) => String(gridIdOf(cell))), [cells]);
  // A stale selection from a previous run must never be shown against new results.
  const activeSelectedId = selectedId !== null && ids.includes(selectedId) ? selectedId : null;

  const gridIndex = useMemo(() => buildGridIndex(cells), [cells]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const highlight = useCallback((wanted: readonly string[]) => {
    setHighlightIds(wanted);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightIds([]);
  }, []);

  const next = useCallback(() => {
    if (ids.length === 0) return;
    const currentIndex = activeSelectedId === null ? -1 : ids.indexOf(activeSelectedId);
    const nextIndex = Math.min(currentIndex + 1, ids.length - 1);
    setSelectedId(ids[nextIndex] ?? null);
  }, [ids, activeSelectedId]);

  const previous = useCallback(() => {
    if (ids.length === 0) return;
    const currentIndex = activeSelectedId === null ? ids.length : ids.indexOf(activeSelectedId);
    const previousIndex = Math.max(currentIndex - 1, 0);
    setSelectedId(ids[previousIndex] ?? null);
  }, [ids, activeSelectedId]);

  const move = useCallback(
    (direction: GridDirection) => {
      if (activeSelectedId === null) {
        setSelectedId(ids[0] ?? null);
        return;
      }
      const neighbor = findNeighbor(gridIndex, activeSelectedId, direction);
      if (neighbor !== null) setSelectedId(neighbor);
    },
    [activeSelectedId, gridIndex, ids],
  );

  return {
    selectedId: activeSelectedId,
    highlightIds,
    select,
    highlight,
    clearHighlight,
    next,
    previous,
    move,
  };
}
