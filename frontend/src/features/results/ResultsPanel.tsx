import { useEffect, useState } from 'react';
import {
  farmClusterStats,
  gridIdOf,
  type ClusterKey,
  type FarmAnalysisResponse,
  type GridAnalysisFeature,
} from '@/domain';
import { Badge, Button, EmptyState, ErrorBanner, Skeleton } from '@/components/ui';
import { CellDetailPanel } from './CellDetailPanel';
import { ExportControls, type ReportSource } from './ExportControls';
import { FarmSummaryPanel } from './FarmSummaryPanel';
import { TableView } from './TableView';
import { useCellSelection, type UseCellSelectionResult } from './use-cell-selection';
import type { GridDirection } from './grid-navigation';

export type ResultsStatus = 'idle' | 'loading' | 'error' | 'success';

export interface ResultsError {
  readonly title: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ResultsPanelProps {
  readonly status: ResultsStatus;
  readonly cells?: readonly GridAnalysisFeature[];
  readonly response?: FarmAnalysisResponse;
  readonly error?: ResultsError;
  readonly onRetry?: () => void;
  /** True once the form inputs have changed since this result was fetched (never mix the two). */
  readonly stale?: boolean;
  /** `useMapActions().exportPng`, supplied once the map exists (see ExportControls). */
  readonly exportMapPng?: () => string;
  /** Inputs and map capture for the HTML report export (see ExportControls). */
  readonly report?: ReportSource;
  /**
   * An externally-owned `useCellSelection` (e.g. from the map slot), so the selected cell and
   * highlight set are shared with the map's `GridOverlay` instead of living only in this panel.
   * Defaults to an internal one, which keeps every existing caller unchanged.
   */
  readonly selection?: UseCellSelectionResult;
}

const ARROW_DIRECTIONS: Record<string, GridDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName);
}

function LoadingPanel() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading results…</span>
      <Skeleton height={16} width="60%" />
      <Skeleton lines={5} />
      <Skeleton height={80} />
    </div>
  );
}

/**
 * The inspector's root: farm summary or cell detail, a table alternative, export controls, and the
 * empty / loading / error / stale states every panel needs (spec 3.4 and 3.6). Owns the selected
 * cell and highlight set, the one state those two slots and the map slot need to share.
 */
export function ResultsPanel({
  status,
  cells = [],
  response,
  error,
  onRetry,
  stale = false,
  exportMapPng,
  report,
  selection: externalSelection,
}: ResultsPanelProps) {
  const [view, setView] = useState<'inspector' | 'table'>('inspector');
  // Always called (hooks cannot be conditional); only used when the caller did not supply one.
  const internalSelection = useCellSelection(cells);
  const selection = externalSelection ?? internalSelection;

  useEffect(() => {
    if (status !== 'success') return undefined;
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const direction = ARROW_DIRECTIONS[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      selection.move(direction);
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [status, selection]);

  if (status === 'idle') {
    return (
      <EmptyState
        title="No results yet"
        description="Run an analysis to see the farm's CPI scores, raw metrics and recommended actions."
      />
    );
  }

  if (status === 'loading') {
    return <LoadingPanel />;
  }

  if (status === 'error') {
    return (
      <ErrorBanner
        title={error?.title ?? 'Something went wrong'}
        message={error?.message ?? 'The analysis could not be completed.'}
        details={error?.details}
        {...(onRetry === undefined ? {} : { onRetry })}
      />
    );
  }

  const selectedId = selection.selectedId;
  const selectedCell = cells.find((cell) => String(gridIdOf(cell)) === selectedId) ?? null;
  const ids = cells.map((cell) => String(gridIdOf(cell)));
  const selectedIndex = selectedId === null ? -1 : ids.indexOf(selectedId);
  const farmMeans: Record<ClusterKey, number | null> = Object.fromEntries(
    Object.entries(farmClusterStats(cells)).map(([key, stats]) => [key, stats.mean]),
  ) as Record<ClusterKey, number | null>;

  return (
    <div className="flex flex-col gap-4">
      {stale ? (
        <div role="status" aria-live="polite" className="self-start">
          <Badge tone="warning">Inputs changed — re-run to update</Badge>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant={view === 'inspector' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            setView('inspector');
          }}
        >
          View as inspector
        </Button>
        <Button
          variant={view === 'table' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => {
            setView('table');
          }}
        >
          View as table
        </Button>
      </div>

      {view === 'table' ? (
        <TableView
          cells={cells}
          selectedId={selectedId}
          highlightIds={selection.highlightIds}
          onSelect={(id) => {
            // Selecting a row is equivalent to clicking the cell on the map: show its detail.
            selection.select(id);
            setView('inspector');
          }}
        />
      ) : selectedCell === null ? (
        <FarmSummaryPanel cells={cells} onHighlight={selection.highlight} />
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              selection.select(null);
            }}
          >
            ← Back to farm summary
          </Button>
          <CellDetailPanel
            cell={selectedCell}
            farmMeans={farmMeans}
            onPrevious={selection.previous}
            onNext={selection.next}
            hasPrevious={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < ids.length - 1}
          />
        </>
      )}

      {response !== undefined ? (
        <ExportControls
          response={response}
          cells={cells}
          exportMapPng={exportMapPng}
          report={report}
        />
      ) : null}
    </div>
  );
}
