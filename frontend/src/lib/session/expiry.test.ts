import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPIRY_WARNING_MS, isExpired, msUntilExpiry, scheduleExpiry, shouldWarn } from './expiry';

const MIN = 60_000;

describe('msUntilExpiry', () => {
  it('returns the milliseconds remaining', () => {
    expect(msUntilExpiry(10 * MIN, 4 * MIN)).toBe(6 * MIN);
  });

  it('never goes negative once expired', () => {
    expect(msUntilExpiry(1000, 5000)).toBe(0);
  });

  it('defaults to the current time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    expect(msUntilExpiry(4000)).toBe(3000);
  });
});

describe('isExpired', () => {
  it('is false before expiry, true at and after it', () => {
    expect(isExpired(1000, 999)).toBe(false);
    expect(isExpired(1000, 1000)).toBe(true);
    expect(isExpired(1000, 2000)).toBe(true);
  });
});

describe('shouldWarn', () => {
  it('warns at the 5 minute mark by default', () => {
    expect(EXPIRY_WARNING_MS).toBe(5 * MIN);
    expect(shouldWarn(10 * MIN, 5 * MIN)).toBe(true); // exactly 5 min left
    expect(shouldWarn(10 * MIN, 5 * MIN + 1)).toBe(true); // just under 5 min left
  });

  it('does not warn while more than 5 minutes remain', () => {
    expect(shouldWarn(10 * MIN, 5 * MIN - 1)).toBe(false); // just over 5 min left
    expect(shouldWarn(10 * MIN, 4 * MIN)).toBe(false); // 6 min left
    expect(shouldWarn(10 * MIN, 0)).toBe(false);
  });

  it('does not warn once expired (the session is already gone)', () => {
    expect(shouldWarn(10 * MIN, 10 * MIN)).toBe(false);
    expect(shouldWarn(10 * MIN, 11 * MIN)).toBe(false);
  });

  it('accepts a custom lead time', () => {
    expect(shouldWarn(10 * MIN, 8 * MIN, MIN)).toBe(false);
    expect(shouldWarn(10 * MIN, 9 * MIN + 1, MIN)).toBe(true);
  });
});

describe('scheduleExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onWarn 5 minutes before expiry and onExpire at expiry', () => {
    const onWarn = vi.fn();
    const onExpire = vi.fn();
    scheduleExpiry(30 * MIN, { onWarn, onExpire });

    vi.advanceTimersByTime(24 * MIN + 59_000);
    expect(onWarn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * MIN);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
  });

  it('warns straight away when already inside the warning window', () => {
    const onWarn = vi.fn();
    scheduleExpiry(3 * MIN, { onWarn, onExpire: vi.fn() });

    vi.advanceTimersByTime(0);

    expect(onWarn).toHaveBeenCalledTimes(1);
  });

  it('expires without warning when the session is already past expiry', () => {
    vi.setSystemTime(10 * MIN);
    const onWarn = vi.fn();
    const onExpire = vi.fn();
    scheduleExpiry(5 * MIN, { onWarn, onExpire });

    vi.advanceTimersByTime(0);

    expect(onWarn).not.toHaveBeenCalled();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('cancels both timers', () => {
    const onWarn = vi.fn();
    const onExpire = vi.fn();
    const cancel = scheduleExpiry(30 * MIN, { onWarn, onExpire });

    cancel();
    vi.advanceTimersByTime(60 * MIN);

    expect(onWarn).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('clamps very long delays so setTimeout does not overflow and fire immediately', () => {
    const onExpire = vi.fn();
    const fortyDays = 40 * 24 * 60 * MIN;
    scheduleExpiry(fortyDays, { onWarn: vi.fn(), onExpire });

    vi.advanceTimersByTime(2 ** 31);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(fortyDays - 2 ** 31);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
