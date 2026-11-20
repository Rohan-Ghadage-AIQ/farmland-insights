import { parseIsoDate, type IsoDate } from './types';

/** The backend rejects an `end_date` later than today + 16 days (server date). */
export const MAX_FORECAST_DAYS = 16;

/** The longest period one analysis may cover: a year, counting both end days (a leap year has 366). */
export const MAX_PERIOD_DAYS = 366;

const MS_PER_DAY = 86_400_000;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Formats the local calendar date of `date`. */
export function toIsoDate(date: Date): IsoDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}` as IsoDate;
}

/** Today's local date. The clock is injectable so rules stay testable. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

function toUtcMs(date: IsoDate): number {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Calendar arithmetic in UTC, so daylight saving never shifts the result. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(toUtcMs(date) + days * MS_PER_DAY);
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}` as IsoDate;
}

/** Number of days in the range, counting both the start and the end day. */
export function dayCount(start: IsoDate, end: IsoDate): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / MS_PER_DAY) + 1;
}

export function maxEndDate(today: IsoDate): IsoDate {
  return addDays(today, MAX_FORECAST_DAYS);
}

export type DateRangeIssueCode =
  'invalid_start' | 'invalid_end' | 'start_after_end' | 'end_too_far' | 'period_too_long';

export interface DateRangeIssue {
  code: DateRangeIssueCode;
  field: 'start' | 'end';
  message: string;
}

/**
 * Checks the same rules the backend enforces: both dates real, start <= end, end <= today + 16.
 * Returns an empty list when the range is valid.
 */
export function validateDateRange(start: string, end: string, today: IsoDate): DateRangeIssue[] {
  const issues: DateRangeIssue[] = [];
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);

  if (!startDate)
    issues.push({ code: 'invalid_start', field: 'start', message: 'Enter a valid start date.' });
  if (!endDate)
    issues.push({ code: 'invalid_end', field: 'end', message: 'Enter a valid end date.' });
  if (!startDate || !endDate) return issues;

  if (startDate > endDate) {
    issues.push({
      code: 'start_after_end',
      field: 'start',
      message: 'The start date must be on or before the end date.',
    });
  }
  const days = dayCount(startDate, endDate);
  if (startDate <= endDate && days > MAX_PERIOD_DAYS) {
    issues.push({
      code: 'period_too_long',
      field: 'end',
      message: `The period cannot be longer than ${String(MAX_PERIOD_DAYS)} days (about a year). You chose ${String(days)} days.`,
    });
  }
  const limit = maxEndDate(today);
  if (endDate > limit) {
    issues.push({
      code: 'end_too_far',
      field: 'end',
      message: `The end date cannot be after ${limit}. Forecasts reach only ${MAX_FORECAST_DAYS} days ahead.`,
    });
  }
  return issues;
}

export interface DatePreset {
  id: 'last7' | 'last30' | 'last90' | 'last365' | 'forecast16' | 'season';
  label: string;
  start: IsoDate;
  end: IsoDate;
}

/**
 * "Season to date" starts on the most recent Indian crop-season start: Kharif on 1 June or Rabi on
 * 1 November. This is an app heuristic, not data from the backend.
 */
function currentSeason(today: IsoDate): { name: 'Kharif' | 'Rabi'; start: IsoDate } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month >= 11) return { name: 'Rabi', start: `${pad(year, 4)}-11-01` as IsoDate };
  if (month >= 6) return { name: 'Kharif', start: `${pad(year, 4)}-06-01` as IsoDate };
  return { name: 'Rabi', start: `${pad(year - 1, 4)}-11-01` as IsoDate };
}

export function getDatePresets(today: IsoDate): DatePreset[] {
  const season = currentSeason(today);
  return [
    { id: 'last7', label: 'Last 7 days', start: addDays(today, -6), end: today },
    { id: 'last30', label: 'Last 30 days', start: addDays(today, -29), end: today },
    { id: 'last90', label: 'Last 90 days', start: addDays(today, -89), end: today },
    { id: 'last365', label: 'Last 12 months', start: addDays(today, -364), end: today },
    {
      id: 'forecast16',
      label: 'Next 16 days (forecast)',
      start: addDays(today, 1),
      end: maxEndDate(today),
    },
    { id: 'season', label: `Season to date (${season.name})`, start: season.start, end: today },
  ];
}
