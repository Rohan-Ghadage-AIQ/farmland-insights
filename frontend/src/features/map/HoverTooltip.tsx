export interface TooltipRow {
  readonly label: string;
  /** Formatted value, or null when the cell has no data for this row. */
  readonly value: string | null;
  readonly unit?: string;
}

export interface HoverTooltipProps {
  /** Pointer position inside the map container, in pixels. */
  readonly point: { readonly x: number; readonly y: number };
  /** Map container size, used to flip the tooltip away from the edges. */
  readonly container: { readonly width: number; readonly height: number } | null;
  readonly title: string;
  readonly rows: readonly TooltipRow[];
}

const OFFSET = 12;
/** Beyond this fraction of the container the tooltip flips to the other side of the pointer. */
const FLIP_AT = 0.65;

export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly transform: string;
}

/** Pure placement so the tooltip never runs off the right or bottom edge. */
export function tooltipPlacement(
  point: { readonly x: number; readonly y: number },
  container: { readonly width: number; readonly height: number } | null,
): Placement {
  const flipX = container !== null && point.x > container.width * FLIP_AT;
  const flipY = container !== null && point.y > container.height * FLIP_AT;
  let transform = 'none';
  if (flipX && flipY) transform = 'translate(-100%, -100%)';
  else if (flipX) transform = 'translateX(-100%)';
  else if (flipY) transform = 'translateY(-100%)';
  return {
    left: point.x + (flipX ? -OFFSET : OFFSET),
    top: point.y + (flipY ? -OFFSET : OFFSET),
    transform,
  };
}

/** Presentational hover card for a grid cell. The caller supplies already-formatted text. */
export function HoverTooltip({ point, container, title, rows }: HoverTooltipProps) {
  const placement = tooltipPlacement(point, container);
  return (
    <div
      role="tooltip"
      className="bg-surface text-fg border-border rounded-panel shadow-float pointer-events-none absolute z-20 max-w-64 border px-3 py-2 text-sm"
      style={{ left: placement.left, top: placement.top, transform: placement.transform }}
    >
      <p className="font-medium">{title}</p>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-fg-muted">{row.label}</dt>
            <dd className="text-right">
              {row.value === null ? (
                <span className="text-fg-muted">No data</span>
              ) : (
                <>
                  {row.value}
                  {row.unit === undefined ? null : (
                    <span className="text-fg-muted ml-1">{row.unit}</span>
                  )}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
