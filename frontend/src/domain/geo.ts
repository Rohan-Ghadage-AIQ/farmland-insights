import area from '@turf/area';
import kinks from '@turf/kinks';
import { polygon as turfPolygon } from '@turf/helpers';
import type { FarmFeatureCollection } from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

// ---------------------------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------------------------

export interface SanitizeOptions {
  /** Drop the third (altitude) value of every position. The backend accepts it but ignores it. */
  dropAltitude?: boolean;
}

/** Copies a coordinates tree. Positions (lists of numbers) lose their altitude when asked. */
function copyCoordinates(value: unknown, dropAltitude: boolean): unknown {
  if (!Array.isArray(value)) return value;
  const items: unknown[] = value;
  if (items.length > 0 && items.every(isNumber)) {
    return dropAltitude && items.length > 2 ? items.slice(0, 2) : [...items];
  }
  return items.map((item) => copyCoordinates(item, dropAltitude));
}

function sanitizeGeometry(geometry: unknown, dropAltitude: boolean): unknown {
  if (!isRecord(geometry)) return geometry;
  const clean: UnknownRecord = { type: geometry.type };
  if (Object.hasOwn(geometry, 'coordinates')) {
    clean.coordinates = copyCoordinates(geometry.coordinates, dropAltitude);
  }
  return clean;
}

function sanitizeFeature(feature: unknown, dropAltitude: boolean): unknown {
  if (!isRecord(feature)) return feature;
  const clean: UnknownRecord = {};
  if (Object.hasOwn(feature, 'type')) clean.type = feature.type;
  if (feature.id !== undefined) clean.id = feature.id;
  clean.geometry = sanitizeGeometry(feature.geometry, dropAltitude);
  clean.properties = isRecord(feature.properties) ? { ...feature.properties } : {};
  return clean;
}

/**
 * Strips everything the backend would reject (`extra="forbid"`): bbox, crs, name and other foreign
 * members. Keeps only `type` and `features[].{type,id,geometry,properties}`. Input that is not a
 * FeatureCollection is returned unchanged so {@link validateFarmGeometry} can explain it.
 */
export function sanitizeFeatureCollection(
  input: FarmFeatureCollection,
  options?: SanitizeOptions,
): FarmFeatureCollection;
export function sanitizeFeatureCollection(input: unknown, options?: SanitizeOptions): unknown;
export function sanitizeFeatureCollection(input: unknown, options: SanitizeOptions = {}): unknown {
  if (!isRecord(input) || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    return input;
  }
  const dropAltitude = options.dropAltitude ?? false;
  const features: unknown[] = input.features;
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => sanitizeFeature(feature, dropAltitude)),
  };
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export type GeoIssueCode =
  | 'not_feature_collection'
  | 'empty_features'
  | 'invalid_feature'
  | 'unsupported_geometry_type'
  | 'empty_geometry'
  | 'invalid_coordinates'
  | 'ring_too_short'
  | 'ring_not_closed'
  | 'out_of_bounds'
  | 'self_intersection';

export interface GeoIssue {
  code: GeoIssueCode;
  /** Plain-language explanation for the person drawing or uploading the field. */
  message: string;
  /** Zero-based index of the offending feature, when the problem belongs to one. */
  featureIndex?: number;
}

export type GeoValidation =
  { ok: true; collection: FarmFeatureCollection } | { ok: false; issues: GeoIssue[] };

const MESSAGES: Record<GeoIssueCode, (feature: number, detail: string) => string> = {
  not_feature_collection: () =>
    'This is not a GeoJSON FeatureCollection. Use a FeatureCollection that contains your field outline.',
  empty_features: () => 'There are no features. Draw or add at least one field outline.',
  invalid_feature: (n) => `Feature ${n} is not a valid GeoJSON Feature.`,
  unsupported_geometry_type: (n, type) =>
    `Feature ${n} is a ${type}. Only Polygon and MultiPolygon field outlines are supported.`,
  empty_geometry: (n) => `Feature ${n} has an empty shape. Draw the field outline again.`,
  invalid_coordinates: (n) =>
    `Feature ${n} has coordinates that are not numbers in [longitude, latitude] form.`,
  ring_too_short: (n) =>
    `An outline in feature ${n} has fewer than 4 points. It needs at least 3 corners plus a closing point.`,
  ring_not_closed: (n) =>
    `An outline in feature ${n} is not closed. Its last point must be the same as its first.`,
  out_of_bounds: (n) =>
    `Feature ${n} has points outside the valid range (longitude -180 to 180, latitude -90 to 90). Check that points are in [longitude, latitude] order.`,
  self_intersection: (n) =>
    `An outline in feature ${n} crosses itself. Redraw it so its edges do not cross.`,
};

function issue(code: GeoIssueCode, featureIndex: number, detail = ''): GeoIssue {
  return { code, message: MESSAGES[code](featureIndex + 1, detail), featureIndex };
}

function isPosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    value.every(Number.isFinite)
  );
}

