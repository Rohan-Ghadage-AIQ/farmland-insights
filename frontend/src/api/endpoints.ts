import type { ApiClient } from './client';
import {
  analysisResponseSchema,
  authTokenResponseSchema,
  healthResponseSchema,
  satelliteDatesResponseSchema,
  whoAmIResponseSchema,
  type AnalysisRequest,
  type AnalysisResponse,
  type AuthTokenResponse,
  type HealthResponse,
  type RegisterRequest,
  type SatelliteDatesRequest,
  type SatelliteDatesResponse,
  type TokenRequest,
  type WhoAmIResponse,
} from './schemas';

/**
 * /analyze fans out to Open-Meteo and Earth Engine, and its real latency is UNVERIFIED
 * (API_CONTRACT section 7). Three minutes is a deliberately generous ceiling; the UI shows
 * elapsed time and a Cancel button rather than pretending to know progress.
 */
export const ANALYZE_TIMEOUT_MS = 180_000;
/** Listing passes is one Earth Engine query, but cold starts can take a while. */
export const SATELLITE_DATES_TIMEOUT_MS = 60_000;

export interface Endpoints {
  health(signal?: AbortSignal): Promise<HealthResponse>;
  register(body: RegisterRequest, signal?: AbortSignal): Promise<AuthTokenResponse>;
  token(body: TokenRequest, signal?: AbortSignal): Promise<AuthTokenResponse>;
  whoami(signal?: AbortSignal): Promise<WhoAmIResponse>;
  analyze(body: AnalysisRequest, signal?: AbortSignal): Promise<AnalysisResponse>;
  satelliteDates(
    body: SatelliteDatesRequest,
    signal?: AbortSignal,
  ): Promise<SatelliteDatesResponse>;
}

/** Spreads `signal` only when defined (exactOptionalPropertyTypes). */
function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

/** Every route in API_CONTRACT section 1, typed and validated. */
export function createEndpoints(client: ApiClient): Endpoints {
  return {
    health: (signal) =>
      client.request({
        path: '/health',
        schema: healthResponseSchema,
        auth: false,
        ...withSignal(signal),
      }),
    register: (body, signal) =>
      client.request({
        method: 'POST',
        path: '/api/v1/auth/register',
        body,
        schema: authTokenResponseSchema,
        auth: false,
        ...withSignal(signal),
      }),
    token: (body, signal) =>
      client.request({
        method: 'POST',
        path: '/api/v1/auth/token',
        body,
        schema: authTokenResponseSchema,
        auth: false,
        ...withSignal(signal),
      }),
    whoami: (signal) =>
      client.request({
        path: '/api/v1/auth/whoami',
        schema: whoAmIResponseSchema,
        ...withSignal(signal),
      }),
    analyze: (body, signal) =>
      client.request({
        method: 'POST',
        path: '/api/v1/analyze',
        body,
        schema: analysisResponseSchema,
        timeoutMs: ANALYZE_TIMEOUT_MS,
        ...withSignal(signal),
      }),
    satelliteDates: (body, signal) =>
      client.request({
        method: 'POST',
        path: '/api/v1/satellite-dates',
        body,
        schema: satelliteDatesResponseSchema,
        timeoutMs: SATELLITE_DATES_TIMEOUT_MS,
        ...withSignal(signal),
      }),
  };
}
