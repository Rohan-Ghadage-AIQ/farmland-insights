import type { SatellitePass } from '@/api';

/** An optical pass with more of the farm under cloud than this is flagged (backend uses the same). */
export const CLEAR_SKY_MAX_CLOUD = 30;

export type SkyCondition = 'clear' | 'cloudy' | 'unknown' | 'radar-only';

export function skyCondition(pass: SatellitePass): SkyCondition {
  if (!pass.optical) return 'radar-only';
  if (pass.cloud_cover === null) return 'unknown';
  return pass.cloud_cover <= CLEAR_SKY_MAX_CLOUD ? 'clear' : 'cloudy';
}

/**
 * The pass to preselect: the newest clear optical one (it gives every index), else the newest
 * optical one whose cloud is unknown, else the newest radar pass, else the newest of any.
 * `passes` is newest first, as the API sends it.
 */
export function defaultPass(passes: readonly SatellitePass[]): SatellitePass | null {
  const order: readonly SkyCondition[] = ['clear', 'unknown', 'radar-only', 'cloudy'];
  for (const condition of order) {
    const match = passes.find((pass) => skyCondition(pass) === condition);
    if (match) return match;
  }
  return null;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Sat, 14 Nov 2026" for `2026-11-14` (read as a calendar day, not shifted by the time zone). */
export function formatPassDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  const when = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(when.getTime()) ? isoDate : DAY_FORMAT.format(when);
}

/** One line for screen readers and the step summary: what each sensor saw on the day. */
export function describePass(pass: SatellitePass): string {
  const parts: string[] = [];
  if (pass.optical) {
    parts.push(
      pass.cloud_cover === null
        ? 'optical, cloud unknown'
        : `optical, ${String(Math.round(pass.cloud_cover))}% cloud`,
    );
  }
  if (pass.radar) parts.push('radar');
  return parts.join(' + ');
}
