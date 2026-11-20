/**
 * Builds analysis cells for results tests. Mirrors `src/domain/fixtures.ts` (not exported from
 * the domain's public surface), so this feature's tests do not depend on a domain internal.
 * Import this module only from `*.test.ts(x)` files, never from app code.
 */
import type { CpiScores, GridAnalysisFeature } from '@/domain';

/**
 * Narrows a possibly-missing value, for test code that must not use `!` or `as` (the project bans
 * both) to work around `noUncheckedIndexedAccess`. Throws immediately with a clear message rather
 * than letting `undefined` flow into an assertion and fail with a confusing message later.
 */
export function assertDefined<T>(
  value: T | undefined,
  message = 'Expected a value, got undefined',
): asserts value is T {
  if (value === undefined) throw new Error(message);
}

/** The array element at `index`, narrowed to `T`. Throws if the array is shorter than expected. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assertDefined(
    item,
    `Expected an item at index ${String(index)}, but the array has ${String(items.length)}`,
  );
  return item;
}

export interface MakeCellOptions {
  readonly metrics?: Record<string, number>;
  readonly cpi?: Partial<CpiScores>;
  readonly advisories?: Record<string, string>;
  /** Lower-left corner of the cell's square, in degrees. Cells are `cellSize` wide, non-overlapping. */
  readonly origin?: readonly [number, number];
  readonly cellSize?: number;
}

const DEFAULT_CPI: CpiScores = {
  Structural: 0.5,
  Chlorophyll: 0.5,
  Water_Drought: 0.5,
  Environmental: 0.5,
  Agro_Meteo: 0.5,
};

/** One analysis cell. Omitting `metrics` yields a cell with `raw_metrics` absent entirely. */
export function makeCell(
  gridId: string | number,
  options: MakeCellOptions = {},
): GridAnalysisFeature {
  const [x, y] = options.origin ?? [77, 28];
  const d = options.cellSize ?? 0.001;
  return {
    type: 'Feature',
    id: gridId,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + d, y],
          [x + d, y + d],
          [x, y + d],
          [x, y],
        ],
      ],
    },
    properties: {
      grid_id: gridId,
      ...(options.metrics ? { raw_metrics: options.metrics } : {}),
      cpi_scores: { ...DEFAULT_CPI, ...options.cpi },
      ...(options.advisories ? { advisories: options.advisories } : {}),
    },
  };
}

/**
 * Builds `rows x cols` cells on a regular grid (row-major grid ids `1..rows*cols`), for spatial
 * tests. Row 0 is the northmost band (highest latitude), matching `grid-navigation.ts`'s
 * row-0-is-top convention, so "row" here lines up directly with a built `GridIndex`'s row.
 */
export function makeCellGrid(
  rows: number,
  cols: number,
  cellOptions: (row: number, col: number, gridId: number) => MakeCellOptions = () => ({}),
): GridAnalysisFeature[] {
  const cellSize = 0.001;
  const cells: GridAnalysisFeature[] = [];
  let gridId = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const origin: readonly [number, number] = [77 + col * cellSize, 28 - row * cellSize];
      cells.push(makeCell(gridId, { cellSize, ...cellOptions(row, col, gridId), origin }));
      gridId += 1;
    }
  }
  return cells;
}
