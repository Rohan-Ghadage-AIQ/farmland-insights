/**
 * Calendar-date helpers on ISO strings ("YYYY-MM-DD"), computed in UTC so results never shift
 * with the viewer's time zone or daylight saving. Weeks start on Monday.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const WEEKDAY_NAMES = WEEKDAYS;

function toUtcMs(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Not an ISO date: "${iso}"`);
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True only for real calendar dates in YYYY-MM-DD form (rejects 2025-02-29). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return fromUtcMs(toUtcMs(value)) === value;
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** First day of the month, `months` away. */
export function addMonths(iso: string, months: number): string {
  const date = new Date(toUtcMs(startOfMonth(iso)));
  return fromUtcMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** Same day-of-month, `months` away, clamped to the length of the target month. */
export function shiftMonths(iso: string, months: number): string {
  const day = Number(iso.slice(8, 10));
  const first = addMonths(iso, months);
  const last = Number(addDays(addMonths(first, 1), -1).slice(8, 10));
  return `${first.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** Number of days from `start` to `end`, counting both ends. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / DAY_MS) + 1;
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(iso: string): number {
  return (new Date(toUtcMs(iso)).getUTCDay() + 6) % 7;
}

/** Weeks (Monday first) covering the month of `iso`, padded with neighbouring-month days. */
export function buildMonthGrid(iso: string): string[][] {
  const first = startOfMonth(iso);
  const offset = weekdayIndex(first);
  const length = daysInclusive(first, addDays(addMonths(first, 1), -1));
  const rows = Math.ceil((offset + length) / 7);
  const gridStart = addDays(first, -offset);
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => addDays(gridStart, row * 7 + col)),
  );
}

/** "Sunday, 9 March 2025": written out so it reads the same in every locale and is spoken in full. */
export function dayLabel(iso: string): string {
  const weekday = WEEKDAYS[weekdayIndex(iso)] ?? '';
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
  return `${weekday}, ${String(Number(iso.slice(8, 10)))} ${month} ${iso.slice(0, 4)}`;
}

/** "March 2025". */
export function monthLabel(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;
}

/** The viewer's local calendar day, as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
