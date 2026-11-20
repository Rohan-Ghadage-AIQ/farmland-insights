import { z } from 'zod';
import type { components } from './generated/openapi';

/**
 * Runtime validation for every backend response. Shapes follow `generated/openapi.d.ts` and
 * the notes in docs/API_CONTRACT.md; `schemas.types.test.ts` fails the type check if the two
 * drift apart. Optional/nullable fields are normalised with `.default(...)` so consumers
 * never see `undefined`.
 */

export const healthResponseSchema = z.object({ status: z.literal('ok') });

export const authTokenResponseSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  access_token: z.string().min(1),
  token_type: z.string().default('bearer'),
  expires_in_minutes: z.number().positive(),
});

export const whoAmIResponseSchema = z.object({
  user_id: z.string(),
  email: z.string().nullable().default(null),
  active_org_id: z.string().nullable().default(null),
});

const positionSchema = z.union([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
]);

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(positionSchema)),
});

const multiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(positionSchema))),
});

/** Grid cells are clipped to the farm outline, so edge cells can be multi-part (section 1). */
const cellGeometrySchema = z.discriminatedUnion('type', [polygonSchema, multiPolygonSchema]);

/** `Structural`..`Agro_Meteo` are always all present; a missing input scores 0.0, never null. */
const cpiScoresSchema = z.object({
  Structural: z.number(),
  Chlorophyll: z.number(),
  Water_Drought: z.number(),
  Environmental: z.number(),
  Agro_Meteo: z.number(),
});

export const gridFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.union([z.string(), z.number()]).nullable().default(null),
  geometry: cellGeometrySchema,
  properties: z.object({
    // Section 4.6: the backend can send an int or a string.
    grid_id: z.union([z.string(), z.number()]),
    // Measured AND derived indices (section 4.1); farm-level weather repeats across cells (4.4).
    raw_metrics: z.record(z.string(), z.number()).default({}),
    cpi_scores: cpiScoresSchema,
    // Can contain entries for metrics with no value (section 4.3); the domain layer filters.
    advisories: z.record(z.string(), z.string()).default({}),
  }),
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Which satellite passes the per-cell indices came from; null when every pass was combined. */
export const imageryInfoSchema = z.object({
  image_date: isoDateSchema.nullable().default(null),
  optical_date: isoDateSchema.nullable().default(null),
  radar_date: isoDateSchema.nullable().default(null),
});

export const analysisResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(gridFeatureSchema).min(1),
  imagery: imageryInfoSchema.nullable().default(null),
});

/** One day a satellite photographed the farm (POST /satellite-dates). */
export const satellitePassSchema = z.object({
  date: isoDateSchema,
  optical: z.boolean(),
  /** Percent of the farm under cloud in the optical image; null when unknown or no optical image. */
  cloud_cover: z.number().nullable().default(null),
  radar: z.boolean(),
});

export const satelliteDatesResponseSchema = z.object({
  dates: z.array(satellitePassSchema).default([]),
});

export type HealthResponse = z.output<typeof healthResponseSchema>;
export type AuthTokenResponse = z.output<typeof authTokenResponseSchema>;
export type WhoAmIResponse = z.output<typeof whoAmIResponseSchema>;
export type GridFeature = z.output<typeof gridFeatureSchema>;
export type AnalysisResponse = z.output<typeof analysisResponseSchema>;
export type ImageryInfo = z.output<typeof imageryInfoSchema>;
export type SatellitePass = z.output<typeof satellitePassSchema>;
export type SatelliteDatesResponse = z.output<typeof satelliteDatesResponseSchema>;

// Request bodies are built by the app, so they use the generated types directly.
type Schemas = components['schemas'];
export type RegisterRequest = Schemas['RegisterUserRequest'];
export type TokenRequest = Schemas['GenerateTokenRequest'];
export type AnalysisRequest = Schemas['FarmAnalysisRequest'];
export type SatelliteDatesRequest = Schemas['SatelliteDatesRequest'];
export type CropCategory = Schemas['CropCategory'];
