import { summarizeHistoryEntry, type HistoryEntry } from '@/domain';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { formatSavedAt } from './format-saved-at';

export interface HistoryPanelProps {
  readonly entries: readonly HistoryEntry[];
  readonly isLoading: boolean;
  /** Shows that saved run again without re-running the analysis. */
  readonly onReopen: (entry: HistoryEntry) => void;
  readonly onClear: () => void;
}

/**
 * Session history (spec 3.4, Phase 7): the last 10 runs, newest first, each reopenable, plus a
 * "Clear history" action. Local-only: there is nothing here to send anywhere.
 */
export function HistoryPanel({ entries, isLoading, onReopen, onClear }: HistoryPanelProps) {
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">Loading saved runs…</span>
        <Skeleton lines={3} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No saved runs yet"
        description="Every analysis you run is kept here, on this device, so you can reopen the last 10 without running them again."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear history
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3 rounded-control border border-border p-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-base font-medium text-fg">
                {summarizeHistoryEntry(entry)}
              </span>
              <span className="text-sm text-fg-muted">Saved {formatSavedAt(entry.savedAt)}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onReopen(entry);
              }}
            >
              Reopen
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