function samePosition(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function inBounds(position: number[]): boolean {
  const [lng = 0, lat = 0] = position;
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

/** Returns the first structural problem of a ring, or null when it is sound. */
function ringProblem(ring: unknown): GeoIssueCode | null {
  if (!Array.isArray(ring)) return 'invalid_coordinates';
  const positions: unknown[] = ring;
  if (positions.length === 0) return 'empty_geometry';
  if (!positions.every(isPosition)) return 'invalid_coordinates';
  const valid = positions;
  if (valid.length < 4) return 'ring_too_short';
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (first === undefined || last === undefined || !samePosition(first, last))
    return 'ring_not_closed';
  if (!valid.every(inBounds)) return 'out_of_bounds';
  return null;
}

/** Splits a Polygon or MultiPolygon into its polygons (each a list of rings), or reports why it cannot. */
function polygonsOf(
  type: string,
  coordinates: unknown,
): { polygons: unknown[][] } | { problem: GeoIssueCode } {
  if (!Array.isArray(coordinates)) return { problem: 'invalid_coordinates' };
  const items: unknown[] = coordinates;
  if (items.length === 0) return { problem: 'empty_geometry' };
  if (type === 'Polygon') return { polygons: [items] };
  const parts: unknown[][] = [];
  for (const part of items) {
    if (!Array.isArray(part)) return { problem: 'invalid_coordinates' };
    const rings: unknown[] = part;
    if (rings.length === 0) return { problem: 'empty_geometry' };
    parts.push(rings);
  }
  return { polygons: parts };
}

function crossesItself(rings: unknown[]): boolean {
  const shape = turfPolygon(rings as number[][][]);
  return kinks(shape).features.length > 0;
}

function featureIssues(feature: unknown, index: number): GeoIssue[] {
  if (!isRecord(feature) || feature.type !== 'Feature') return [issue('invalid_feature', index)];
  const geometry = feature.geometry;
  if (!isRecord(geometry)) return [issue('empty_geometry', index)];

  const type = geometry.type;
  if (type !== 'Polygon' && type !== 'MultiPolygon') {
    return [
      issue('unsupported_geometry_type', index, typeof type === 'string' ? type : 'unknown shape'),
    ];
  }

  const split = polygonsOf(type, geometry.coordinates);
  if ('problem' in split) return [issue(split.problem, index)];

  // One issue per kind is enough, even when a MultiPolygon repeats the same mistake.
  const found = new Set<GeoIssueCode>();
  const sound: unknown[][] = [];
  for (const rings of split.polygons) {
    const problems = rings.map(ringProblem).filter((code): code is GeoIssueCode => code !== null);
    problems.forEach((code) => found.add(code));
    if (problems.length === 0) sound.push(rings);
  }
  if (sound.some(crossesItself)) found.add('self_intersection');
  return [...found].map((code) => issue(code, index));
}

/**
 * Validates a farm outline the way the backend will, but with plain-language messages.
 * The input is sanitized first; on success the sanitized collection is returned.
 * Holes that lie outside their shell are not detected here; the server still checks them.
 */
export function validateFarmGeometry(input: unknown): GeoValidation {
  if (!isRecord(input) || input.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    return {
      ok: false,
      issues: [{ code: 'not_feature_collection', message: MESSAGES.not_feature_collection(0, '') }],
    };
  }
  const features: unknown[] = input.features;
  if (features.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'empty_features', message: MESSAGES.empty_features(0, '') }],
    };
  }

  const collection = sanitizeFeatureCollection(input);
  const issues = features.flatMap((feature, index) => featureIssues(feature, index));
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, collection: collection as FarmFeatureCollection };
}

// ---------------------------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------------------------

const SQUARE_METRES_PER_HECTARE = 10_000;
const ACRES_PER_HECTARE = 2.47105381;

type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** Every ring of every feature. */
function ringsOf(collection: FarmFeatureCollection): number[][][] {
  return collection.features.flatMap(({ geometry }) =>
    geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat(),
  );
}

/** Geodesic area of all features, in hectares (holes are subtracted). */
export function areaHectares(collection: FarmFeatureCollection): number {
  const squareMetres = collection.features.reduce((sum, { geometry }) => sum + area(geometry), 0);
  return squareMetres / SQUARE_METRES_PER_HECTARE;
}

export function areaAcres(collection: FarmFeatureCollection): number {
  return areaHectares(collection) * ACRES_PER_HECTARE;
}

/** Number of distinct vertices; the repeated closing position of each ring is not counted. */
export function vertexCount(collection: FarmFeatureCollection): number {
  return ringsOf(collection).reduce((sum, ring) => sum + Math.max(0, ring.length - 1), 0);
}

/** `[minLng, minLat, maxLng, maxLat]` over all features. */
export function farmBbox(collection: FarmFeatureCollection): Bbox {
  const box: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of ringsOf(collection)) {
    for (const [lng = 0, lat = 0] of ring) {
      box[0] = Math.min(box[0], lng);
      box[1] = Math.min(box[1], lat);
      box[2] = Math.max(box[2], lng);
      box[3] = Math.max(box[3], lat);
    }
  }
  return box;
}

/** Rough number of grid cells: field area divided by cell area (`gridSize` is the cell side in metres). */
export function estimateCellCount(areaInHectares: number, gridSize: number): number {
  if (
    !Number.isFinite(areaInHectares) ||
    !Number.isFinite(gridSize) ||
    areaInHectares <= 0 ||
    gridSize <= 0
  ) {
    return 0;
  }
  const cells = (areaInHectares * SQUARE_METRES_PER_HECTARE) / (gridSize * gridSize);
  // The subtraction keeps float noise from rounding an exact 400.0000000001 up to 401.
  return Math.max(1, Math.ceil(cells - 1e-9));
}

/** Above this many cells, warn that the run may take several minutes. */
export const CELL_WARN_THRESHOLD = 2000;
/** Above this many cells, ask the user to confirm before running. */
export const CELL_CONFIRM_THRESHOLD = 10000;

export type CellWarningLevel = 'ok' | 'warn' | 'confirm';

export function cellWarningLevel(cellCount: number): CellWarningLevel {
  if (cellCount > CELL_CONFIRM_THRESHOLD) return 'confirm';
  if (cellCount > CELL_WARN_THRESHOLD) return 'warn';
  return 'ok';
}
