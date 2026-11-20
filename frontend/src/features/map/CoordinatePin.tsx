import { useEffect, useState } from 'react';
import { formatCoordinates, type Coordinates } from './coordinates';
import { useMapActions } from './map-context';

export interface CoordinatePinProps {
  readonly coordinates: Coordinates;
  readonly onClear: () => void;
}

/**
 * A pin on the position the person went to, with its coordinates and a remove button. Stays on that
 * spot as the map pans or zooms. Must sit inside `<MapView>`.
 */
export function CoordinatePin({ coordinates, onClear }: CoordinatePinProps) {
  const actions = useMapActions();
  const { lat, lon } = coordinates;
  const [point, setPoint] = useState(() => actions.project([lon, lat]));

  useEffect(() => {
    const update = (): void => {
      setPoint(actions.project([lon, lat]));
    };
    update();
    return actions.onMove(update);
  }, [actions, lat, lon]);

  return (
    <div className="pointer-events-none absolute z-20" style={{ left: point.x, top: point.y }}>
      <svg
        aria-hidden="true"
        width="28"
        height="36"
        viewBox="0 0 28 36"
        className="text-danger absolute -translate-x-1/2 -translate-y-full drop-shadow"
      >
        <path
          fill="currentColor"
          d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 36 14 36s14-12 14-22.2C28 6.2 21.7 0 14 0z"
        />
        <circle cx="14" cy="13.5" r="5" fill="white" />
      </svg>
      <div
        role="status"
        className="bg-surface text-fg border-border rounded-control shadow-float pointer-events-auto absolute top-1 left-3 flex items-center gap-1 border px-2 py-0.5 text-xs whitespace-nowrap"
      >
        <span className="tabular-nums">{formatCoordinates(coordinates)}</span>
        <button
          type="button"
          aria-label="Remove pin"
          onClick={onClear}
          className="text-fg-muted hover:text-fg px-1 leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
