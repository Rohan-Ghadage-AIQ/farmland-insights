import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayLabel,
  daysInclusive,
  isValidIsoDate,
  monthLabel,
  shiftMonths,
  startOfMonth,
  todayIso,
} from './date-utils';

describe('isValidIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidIsoDate('2025-03-15')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2025-02-29')).toBe(false);
    expect(isValidIsoDate('2025-13-01')).toBe(false);
    expect(isValidIsoDate('15/03/2025')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
  });
});

describe('addMonths and startOfMonth', () => {
  it('moves by whole months from the first of the month', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-01');
    expect(addMonths('2025-12-10', 1)).toBe('2026-01-01');
    expect(addMonths('2025-01-10', -1)).toBe('2024-12-01');
    expect(startOfMonth('2025-03-17')).toBe('2025-03-01');
  });
});

describe('shiftMonths', () => {
  it('keeps the day of month, clamped to the length of the target month', () => {
    expect(shiftMonths('2025-03-15', 1)).toBe('2025-04-15');
    expect(shiftMonths('2025-03-31', 1)).toBe('2025-04-30');
    expect(shiftMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(shiftMonths('2025-01-15', -1)).toBe('2024-12-15');
  });
});

describe('daysInclusive', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2025-03-01', '2025-03-01')).toBe(1);
    expect(daysInclusive('2025-03-01', '2025-03-30')).toBe(30);
    expect(daysInclusive('2025-02-27', '2025-03-02')).toBe(4);
  });
});

describe('buildMonthGrid', () => {
  it('builds Monday-first weeks that include padding days from the neighbouring months', () => {
    const weeks = buildMonthGrid('2025-03-01');

    expect(weeks[0]?.[0]).toBe('2025-02-24');
    expect(weeks[0]?.[5]).toBe('2025-03-01');
    expect(weeks.at(-1)?.at(-1)).toBe('2025-04-06');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
});

describe('labels', () => {
  it('formats an accessible day label without relying on locale data', () => {
    expect(dayLabel('2025-03-09')).toBe('Sunday, 9 March 2025');
  });

  it('formats a month heading', () => {
    expect(monthLabel('2025-03-17')).toBe('March 2025');
  });
});

describe('todayIso', () => {
  it('uses the local calendar day of the given instant', () => {
    expect(todayIso(new Date(2025, 2, 15, 23, 59))).toBe('2025-03-15');
    expect(todayIso(new Date(2025, 2, 15, 0, 1))).toBe('2025-03-15');
  });
});
