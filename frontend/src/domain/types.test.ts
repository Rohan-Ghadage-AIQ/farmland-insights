import { describe, expect, it } from 'vitest';
import { parseIsoDate, toGridId } from './types';

describe('toGridId', () => {
  it('normalises numeric and string grid ids to the same string', () => {
    expect(toGridId(7)).toBe('7');
    expect(toGridId('7')).toBe('7');
    expect(toGridId(7)).toBe(toGridId('7'));
  });
});

describe('parseIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(parseIsoDate('2026-11-03')).toBe('2026-11-03');
    expect(parseIsoDate('2024-02-29')).toBe('2024-02-29');
  });

  it.each([
    '',
    '2026-1-3',
    '2026/11/03',
    '03-11-2026',
    '2026-13-01',
    '2026-02-30',
    '2025-02-29',
    'abc',
  ])('rejects %j', (value) => {
    expect(parseIsoDate(value)).toBeNull();
  });
});
