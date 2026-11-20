// Type-only import of the generated schema: erased at build time, so the layer stays free of runtime
// dependencies. A relative path is used because the @/api alias is banned in domain/ for runtime code.
import type { components } from '../api/generated/openapi';

type Schemas = components['schemas'];

/** Nominal typing: a value that passed through the matching constructor/guard. */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A grid cell id. The API sends int or string, so it is normalised to string. */
export type GridId = Brand<string, 'GridId'>;
/** One of the 12 crop category keys the API accepts. */
export type CropCategoryKey = Brand<Schemas['CropCategory'], 'CropCategoryKey'>;
/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = Brand<string, 'IsoDate'>;

export type CropCategory = Schemas['CropCategory'];
export type FarmFeatureCollection = Schemas['FarmFeatureCollection'];
export type FarmFeature = Schemas['FarmFeature'];
export type FarmAnalysisRequest = Schemas['FarmAnalysisRequest'];
export type FarmAnalysisResponse = Schemas['FarmAnalysisResponse'];
export type GridAnalysisFeature = Schemas['GridAnalysisFeature'];
export type CpiScores = Schemas['CPIScores'];
export type ClusterKey = keyof CpiScores;

export function toGridId(value: string | number): GridId {
  return String(value) as GridId;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns the date if `value` is a real `YYYY-MM-DD` calendar date, otherwise null. */
export function parseIsoDate(value: string): IsoDate | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return roundTrips ? (value as IsoDate) : null;
}
