import { describe, expect, it } from 'vitest';
import {
  MAX_FORECAST_DAYS,
  MAX_PERIOD_DAYS,
  addDays,
  dayCount,
  getDatePresets,
  maxEndDate,
  todayIso,
  toIsoDate,
  validateDateRange,
} from './dates';
import { parseIsoDate, type IsoDate } from './types';

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`bad test date ${value}`);
  return parsed;
}

const TODAY = iso('2026-11-03');

describe('toIsoDate / todayIso', () => {
  it('formats local calendar components with zero padding', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('takes an injectable clock', () => {
    expect(todayIso(new Date(2026, 10, 3, 12))).toBe('2026-11-03');
  });

  it('defaults to the real clock and returns a valid date', () => {
    expect(parseIsoDate(todayIso())).not.toBeNull();
  });
});

describe('addDays', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addDays(iso('2026-11-03'), 16)).toBe('2026-11-19');
    expect(addDays(iso('2026-12-30'), 3)).toBe('2027-01-02');
    expect(addDays(iso('2024-02-28'), 2)).toBe('2024-03-01');
    expect(addDays(iso('2025-02-28'), 1)).toBe('2025-03-01');
    expect(addDays(iso('2026-03-01'), -1)).toBe('2026-02-28');
    expect(addDays(iso('2026-03-01'), 0)).toBe('2026-03-01');
  });
});

describe('dayCount', () => {
  it('counts both ends inclusively', () => {
    expect(dayCount(iso('2026-11-03'), iso('2026-11-03'))).toBe(1);
    expect(dayCount(iso('2026-11-01'), iso('2026-11-30'))).toBe(30);
    expect(dayCount(iso('2024-02-01'), iso('2024-03-01'))).toBe(30);
  });

  it('is unaffected by daylight saving shifts', () => {
    expect(dayCount(iso('2026-03-01'), iso('2026-04-01'))).toBe(32);
    expect(dayCount(iso('2026-10-01'), iso('2026-11-30'))).toBe(61);
  });
});

describe('maxEndDate', () => {
  it('is today plus 16 days', () => {
    expect(MAX_FORECAST_DAYS).toBe(16);
    expect(maxEndDate(TODAY)).toBe('2026-11-19');
  });
});

describe('validateDateRange', () => {
  it('accepts a normal past range', () => {
    expect(validateDateRange('2026-10-01', '2026-10-31', TODAY)).toEqual([]);
  });

  it('accepts start equal to end', () => {
    expect(validateDateRange('2026-10-01', '2026-10-01', TODAY)).toEqual([]);
  });

  it('accepts an end date of exactly today + 16', () => {
    expect(validateDateRange('2026-11-04', '2026-11-19', TODAY)).toEqual([]);
  });

  it('rejects an end date of today + 17', () => {
    const issues = validateDateRange('2026-11-04', '2026-11-20', TODAY);
    expect(issues.map((i) => i.code)).toEqual(['end_too_far']);
    expect(issues[0]?.field).toBe('end');
    expect(issues[0]?.message).toContain('2026-11-19');
  });

  it('rejects start after end', () => {
    const issues = validateDateRange('2026-10-31', '2026-10-01', TODAY);
    expect(issues.map((i) => i.code)).toEqual(['start_after_end']);
    expect(issues[0]?.field).toBe('start');
  });

  it('rejects missing or malformed dates per field', () => {
    expect(validateDateRange('', '2026-10-01', TODAY).map((i) => i.code)).toEqual([
      'invalid_start',
    ]);
    expect(validateDateRange('2026-10-01', '2026-02-30', TODAY).map((i) => i.code)).toEqual([
      'invalid_end',
    ]);
    expect(validateDateRange('x', 'y', TODAY).map((i) => i.code)).toEqual([
      'invalid_start',
      'invalid_end',
    ]);
  });

  it('reports both problems when start is after end and end is too far out', () => {
    const codes = validateDateRange('2026-12-25', '2026-12-01', TODAY).map((i) => i.code);
    expect(codes).toEqual(['start_after_end', 'end_too_far']);
  });
});

