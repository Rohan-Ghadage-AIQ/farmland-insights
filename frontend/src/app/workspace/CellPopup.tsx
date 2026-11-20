import { useEffect, useState } from 'react';
import type { GridAnalysisFeature } from '@/domain';
import { Badge, type BadgeTone } from '@/components/ui';
import { useMapActions, type LngLat } from '@/features/map';
import { RATING_LABEL, type Rating } from '@/features/results';
import { buildCellDetails } from './cell-details';

const TONE: Readonly<Record<Rating, BadgeTone>> = {
  good: 'success',
  fair: 'warning',
  attention: 'danger',
  none: 'neutral',
};

export interface CellPopupProps {
  readonly cell: GridAnalysisFeature;
  /** Where the cell was clicked. The popup stays attached to this spot as the map moves. */
  readonly lngLat: LngLat;
  readonly onClose: () => void;
}

const WIDTH = 288;
const MAX_HEIGHT = 336;
const GAP = 12;
const EDGE = 8;

/**
 * Details for the clicked grid cell, drawn on the map next to the click: each area's score and
 * rating, the parameter values behind it, and the advice that applies. Must sit inside `<MapView>`.
 */
export function CellPopup({ cell, lngLat, onClose }: CellPopupProps) {
  const actions = useMapActions();
  const [point, setPoint] = useState(() => actions.project(lngLat));

  useEffect(() => {
    const update = (): void => {
      setPoint(actions.project(lngLat));
    };
    update();
    return actions.onMove(update);
  }, [actions, lngLat]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const details = buildCellDetails(cell);

  return (
    <div
      role="dialog"
      aria-label={`Details for cell ${details.id}`}
      className="bg-surface text-fg border-border rounded-panel shadow-float absolute z-30 flex flex-col border text-sm"
      style={{
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
        // Beside the click, but never past the map edge (the box is a fixed size).
        left: `clamp(${String(EDGE)}px, ${String(point.x + GAP)}px, calc(100% - ${String(WIDTH + EDGE)}px))`,
        top: `clamp(${String(EDGE)}px, ${String(point.y + GAP)}px, calc(100% - ${String(MAX_HEIGHT + EDGE)}px))`,
      }}
    >
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="font-semibold">Grid cell {details.id}</h3>
        <button
          type="button"
          aria-label="Close cell details"
          onClick={onClose}
          className="text-fg-muted hover:bg-surface-muted hover:text-fg rounded-control px-2 leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-3 py-2">
        {details.groups.map((group) => (
          <section key={group.key} aria-label={group.title}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium">{group.title}</h4>
              {group.rating === null ? null : (
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums">{group.score}</span>
                  <Badge tone={TONE[group.rating]}>{RATING_LABEL[group.rating]}</Badge>
                </span>
              )}
            </div>
            {group.rows.length === 0 ? null : (
              <dl className="text-fg-muted mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                {group.rows.map((row) => (
                  <div key={row.label} className="contents">
                    <dt>{row.label}</dt>
                    <dd className="text-fg text-right tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}

        {details.advice.length === 0 ? null : (
          <section aria-label="Advice">
            <h4 className="font-medium">Advice for this cell</h4>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              {details.advice.map((item) => (
                <li key={`${item.label}:${item.text}`}>
                  <span className="font-medium">{item.label}:</span> {item.text}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
