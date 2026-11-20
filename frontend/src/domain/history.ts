import { cropCategoryLabel } from './crops';
import type { FarmAnalysisRequest, FarmAnalysisResponse } from './types';

/** Spec 3.4 "Session history": keep the last 10 runs. */
export const MAX_HISTORY_ENTRIES = 10;

/** One saved run: the exact inputs, the response, and when it was saved (epoch ms). */
export interface HistoryEntry {
  readonly id: string;
  readonly savedAt: number;
  readonly request: FarmAnalysisRequest;
  readonly response: FarmAnalysisResponse;
}

/** A one-line label for the history list: crop, date range and cell count. */
export function summarizeHistoryEntry(entry: HistoryEntry): string {
  const crop = cropCategoryLabel(entry.request.crop_category);
  const cellCount = entry.response.features.length;
  const cellWord = cellCount === 1 ? 'cell' : 'cells';
  return `${crop} · ${entry.request.start_date} to ${entry.request.end_date} · ${String(cellCount)} ${cellWord}`;
}

/**
 * Sorts newest first and keeps at most `MAX_HISTORY_ENTRIES`. Does not mutate its input, so a
 * caller can safely pass the array it just read from storage.
 */
export function trimHistory(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_HISTORY_ENTRIES);
}
