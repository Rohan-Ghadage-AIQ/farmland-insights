import { describe, expect, it } from 'vitest';
import type { SatellitePass } from '@/api';
import { defaultPass, describePass, formatPassDate, skyCondition } from './satellite-dates';

const pass = (
  date: string,
  optical: boolean,
  cloud: number | null,
  radar: boolean,
): SatellitePass => ({
  date,
  optical,
  cloud_cover: cloud,
  radar,
});

describe('satellite date choice', () => {
  it('classifies the sky for each pass', () => {
    expect(skyCondition(pass('2026-01-01', true, 30, false))).toBe('clear');
    expect(skyCondition(pass('2026-01-01', true, 30.1, false))).toBe('cloudy');
    expect(skyCondition(pass('2026-01-01', true, null, false))).toBe('unknown');
    expect(skyCondition(pass('2026-01-01', false, null, true))).toBe('radar-only');
  });

  it('prefers the newest clear optical pass, then unknown cloud, then radar, then cloudy', () => {
    const cloudy = pass('2026-01-09', true, 90, false);
    const radar = pass('2026-01-08', false, null, true);
    const unknown = pass('2026-01-07', true, null, false);
    const clear = pass('2026-01-03', true, 2, false);
    expect(defaultPass([cloudy, radar, unknown, clear])).toBe(clear);
    expect(defaultPass([cloudy, radar, unknown])).toBe(unknown);
    expect(defaultPass([cloudy, radar])).toBe(radar);
    expect(defaultPass([cloudy])).toBe(cloudy);
    expect(defaultPass([])).toBeNull();
  });

  it('formats calendar days without a time-zone shift', () => {
    expect(formatPassDate('2026-11-14')).toBe('Sat, 14 Nov 2026');
    expect(formatPassDate('not-a-date')).toBe('not-a-date');
  });

  it('describes what each sensor saw', () => {
    expect(describePass(pass('2026-01-01', true, 12.4, true))).toBe('optical, 12% cloud + radar');
    expect(describePass(pass('2026-01-01', false, null, true))).toBe('radar');
  });
});
