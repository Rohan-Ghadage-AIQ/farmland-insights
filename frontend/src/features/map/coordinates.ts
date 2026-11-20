/** A position on the Earth in decimal degrees (WGS84). */
export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

export type CoordinateParseResult =
  | { readonly ok: true; readonly value: Coordinates }
  | { readonly ok: false; readonly error: string };

export const COORDINATE_HINT = 'Enter latitude and longitude, for example 23.6025, 72.4025';

type Axis = 'lat' | 'lon';

interface Component {
  /** Signed decimal degrees. */
  readonly value: number;
  /** Set when the text carried N, S, E or W. */
  readonly axis: Axis | null;
}

const fail = (error: string): CoordinateParseResult => ({ ok: false, error });

/** Maps the many degree, minute and second marks people paste onto plain ASCII ones. */
function normalise(text: string): string {
  return text
    .replace(/[º˚°]/g, '°')
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″”“]/g, '"')
    .trim();
}

/**
 * One half of a coordinate: decimal degrees (`23.6025`, `-12.5`, `23.6025°`) or degrees, minutes and
 * seconds (`23°36'9"`), with an optional N, S, E or W before or after. Null when it is not one.
 */
function parseComponent(raw: string): Component | null {
  let text = raw.trim().toUpperCase();
  let hemisphere: string | null = null;

  const leading = /^([NSEW])\s*(.+)$/.exec(text);
  if (leading?.[1] !== undefined && leading[2] !== undefined) {
    hemisphere = leading[1];
    text = leading[2];
  }
  const trailing = /^(.+?)\s*([NSEW])$/.exec(text);
  if (trailing?.[1] !== undefined && trailing[2] !== undefined) {
    if (hemisphere !== null) return null;
    hemisphere = trailing[2];
    text = trailing[1];
  }

  const match =
    /^([-+])?\s*(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|'')\s*)?$/.exec(
      text.trim(),
    );
  if (match?.[2] === undefined) return null;

  const minutes = match[3] === undefined ? 0 : Number(match[3]);
  const seconds = match[4] === undefined ? 0 : Number(match[4]);
  if (minutes >= 60 || seconds >= 60) return null;
  const magnitude = Number(match[2]) + minutes / 60 + seconds / 3600;

  if (hemisphere === null) return { value: match[1] === '-' ? -magnitude : magnitude, axis: null };
  // A minus sign next to a hemisphere letter contradicts itself.
  if (match[1] === '-') return null;
  const south = hemisphere === 'S' || hemisphere === 'W';
  return {
    value: south ? -magnitude : magnitude,
    axis: hemisphere === 'N' || hemisphere === 'S' ? 'lat' : 'lon',
  };
}

/** Splits "lat, lon" into its two halves, in whichever style it was written. */
function splitParts(text: string): [string, string] | null {
  if (/[;,]/.test(text)) {
    const parts = text.split(/[;,]/).map((part) => part.trim());
    const [first, second, ...rest] = parts;
    return first && second && rest.length === 0 ? [first, second] : null;
  }
  // "N 23.6 E 72.4" starts with a letter; "23.6 N 72.4 E" does not. Decide by the start, because
  // the two read the same way in the middle ("... 23.6 N 72.4 ...").
  if (/^[NSEW]/i.test(text)) {
    const prefixed = /^(.+?)\s+(?=[NSEW]\s*[-+]?\d)(.+)$/i.exec(text);
    if (prefixed?.[1] !== undefined && prefixed[2] !== undefined) return [prefixed[1], prefixed[2]];
  } else {
    const suffixed = /^(.*?\d\s*[NSEW])\s+(.+)$/i.exec(text);
    if (suffixed?.[1] !== undefined && suffixed[2] !== undefined) return [suffixed[1], suffixed[2]];
  }
  const words = text.split(/\s+/);
  const [first, second] = words;
  return words.length === 2 && first !== undefined && second !== undefined ? [first, second] : null;
}

/**
 * Reads a latitude and longitude typed or pasted by a person. Latitude comes first unless N, S, E or
 * W says otherwise. Understands decimal degrees and degrees-minutes-seconds. Never throws.
 */
export function parseCoordinates(input: string): CoordinateParseResult {
  const text = normalise(input);
  if (text === '') return fail(COORDINATE_HINT);

  const parts = splitParts(text);
  if (parts === null) return fail(COORDINATE_HINT);
  const first = parseComponent(parts[0]);
  const second = parseComponent(parts[1]);
  if (first === null || second === null) {
    return fail(`Could not read that. ${COORDINATE_HINT}`);
  }

  let lat: number;
  let lon: number;
  if (first.axis !== null && first.axis === second.axis) {
    return fail('Give one latitude (N or S) and one longitude (E or W).');
  }
  if (first.axis === 'lon' || second.axis === 'lat') {
    lat = second.value;
    lon = first.value;
  } else if (first.axis === 'lat' || second.axis === 'lon') {
    lat = first.value;
    lon = second.value;
  } else if (Math.abs(first.value) > 90 && Math.abs(second.value) <= 90) {
    // The first number cannot be a latitude, so the longitude was written first.
    lat = second.value;
    lon = first.value;
  } else {
    lat = first.value;
    lon = second.value;
  }

  if (Math.abs(lat) > 90) return fail('Latitude must be between -90 and 90.');
  if (Math.abs(lon) > 180) return fail('Longitude must be between -180 and 180.');
  return { ok: true, value: { lat, lon } };
}

/** `23.6025, 72.4025`, for showing a position back to the person. */
export function formatCoordinates({ lat, lon }: Coordinates): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
