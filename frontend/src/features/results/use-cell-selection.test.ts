import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCellSelection } from './use-cell-selection';
import { makeCellGrid } from './test-support';

describe('useCellSelection', () => {
  it('starts with nothing selected and no highlights', () => {
    const { result } = renderHook(() => useCellSelection(makeCellGrid(2, 2)));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.highlightIds).toEqual([]);
  });

  it('selects a cell by id', () => {
    const { result } = renderHook(() => useCellSelection(makeCellGrid(2, 2)));
    act(() => {
      result.current.select('3');
    });
    expect(result.current.selectedId).toBe('3');
  });

  it('selects null to clear the selection', () => {
    const { result } = renderHook(() => useCellSelection(makeCellGrid(2, 2)));
    act(() => {
      result.current.select('3');
    });
    act(() => {
      result.current.select(null);
    });
    expect(result.current.selectedId).toBeNull();
  });

  it('sets and clears a highlight set, e.g. for "applies to N of M cells"', () => {
    const { result } = renderHook(() => useCellSelection(makeCellGrid(2, 2)));
    act(() => {
      result.current.highlight(['1', '3']);
    });
    expect(result.current.highlightIds).toEqual(['1', '3']);
    act(() => {
      result.current.clearHighlight();
    });
    expect(result.current.highlightIds).toEqual([]);
  });

  it('next() and previous() step through cells in array order, clamped at the ends', () => {
    const cells = makeCellGrid(1, 3); // ids 1, 2, 3
    const { result } = renderHook(() => useCellSelection(cells));
    act(() => {
      result.current.next();
    });
    expect(result.current.selectedId).toBe('1'); // nothing selected yet: next() picks the first
    act(() => {
      result.current.next();
    });
    expect(result.current.selectedId).toBe('2');
    act(() => {
      result.current.next();
    });
    expect(result.current.selectedId).toBe('3');
    act(() => {
      result.current.next(); // already last: stays put
    });
    expect(result.current.selectedId).toBe('3');
    act(() => {
      result.current.previous();
    });
    expect(result.current.selectedId).toBe('2');
  });

  it('previous() with nothing selected picks the last cell', () => {
    const cells = makeCellGrid(1, 3);
    const { result } = renderHook(() => useCellSelection(cells));
    act(() => {
      result.current.previous();
    });
    expect(result.current.selectedId).toBe('3');
  });

  it('move() steps spatially in the given arrow direction', () => {
    const cells = makeCellGrid(3, 3); // 3x3, ids 1..9 row-major, id 5 is the centre
    const { result } = renderHook(() => useCellSelection(cells));
    act(() => {
      result.current.select('5');
    });
    act(() => {
      result.current.move('right');
    });
    expect(result.current.selectedId).toBe('6');
    act(() => {
      result.current.move('down');
    });
    expect(result.current.selectedId).toBe('9');
  });

  it('move() with nothing selected selects the first cell', () => {
    const cells = makeCellGrid(2, 2);
    const { result } = renderHook(() => useCellSelection(cells));
    act(() => {
      result.current.move('right');
    });
    expect(result.current.selectedId).toBe('1');
  });

  it('move() at the edge of the grid stays put', () => {
    const cells = makeCellGrid(2, 2); // ids 1..4
    const { result } = renderHook(() => useCellSelection(cells));
    act(() => {
      result.current.select('1');
    });
    act(() => {
      result.current.move('up');
    });
    expect(result.current.selectedId).toBe('1');
    act(() => {
      result.current.move('left');
    });
    expect(result.current.selectedId).toBe('1');
  });

  it('clears the selection automatically when the cell list no longer contains it (a re-run)', () => {
    const first = makeCellGrid(1, 2); // ids 1, 2
    const { result, rerender } = renderHook(({ cells }) => useCellSelection(cells), {
      initialProps: { cells: first },
    });
    act(() => {
      result.current.select('2');
    });
    expect(result.current.selectedId).toBe('2');
    rerender({ cells: makeCellGrid(1, 1) }); // new run: only id 1 exists
    expect(result.current.selectedId).toBeNull();
  });
});
