import { describe, expect, it, vi } from 'vitest';
import { createHoverTracker } from './hover-tracker';

describe('createHoverTracker', () => {
  it('marks the first hovered cell', () => {
    const apply = vi.fn();
    const tracker = createHoverTracker(apply);
    tracker.move(1);
    expect(apply.mock.calls).toEqual([[1, true]]);
  });

  it('unmarks the previous cell and marks the new one when the pointer moves between cells', () => {
    const apply = vi.fn();
    const tracker = createHoverTracker(apply);
    tracker.move(1);
    tracker.move(2);
    expect(apply.mock.calls).toEqual([
      [1, true],
      [1, false],
      [2, true],
    ]);
  });

  it('does nothing while the pointer stays over the same cell (mousemove fires constantly)', () => {
    const apply = vi.fn();
    const tracker = createHoverTracker(apply);
    tracker.move('a');
    tracker.move('a');
    tracker.move('a');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('treats 1 and "1" as the same cell', () => {
    const apply = vi.fn();
    const tracker = createHoverTracker(apply);
    tracker.move(1);
    tracker.move('1');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('clears the hover when the pointer leaves, and a repeat leave is a no-op', () => {
    const apply = vi.fn();
    const tracker = createHoverTracker(apply);
    tracker.move(5);
    tracker.move(null);
    tracker.move(null);
    expect(apply.mock.calls).toEqual([
      [5, true],
      [5, false],
    ]);
    expect(tracker.current()).toBeNull();
  });

  it('reports the current cell id', () => {
    const tracker = createHoverTracker(vi.fn());
    tracker.move(7);
    expect(tracker.current()).toBe(7);
  });

  it('dispose clears any active hover', () => {
    const apply = vi.fn();
    const tracker = createHoverTracker(apply);
    tracker.move(3);
    tracker.dispose();
    expect(apply).toHaveBeenLastCalledWith(3, false);
  });
});
