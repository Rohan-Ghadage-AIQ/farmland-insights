import { useId, useState, type SyntheticEvent } from 'react';
import { parseCoordinates, type Coordinates } from './coordinates';

export interface CoordinateSearchProps {
  /** Called with a valid position when the person submits. */
  readonly onGo: (coordinates: Coordinates) => void;
  /** True until the map exists, so "Go" cannot be pressed with nothing to move. */
  readonly disabled?: boolean;
}

/**
 * "Go to coordinates": a small box on the map for typing or pasting a latitude and longitude.
 * Understands decimal degrees, N/S/E/W letters and degrees-minutes-seconds (see `parseCoordinates`).
 */
export function CoordinateSearch({ onGo, disabled = false }: CoordinateSearchProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = parseCoordinates(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onGo(result.value);
  };

  return (
    <form
      role="search"
      aria-label="Go to coordinates"
      onSubmit={submit}
      className="bg-surface text-fg border-border rounded-panel shadow-float flex w-72 flex-col gap-1 border p-2 text-sm"
    >
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Coordinates (latitude, longitude)"
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
          placeholder="Go to lat, lon  e.g. 23.6025, 72.4025"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          className="bg-surface border-border placeholder:text-fg-muted min-w-0 flex-1 rounded-control border px-2 py-1"
        />
        <button
          type="submit"
          disabled={disabled}
          className="bg-accent text-accent-fg rounded-control px-3 py-1 font-medium disabled:opacity-50"
        >
          Go
        </button>
      </div>
      {error === null ? null : (
        <p id={errorId} role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
