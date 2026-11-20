import { useMemo, useRef, useState } from 'react';
import {
  CLUSTERS,
  clusterScore,
  formatIndex,
  gridIdOf,
  type ClusterKey,
  type GridAnalysisFeature,
} from '@/domain';
import { EmptyState } from '@/components/ui';
import { cn } from '@/components/ui';

export interface TableViewProps {
  readonly cells: readonly GridAnalysisFeature[];
  readonly selectedId?: string | null;
  readonly onSelect?: (id: string) => void;
  /** Rows to emphasise, e.g. the cells a clicked advisory "applies to" (click-to-highlight). */
  readonly highlightIds?: readonly string[];
}

type SortKey = 'gridId' | 'advisories' | ClusterKey;
type SortDirection = 'ascending' | 'descending';

interface Row {
  readonly id: string;
  readonly advisoryCount: number;
  readonly scores: Record<ClusterKey, number | null>;
}

// A cluster with no data sorts after every real score, in either direction, rather than being
// mistaken for the lowest score.
const NO_DATA_RANK = Number.POSITIVE_INFINITY;

function compareRows(a: Row, b: Row, key: SortKey): number {
  if (key === 'gridId') return a.id.localeCompare(b.id, undefined, { numeric: true });
  if (key === 'advisories') return a.advisoryCount - b.advisoryCount;
  const aValue = a.scores[key] ?? NO_DATA_RANK;
  const bValue = b.scores[key] ?? NO_DATA_RANK;
  return aValue - bValue;
}

/**
 * The accessible "View as table" alternative to the map grid (spec 3.6 / WCAG 2.2 AA): every
 * column is sortable from the keyboard, and each row can be selected like a map click.
 */
export function TableView({
  cells,
  selectedId = null,
  onSelect,
  highlightIds = [],
}: TableViewProps) {
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds]);
  const [sortKey, setSortKey] = useState<SortKey>('gridId');
  const [direction, setDirection] = useState<SortDirection>('ascending');
  // Roving tabindex (WAI-ARIA grid pattern): only the "active" row is a tab stop, and
  // ArrowUp/ArrowDown/Home/End move it, so reaching row N never takes N Tab presses.
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const rows = useMemo<Row[]>(() => {
    const built = cells.map((cell): Row => {
      const scores = Object.fromEntries(
        CLUSTERS.map(({ key }) => [key, clusterScore(cell, key)]),
      ) as Record<ClusterKey, number | null>;
      return {
        id: String(gridIdOf(cell)),
        advisoryCount: Object.keys(cell.properties.advisories ?? {}).length,
        scores,
      };
    });
    const sorted = [...built].sort((a, b) => compareRows(a, b, sortKey));
    return direction === 'ascending' ? sorted : sorted.reverse();
  }, [cells, sortKey, direction]);

  if (cells.length === 0) {
    return (
      <EmptyState
        title="No cells to show"
        description="Run an analysis to see the cell grid as a table."
      />
    );
  }

  const activateSort = (key: SortKey): void => {
    if (key === sortKey) {
      setDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'));
    } else {
      setSortKey(key);
      setDirection('ascending');
    }
  };

  const columns: { readonly key: SortKey; readonly label: string }[] = [
    { key: 'gridId', label: 'Grid id' },
    ...CLUSTERS.map(({ key, label }) => ({ key, label })),
    { key: 'advisories', label: 'Advisories' },
  ];

  const selectRow = (id: string): void => {
    onSelect?.(id);
  };

  const clampedFocusedIndex = Math.min(focusedIndex, rows.length - 1);

  const focusRow = (index: number): void => {
    const clamped = Math.max(0, Math.min(index, rows.length - 1));
    setFocusedIndex(clamped);
    rowRefs.current[clamped]?.focus();
  };

  return (
    <table aria-label="Cells" className="w-full border-collapse text-base">
      <caption className="sr-only">
        Grid cells, sortable by any column. {cells.length} cells in total.
      </caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              aria-sort={sortKey === column.key ? direction : 'none'}
              className="border-b border-border p-2 text-left"
            >
              <button
                type="button"
                onClick={() => {
                  activateSort(column.key);
                }}
                className="inline-flex items-center gap-1 font-medium text-fg hover:underline"
              >
                {column.label}
                {sortKey === column.key ? (direction === 'ascending' ? '▲' : '▼') : null}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.id}
            ref={(element) => {
              rowRefs.current[index] = element;
            }}
            tabIndex={index === clampedFocusedIndex ? 0 : -1}
            aria-selected={row.id === selectedId}
            data-highlighted={highlighted.has(row.id)}
            onClick={() => {
              selectRow(row.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectRow(row.id);
                return;
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                // Owns Up/Down/Home/End for row-to-row movement: stop it reaching any
                // window-level shortcut (e.g. the map's cell-navigation handler).
                event.stopPropagation();
                focusRow(index + 1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                focusRow(index - 1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                event.stopPropagation();
                focusRow(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                event.stopPropagation();
                focusRow(rows.length - 1);
              }
            }}
            className={cn(
              'cursor-pointer border-b border-border outline-offset-[-2px]',
              row.id === selectedId
                ? 'bg-accent-subtle'
                : highlighted.has(row.id)
                  ? 'bg-warning-bg'
                  : 'hover:bg-surface-muted',
            )}
          >
            <td className="p-2 tabular-nums">{row.id}</td>
            {CLUSTERS.map(({ key }) => {
              const score = row.scores[key];
              return (
                <td key={key} className="p-2 tabular-nums">
                  {score === null ? (
                    <span className="text-fg-muted italic">No data</span>
                  ) : (
                    formatIndex(score)
                  )}
                </td>
              );
            })}
            <td className="p-2 tabular-nums">{row.advisoryCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
