import { describe, expect, it } from 'vitest';
import {
  NO_VALUE,
  formatAcres,
  formatCellEstimate,
  formatCount,
  formatHectares,
  formatIndex,
  formatMetricValue,
  formatNumber,
  formatPhysical,
} from './format';

describe('formatNumber', () => {
  it('fixes the number of decimals and groups thousands', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
    expect(formatNumber(2, 1)).toBe('2.0');
    expect(formatNumber(0.5, 0)).toBe('1');
  });

  it('shows a dash for NaN and infinities', () => {
    expect(NO_VALUE).toBe('—');
    expect(formatNumber(Number.NaN, 2)).toBe(NO_VALUE);
    expect(formatNumber(Number.POSITIVE_INFINITY, 2)).toBe(NO_VALUE);
  });

  it('does not show a negative zero', () => {
    expect(formatNumber(-0.001, 2)).toBe('0.00');
  });

  it('accepts another locale', () => {
    expect(formatNumber(1234.5, 1, 'de-DE')).toBe('1.234,5');
  });
});

describe('formatIndex / formatPhysical', () => {
  it('uses 2 decimals for indices and 1 for physical units', () => {
    expect(formatIndex(0.456)).toBe('0.46');
    expect(formatPhysical(24.84)).toBe('24.8');
  });
});

describe('formatMetricValue', () => {
  it('appends real units', () => {
    expect(formatMetricValue('t2m', 24.84)).toBe('24.8 °C');
    expect(formatMetricValue('soil_moist', 0.341)).toBe('0.34 m³/m³');
    expect(formatMetricValue('precip', 0.0412)).toBe('0.0 mm/h');
    expect(formatMetricValue('spi', -1.234)).toBe('-1.23 σ');
  });

  it('keeps % tight to the number', () => {
    expect(formatMetricValue('rh', 62.44)).toBe('62.4%');
  });

  it('shows unitless indices as a bare number', () => {
    expect(formatMetricValue('ndvi', 0.644)).toBe('0.64');
    expect(formatMetricValue('ai_dm', 12.345)).toBe('12.35');
  });

  it('does not tack descriptive ranges on as units', () => {
    expect(formatMetricValue('vci', 45.67)).toBe('45.7');
    expect(formatMetricValue('payout', 1)).toBe('1');
  });

  it('shows a dash when there is no value', () => {
    expect(formatMetricValue('ndvi', undefined)).toBe(NO_VALUE);
    expect(formatMetricValue('t2m', Number.NaN)).toBe(NO_VALUE);
  });
});

describe('counts and areas', () => {
  it('formats counts', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('formats area with units', () => {
    expect(formatHectares(12.3456)).toBe('12.35 ha');
    expect(formatAcres(30.5)).toBe('30.50 ac');
  });

  it('formats a cell estimate with correct plural', () => {
    expect(formatCellEstimate(240)).toBe('≈ 240 cells');
    expect(formatCellEstimate(1)).toBe('≈ 1 cell');
    expect(formatCellEstimate(12000)).toBe('≈ 12,000 cells');
  });
});
