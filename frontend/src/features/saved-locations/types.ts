import type { FarmAnalysisRequest, FarmAnalysisResponse, FarmFeatureCollection } from '@/domain';

/** The setup form's values, as they were when a location was saved. */
export interface SavedInputs {
  readonly crop: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly gridSize: number | null;
  /** The chosen satellite pass; absent in sessions saved before it existed. */
  readonly imageDate?: string;
}

/** A finished analysis and the exact request it came from. */
export interface SavedRun {
  readonly request: FarmAnalysisRequest;
  readonly response: FarmAnalysisResponse;
}

/**
 * A named field the person wants to come back to: its boundary, the crop, dates and grid size, and
 * the results that were on screen, so reopening it needs no new analysis.
 */
export interface SavedLocation {
  readonly id: string;
  readonly name: string;
  /** Epoch milliseconds. */
  readonly savedAt: number;
  readonly farm: FarmFeatureCollection;
  readonly inputs: SavedInputs;
  /** Null when the location was saved before any analysis had been run. */
  readonly run: SavedRun | null;
}

export const MAX_SAVED_LOCATIONS = 50;
export const MAX_NAME_LENGTH = 80;

/** Trims and collapses runs of spaces, so "My  field " and "My field" are one name. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Names match regardless of case and spacing. */
export function sameName(a: string, b: string): boolean {
  return normaliseName(a).toLowerCase() === normaliseName(b).toLowerCase();
}
