import { gridIdOf, type GridAnalysisFeature } from '@/domain';

export type GridDirection = 'up' | 'down' | 'left' | 'right';

export interface GridRowCol {
  readonly row: number;
  readonly col: number;
}

/**
 * Spatial lookup built from cell centroids, for arrow-key navigation over the grid as it is laid
 * out on screen: row 0 is the northmost band of cells (top of a north-up map), column 0 is the
 * westmost (left). Built once per analysis response; cheap to rebuild since it is O(n log n).
 */
export interface GridIndex {
  readonly cellCount: number;
  rowColOf(id: string): GridRowCol | null;
  idAt(row: number, col: number): string | null;
}

/** Flattens a Polygon or MultiPolygon coordinate array into its raw `[lng, lat]` positions. */
function flattenPositions(coordinates: unknown): [number, number][] {
  if (!Array.isArray(coordinates)) return [];
  const [first] = coordinates as unknown[];
  if (typeof first === 'number') return [coordinates as [number, number]];
  return (coordinates as unknown[]).flatMap(flattenPositions);
}

/** The cell's bounding-box centre. Grid cells are small axis-aligned squares, so this is exact. */
function centroidOf(cell: GridAnalysisFeature): { x: number; y: number } {
  const positions = flattenPositions(cell.geometry.coordinates);
  const xs = positions.map(([x]) => x);
  const ys = positions.map(([, y]) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

// Centroids on a regular grid land on the same float per row/column; round away noise from
// polygon winding or coordinate precision without merging genuinely different rows.
const round = (value: number): number => Math.round(value * 1e7) / 1e7;

export function buildGridIndex(cells: readonly GridAnalysisFeature[]): GridIndex {
  const points = cells.map((cell) => ({ id: String(gridIdOf(cell)), ...centroidOf(cell) }));

  const rowKeys = [...new Set(points.map((p) => round(p.y)))].sort((a, b) => b - a);
  const colKeys = [...new Set(points.map((p) => round(p.x)))].sort((a, b) => a - b);
  const rowIndex = new Map(rowKeys.map((y, i) => [y, i]));
  const colIndex = new Map(colKeys.map((x, i) => [x, i]));

  const byId = new Map<string, GridRowCol>();
  const byRowCol = new Map<string, string>();
  for (const point of points) {
    const row = rowIndex.get(round(point.y));
    const col = colIndex.get(round(point.x));
    if (row === undefined || col === undefined) continue;
    byId.set(point.id, { row, col });
    byRowCol.set(`${String(row)},${String(col)}`, point.id);
  }

  return {
    cellCount: cells.length,
    rowColOf: (id) => byId.get(id) ?? null,
    idAt: (row, col) => byRowCol.get(`${String(row)},${String(col)}`) ?? null,
  };
}

const DIRECTION_DELTAS: Record<GridDirection, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** The neighboring cell id in `direction`, or null at the edge of the grid or for an unknown id. */
export function findNeighbor(
  index: GridIndex,
  id: string,
  direction: GridDirection,
): string | null {
  const position = index.rowColOf(id);
  if (position === null) return null;
  const [rowDelta, colDelta] = DIRECTION_DELTAS[direction];
  return index.idAt(position.row + rowDelta, position.col + colDelta);
}
