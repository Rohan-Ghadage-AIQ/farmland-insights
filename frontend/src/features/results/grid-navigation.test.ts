import { describe, expect, it } from 'vitest';
import { buildGridIndex, findNeighbor } from './grid-navigation';
import { makeCellGrid } from './test-support';

describe('buildGridIndex', () => {
  it('assigns row and column from cell centroids on a regular grid', () => {
    const cells = makeCellGrid(3, 4); // 3 rows, 4 cols, row-major grid ids 1..12
    const index = buildGridIndex(cells);
    expect(index.cellCount).toBe(12);
    expect(index.rowColOf('1')).toEqual({ row: 0, col: 0 });
    expect(index.rowColOf('4')).toEqual({ row: 0, col: 3 });
    expect(index.rowColOf('5')).toEqual({ row: 1, col: 0 });
    expect(index.rowColOf('12')).toEqual({ row: 2, col: 3 });
  });

  it('returns null row/col for an unknown id', () => {
    const index = buildGridIndex(makeCellGrid(2, 2));
    expect(index.rowColOf('nope')).toBeNull();
  });

  it('handles an empty cell list', () => {
    const index = buildGridIndex([]);
    expect(index.cellCount).toBe(0);
    expect(index.rowColOf('1')).toBeNull();
  });
});

describe('findNeighbor', () => {
  const cells = makeCellGrid(3, 3); // ids 1..9, row-major
  const index = buildGridIndex(cells);

  it('moves right, left, up and down to the adjacent cell id', () => {
    expect(findNeighbor(index, '5', 'right')).toBe('6');
    expect(findNeighbor(index, '5', 'left')).toBe('4');
    expect(findNeighbor(index, '5', 'up')).toBe('2');
    expect(findNeighbor(index, '5', 'down')).toBe('8');
  });

  it('returns null at the edge of the grid', () => {
    expect(findNeighbor(index, '1', 'left')).toBeNull();
    expect(findNeighbor(index, '1', 'up')).toBeNull();
    expect(findNeighbor(index, '3', 'right')).toBeNull();
    expect(findNeighbor(index, '9', 'down')).toBeNull();
  });

  it('returns null for an id the index does not know', () => {
    expect(findNeighbor(index, 'missing', 'right')).toBeNull();
  });

  it('returns null when nothing occupies the neighboring cell (a gap in the grid)', () => {
    const sparse = buildGridIndex(cells.filter((cell) => cell.properties.grid_id !== 6));
    expect(findNeighbor(sparse, '5', 'right')).toBeNull();
  });
});
