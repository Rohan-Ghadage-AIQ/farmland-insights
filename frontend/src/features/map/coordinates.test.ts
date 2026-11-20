import { describe, expect, it } from 'vitest';
import { COORDINATE_HINT, formatCoordinates, parseCoordinates } from './coordinates';

function ok(input: string) {
  const result = parseCoordinates(input);
  if (!result.ok) throw new Error(`expected "${input}" to parse, got: ${result.error}`);
  return result.value;
}

function error(input: string): string {
  const result = parseCoordinates(input);
  if (result.ok) throw new Error(`expected "${input}" to fail`);
  return result.error;
}

describe('parseCoordinates: decimal degrees', () => {
  it.each([
    '23.6025, 72.4025',
    '23.6025,72.4025',
    '23.6025 72.4025',
    '  23.6025 ,  72.4025  ',
    '23.6025; 72.4025',
    '23.6025°, 72.4025°',
  ])('reads latitude then longitude from %j', (input) => {
    expect(ok(input)).toEqual({ lat: 23.6025, lon: 72.4025 });
  });

  it('reads negative values for the southern and western hemispheres', () => {
    expect(ok('-12.5, -45.25')).toEqual({ lat: -12.5, lon: -45.25 });
  });

  it('accepts whole numbers and the extremes', () => {
    expect(ok('0, 0')).toEqual({ lat: 0, lon: 0 });
    expect(ok('90, 180')).toEqual({ lat: 90, lon: 180 });
    expect(ok('-90, -180')).toEqual({ lat: -90, lon: -180 });
  });
});

describe('parseCoordinates: hemisphere letters', () => {
  it.each([
    'N 23.6025 E 72.4025',
    '23.6025N 72.4025E',
    '23.6025 N, 72.4025 E',
    '23.6025 N 72.4025 E',
    'n23.6025, e72.4025',
    'N23.6025 E72.4025',
  ])('reads %j', (input) => {
    expect(ok(input)).toEqual({ lat: 23.6025, lon: 72.4025 });
  });

  it('makes S and W negative', () => {
    expect(ok('12.5 S, 45 W')).toEqual({ lat: -12.5, lon: -45 });
  });

  it('lets the letters decide the order, so longitude can come first', () => {
    expect(ok('72.4025 E, 23.6025 N')).toEqual({ lat: 23.6025, lon: 72.4025 });
  });

  it('rejects two latitudes or two longitudes', () => {
    expect(error('23.6N, 10N')).toMatch(/one latitude/i);
    expect(error('23.6E, 10E')).toMatch(/one latitude/i);
  });

  it('rejects a minus sign together with a hemisphere letter', () => {
    expect(error('-23.6 N, 72.4 E')).toMatch(/could not read/i);
  });
});

describe('parseCoordinates: degrees, minutes, seconds', () => {
  it('reads 23°36\'9"N 72°24\'9"E', () => {
    const value = ok('23°36\'9"N 72°24\'9"E');
    expect(value.lat).toBeCloseTo(23.6025, 6);
    expect(value.lon).toBeCloseTo(72.4025, 6);
  });

  it('reads it with a comma and curly marks pasted from a document', () => {
    const value = ok('23°36′9″N, 72°24′9″E');
    expect(value.lat).toBeCloseTo(23.6025, 6);
    expect(value.lon).toBeCloseTo(72.4025, 6);
  });

  it('reads degrees and minutes only, and southern or western values', () => {
    const value = ok("12°30'S, 45°15'W");
    expect(value.lat).toBeCloseTo(-12.5, 6);
    expect(value.lon).toBeCloseTo(-45.25, 6);
  });

  it('rejects minutes or seconds of 60 or more', () => {
    expect(error("23°60'N, 72°10'E")).toMatch(/could not read/i);
    expect(error("23°10'60\"N, 72°10'E")).toMatch(/could not read/i);
  });
});

describe('parseCoordinates: longitude written first', () => {
  it('swaps when the first number cannot be a latitude', () => {
    expect(ok('120.5, 23.6')).toEqual({ lat: 23.6, lon: 120.5 });
  });

  it('does not guess when both are valid latitudes: first is latitude', () => {
    expect(ok('72.4, 23.6')).toEqual({ lat: 72.4, lon: 23.6 });
  });
});

describe('parseCoordinates: problems', () => {
  it('explains an empty box', () => {
    expect(error('')).toBe(COORDINATE_HINT);
    expect(error('   ')).toBe(COORDINATE_HINT);
  });

  it.each(['23.6025', '23.6025, 72.4025, 5', 'one, two', 'abc', '23.6025 72.4025 5'])(
    'rejects %j with a message, never throwing',
    (input) => {
      expect(error(input)).toBeTruthy();
    },
  );

  it('names the out-of-range value', () => {
    expect(error('95, 100')).toMatch(/latitude must be between -90 and 90/i);
    expect(error('10, 200')).toMatch(/longitude must be between -180 and 180/i);
    expect(error('-91, 100')).toMatch(/latitude/i);
  });

  it('rejects numbers that are not finite or have odd text around them', () => {
    expect(error('NaN, 10')).toBeTruthy();
    expect(error('23.6.1, 72.4')).toBeTruthy();
    expect(error('23.6 abc, 72.4')).toBeTruthy();
  });
});

describe('formatCoordinates', () => {
  it('shows four decimals, about 10 metres', () => {
    expect(formatCoordinates({ lat: 23.6025, lon: 72.4025 })).toBe('23.6025, 72.4025');
    expect(formatCoordinates({ lat: -12.5, lon: 45 })).toBe('-12.5000, 45.0000');
  });
});
