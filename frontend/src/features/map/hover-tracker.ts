export type CellId = string | number;

export interface HoverTracker {
  /** Call on every pointer move with the cell under the pointer, or null when over no cell. */
  move(id: CellId | null): void;
  current(): CellId | null;
  /** Clears any active hover. Call on unmount or when the data is replaced. */
  dispose(): void;
}

/**
 * Turns the firehose of mousemove events into the minimum number of feature-state updates:
 * one `false` for the cell left and one `true` for the cell entered, and nothing while the pointer
 * stays inside one cell.
 */
export function createHoverTracker(apply: (id: CellId, hovered: boolean) => void): HoverTracker {
  let active: CellId | null = null;

  const move = (id: CellId | null): void => {
    if (id !== null && active !== null && String(id) === String(active)) return;
    if (id === null && active === null) return;
    if (active !== null) apply(active, false);
    active = id;
    if (id !== null) apply(id, true);
  };

  return {
    move,
    current: () => active,
    dispose: () => {
      move(null);
    },
  };
}