describe('getDatePresets', () => {
  const presets = (today: IsoDate) =>
    Object.fromEntries(getDatePresets(today).map((p) => [p.id, p]));

  it('offers last 7, 30 and 90 days, last 12 months, next 16 forecast and season to date', () => {
    expect(getDatePresets(TODAY).map((p) => p.id)).toEqual([
      'last7',
      'last30',
      'last90',
      'last365',
      'forecast16',
      'season',
    ]);
  });

  it('last 90 days and last 12 months end today and span exactly that many days', () => {
    const p = presets(TODAY);
    expect(p.last90).toMatchObject({ start: '2026-08-06', end: '2026-11-03' });
    expect(dayCount(iso(p.last90?.start ?? ''), iso(p.last90?.end ?? ''))).toBe(90);
    expect(p.last365).toMatchObject({ start: '2025-11-04', end: '2026-11-03' });
    expect(dayCount(iso(p.last365?.start ?? ''), iso(p.last365?.end ?? ''))).toBe(365);
  });

  it('the 12-month preset fits inside the one-year limit even across a leap day', () => {
    const leapYear = presets(iso('2024-12-31')).last365;
    expect(dayCount(iso(leapYear?.start ?? ''), iso(leapYear?.end ?? ''))).toBe(365);
    expect(365).toBeLessThanOrEqual(MAX_PERIOD_DAYS);
  });

  it('last 7 and last 30 days end today and span exactly that many days', () => {
    const p = presets(TODAY);
    expect(p.last7).toMatchObject({ start: '2026-10-28', end: '2026-11-03' });
    expect(dayCount(iso(p.last7?.start ?? ''), iso(p.last7?.end ?? ''))).toBe(7);
    expect(p.last30).toMatchObject({ start: '2026-10-05', end: '2026-11-03' });
    expect(dayCount(iso(p.last30?.start ?? ''), iso(p.last30?.end ?? ''))).toBe(30);
  });

  it('next 16 forecast runs from tomorrow to today + 16', () => {
    const forecast = presets(TODAY).forecast16;
    expect(forecast).toMatchObject({ start: '2026-11-04', end: '2026-11-19' });
    expect(dayCount(iso(forecast?.start ?? ''), iso(forecast?.end ?? ''))).toBe(16);
  });

  it('every preset passes the range rules', () => {
    for (const today of ['2026-11-03', '2026-02-10', '2026-07-15', '2024-02-29'].map(iso)) {
      for (const preset of getDatePresets(today)) {
        expect(validateDateRange(preset.start, preset.end, today)).toEqual([]);
      }
    }
  });

  it.each([
    ['2026-11-03', '2026-11-01', 'Season to date (Rabi)'],
    ['2026-11-01', '2026-11-01', 'Season to date (Rabi)'],
    ['2026-12-31', '2026-11-01', 'Season to date (Rabi)'],
    ['2026-02-10', '2025-11-01', 'Season to date (Rabi)'],
    ['2026-05-31', '2025-11-01', 'Season to date (Rabi)'],
    ['2026-06-01', '2026-06-01', 'Season to date (Kharif)'],
    ['2026-07-15', '2026-06-01', 'Season to date (Kharif)'],
    ['2026-10-31', '2026-06-01', 'Season to date (Kharif)'],
  ])('season to date on %s starts %s', (today, start, label) => {
    const season = presets(iso(today)).season;
    expect(season).toMatchObject({ start, end: today, label });
  });
});

describe('the one-year limit', () => {
  const issues = (start: string, end: string) => validateDateRange(start, end, TODAY);

  it('is 366 days, so a leap year fits', () => {
    expect(MAX_PERIOD_DAYS).toBe(366);
  });

  it.each([
    ['one day', '2026-10-01', '2026-10-01'],
    ['30 days', '2026-10-05', '2026-11-03'],
    ['90 days', '2026-08-06', '2026-11-03'],
    ['365 days', '2025-11-04', '2026-11-03'],
    ['exactly 366 days', '2025-11-03', '2026-11-03'],
  ])('accepts %s', (_label, start, end) => {
    expect(issues(start, end)).toEqual([]);
  });

  it('rejects 367 days, naming the limit and how long was chosen', () => {
    const found = issues('2025-11-02', '2026-11-03');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'period_too_long', field: 'end' });
    expect(found[0]?.message).toBe(
      'The period cannot be longer than 366 days (about a year). You chose 367 days.',
    );
  });

  it('rejects several years', () => {
    expect(issues('2020-01-01', '2026-11-03').map((i) => i.code)).toEqual(['period_too_long']);
  });

  it('does not call a backwards range "too long"', () => {
    expect(issues('2026-11-03', '2025-01-01').map((i) => i.code)).toEqual(['start_after_end']);
  });

  it('can report a too-long period and a too-far end date together', () => {
    const codes = issues('2025-01-01', '2026-12-31').map((i) => i.code);
    expect(codes).toEqual(['period_too_long', 'end_too_far']);
  });
});
