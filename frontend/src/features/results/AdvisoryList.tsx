import { getMetric, isMetricKey, type AdvisoryItem, type GridId } from '@/domain';
import { EmptyState } from '@/components/ui';

export interface AdvisoryListProps {
  readonly heading: string;
  readonly items: readonly AdvisoryItem[];
  /** Advisories for metrics with no raw value: shown only here, muted, per ADR-004. */
  readonly noDataItems?: readonly AdvisoryItem[];
  /** Click-to-highlight: called with the cell ids the clicked advisory applies to. */
  readonly onHighlight?: ((cellIds: readonly GridId[]) => void) | undefined;
}

function isFarmLevel(item: AdvisoryItem): boolean {
  return isMetricKey(item.metric) && getMetric(item.metric).scope === 'farm';
}

function AdvisoryRow({
  item,
  muted,
  onHighlight,
}: {
  readonly item: AdvisoryItem;
  readonly muted: boolean;
  readonly onHighlight?: ((cellIds: readonly GridId[]) => void) | undefined;
}) {
  const body = (
    <>
      <p className={muted ? 'text-fg-muted' : 'text-fg'}>{item.text}</p>
      <p className="text-sm text-fg-muted">
        Applies to {item.cellCount} of {item.totalCells} cells
      </p>
      {isFarmLevel(item) ? (
        <p className="text-xs text-fg-muted italic">
          Farm-level: same for every cell (weather is measured at the farm centre)
        </p>
      ) : null}
    </>
  );

  if (onHighlight === undefined) {
    return <li className="rounded-control border border-border p-2">{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onHighlight(item.cellIds);
        }}
        className="w-full rounded-control border border-border p-2 text-left hover:bg-surface-muted"
      >
        {body}
      </button>
    </li>
  );
}

/**
 * Advisory texts grouped and de-duplicated across cells (`domain/advisories.ts`), each showing how
 * many cells it applies to. Clicking one highlights those cells on the map. Advisories whose
 * metric has no raw value never appear here: they are passed separately as `noDataItems` and
 * rendered in their own muted group (ADR-004).
 */
export function AdvisoryList({ heading, items, noDataItems = [], onHighlight }: AdvisoryListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <EmptyState
          headingLevel={4}
          title="No recommended actions"
          description="Every cell with data is clear of the app's attention threshold."
        />
      ) : (
        <ul aria-label={heading} className="flex flex-col gap-2">
          {items.map((item) => (
            <AdvisoryRow
              key={`${item.metric}|${item.text}`}
              item={item}
              muted={false}
              onHighlight={onHighlight}
            />
          ))}
        </ul>
      )}

      {noDataItems.length > 0 ? (
        <div role="group" aria-label="No data" className="flex flex-col gap-2 opacity-70">
          <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">
            No data ({noDataItems.length})
          </p>
          <ul aria-label="Advisories with no raw value" className="flex flex-col gap-2">
            {noDataItems.map((item) => (
              <AdvisoryRow key={`${item.metric}|${item.text}`} item={item} muted />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
