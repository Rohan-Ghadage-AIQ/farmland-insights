/**
 * Compile-time contract test. There is nothing to run: `pnpm typecheck` (part of `pnpm check`)
 * fails if a Zod schema and the types generated from openapi.json drift apart.
 *
 *  - OUTPUT -> generated: what the app consumes is never wider than the contract.
 *  - generated -> INPUT: every payload the contract allows is accepted by the schema.
 *
 * To pick up a backend change: `pnpm gen:api`, then fix the schema until this file compiles.
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { components } from './generated/openapi';
import type {
  analysisResponseSchema,
  authTokenResponseSchema,
  gridFeatureSchema,
  satelliteDatesResponseSchema,
  whoAmIResponseSchema,
} from './schemas';

type Gen = components['schemas'];

/** Fails to compile unless `Sub` is assignable to `Super`. */
type AssertAssignable<Sub extends Super, Super> = [Sub, Super];

// Schema output must satisfy the generated (server-side) type.
export type AuthTokenOut = AssertAssignable<
  z.output<typeof authTokenResponseSchema>,
  Gen['AuthTokenResponse']
>;
export type WhoAmIOut = AssertAssignable<
  z.output<typeof whoAmIResponseSchema>,
  Gen['WhoAmIResponse']
>;
export type GridFeatureOut = AssertAssignable<
  z.output<typeof gridFeatureSchema>,
  Gen['GridAnalysisFeature']
>;
export type AnalysisOut = AssertAssignable<
  z.output<typeof analysisResponseSchema>,
  Gen['FarmAnalysisResponse']
>;

// Anything the generated type allows the server to send must be accepted by the schema input.
export type AuthTokenIn = AssertAssignable<
  Gen['AuthTokenResponse'],
  z.input<typeof authTokenResponseSchema>
>;
export type WhoAmIIn = AssertAssignable<
  Gen['WhoAmIResponse'],
  z.input<typeof whoAmIResponseSchema>
>;
export type GridFeatureIn = AssertAssignable<
  Gen['GridAnalysisFeature'],
  z.input<typeof gridFeatureSchema>
>;
export type AnalysisIn = AssertAssignable<
  Gen['FarmAnalysisResponse'],
  z.input<typeof analysisResponseSchema>
>;
export type SatelliteDatesOut = AssertAssignable<
  z.output<typeof satelliteDatesResponseSchema>,
  Gen['SatelliteDatesResponse']
>;
export type SatelliteDatesIn = AssertAssignable<
  Gen['SatelliteDatesResponse'],
  z.input<typeof satelliteDatesResponseSchema>
>;

describe('schema <-> generated type contract', () => {
  it('is enforced by the compiler (pnpm typecheck), not at runtime', () => {
    expect(true).toBe(true);
  });
});
