import { sanitizeFeatureCollection } from './geo';
import type { CropCategoryKey, FarmAnalysisRequest, FarmFeatureCollection, IsoDate } from './types';

export const DEFAULT_GRID_SIZE = 50;
/** Quick picks for the grid cell side, in metres. */
export const GRID_SIZE_PRESETS = [10, 20, 50, 100] as const;

/** The backend accepts a strict integer above zero (and has no upper bound). */
export function isValidGridSize(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export interface AnalysisInputs {
  farm: FarmFeatureCollection;
  startDate: IsoDate;
  endDate: IsoDate;
  crop: CropCategoryKey;
  /** Cell side in whole metres. */
  gridSize: number;
  /** The satellite pass to analyse (from POST /satellite-dates). Omitted: every pass is combined. */
  imageDate?: IsoDate | null;
}

/** Builds the `POST /analyze` body. The farm is sanitized so foreign members cannot get it rejected. */
export function buildAnalysisRequest(inputs: AnalysisInputs): FarmAnalysisRequest {
  if (!isValidGridSize(inputs.gridSize)) {
    throw new RangeError(
      `Grid size must be a whole number of metres above zero, got ${inputs.gridSize}.`,
    );
  }
  return {
    farm_geojson: sanitizeFeatureCollection(inputs.farm),
    start_date: inputs.startDate,
    end_date: inputs.endDate,
    crop_category: inputs.crop,
    grid_size: inputs.gridSize,
    ...(inputs.imageDate ? { image_date: inputs.imageDate } : {}),
  };
}

/** JSON with object keys sorted, so equal data always gives equal text. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${(value as unknown[]).map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** cyrb53: a small, well-mixed 53-bit string hash. Not cryptographic; it only detects change. */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A stable fingerprint of the farm outline alone (ids and properties ignored). */
export function farmGeometryHash(farm: FarmFeatureCollection): string {
  const geometries = farm.features.map((feature) => feature.geometry);
  return cyrb53(canonicalJson(geometries)).toString(16).padStart(14, '0');
}

/**
 * A stable fingerprint of what the analysis depends on: geometry, dates, satellite pass, crop and
 * grid size.
 * Feature ids and properties are left out because they do not change the result. When the current
 * form's hash differs from the hash a result was computed with, the result is stale.
 */
export function inputsHash(request: FarmAnalysisRequest): string {
  const relevant = {
    geometries: request.farm_geojson.features.map((feature) => feature.geometry),
    start: request.start_date,
    end: request.end_date,
    crop: request.crop_category,
    gridSize: request.grid_size,
    // Left out when absent (canonicalJson drops undefined), so older results keep their hash.
    imageDate: request.image_date ?? undefined,
  };
  return cyrb53(canonicalJson(relevant)).toString(16).padStart(14, '0');
}
