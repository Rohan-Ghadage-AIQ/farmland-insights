import { useId, useState, type DragEvent } from 'react';
import { validateFarmGeometry, type FarmFeatureCollection } from '@/domain';
import { cn } from '@/components/ui';

export interface UploadFieldProps {
  /** Called with the validated, sanitized farm outline. */
  readonly onLoad: (collection: FarmFeatureCollection) => void;
  readonly disabled?: boolean;
}

const ACCEPTED_EXTENSIONS = ['.geojson', '.json'];

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** One line per issue, so the person sees everything at once rather than fixing one at a time. */
function issuesText(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join(' ');
}

/** Drag-and-drop and file-picker upload of a `.geojson`/`.json` farm outline (spec 3.3.1). */
export function UploadField({ onLoad, disabled = false }: UploadFieldProps) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = (file: File): void => {
    setError(null);
    if (!hasAcceptedExtension(file.name)) {
      setError('Use a .geojson or .json file.');
      return;
    }
    file
      .text()
      .then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          setError("That file isn't valid JSON.");
          return;
        }
        const result = validateFarmGeometry(parsed);
        if (!result.ok) {
          setError(issuesText(result.issues));
          return;
        }
        onLoad(result.collection);
      })
      .catch(() => {
        setError('That file could not be read.');
      });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file !== undefined) loadFile(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="presentation"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => {
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-panel border border-dashed p-6 text-center',
          dragOver ? 'border-accent bg-accent-subtle' : 'border-border-strong',
          disabled ? 'opacity-50' : '',
        )}
      >
        <p className="text-base text-fg">Drag and drop a .geojson or .json file here.</p>
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg hover:bg-surface-muted"
        >
          Choose a file
          <input
            id={inputId}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) loadFile(file);
            }}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
