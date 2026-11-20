import { useState, type SyntheticEvent } from 'react';
import { Badge, Button, Dialog, EmptyState, Skeleton, TextField } from '@/components/ui';
import { areaHectares, formatHectares } from '@/domain';
import { MAX_NAME_LENGTH, normaliseName, sameName, type SavedLocation } from './types';

export interface SavedLocationsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly entries: readonly SavedLocation[];
  readonly isLoading: boolean;
  /** False until there is a field to save. */
  readonly canSave: boolean;
  /** Pre-filled in the name box each time the dialog opens. */
  readonly suggestedName: string;
  /** True when results are on screen, so saving keeps them too. */
  readonly hasResult: boolean;
  readonly onSave: (name: string) => void;
  readonly onOpen: (location: SavedLocation) => void;
  readonly onDelete: (id: string) => void;
}

const SAVED_AT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function describe(location: SavedLocation): string {
  const { crop, startDate, endDate } = location.inputs;
  const parts = [
    crop === '' ? null : crop,
    startDate !== '' && endDate !== '' ? `${startDate} to ${endDate}` : null,
    formatHectares(areaHectares(location.farm)),
  ];
  return parts.filter((part): part is string => part !== null).join(' · ');
}

function SaveForm({
  entries,
  canSave,
  suggestedName,
  hasResult,
  onSave,
}: Pick<
  SavedLocationsDialogProps,
  'entries' | 'canSave' | 'suggestedName' | 'hasResult' | 'onSave'
>) {
  const [name, setName] = useState(suggestedName);
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const replacing = entries.find((entry) => sameName(entry.name, name));
  const empty = name.trim() === '';

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSave || empty) return;
    onSave(name);
    setSavedAs(normaliseName(name));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextField
        label="Name"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="off"
        disabled={!canSave}
        description={
          canSave
            ? hasResult
              ? 'Saves the field, crop, dates and grid size, and the results on screen.'
              : 'Saves the field, crop, dates and grid size.'
            : 'Draw, upload or load a field first, then save it here.'
        }
        onChange={(event) => {
          setName(event.target.value);
          setSavedAs(null);
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <span
          role="status"
          className={savedAs === null ? 'text-fg-muted text-sm' : 'text-success text-sm'}
        >
          {savedAs !== null
            ? `Saved “${savedAs}”.`
            : replacing === undefined
              ? ''
              : `“${replacing.name}” already exists and will be updated.`}
        </span>
        <Button type="submit" variant="primary" size="sm" disabled={!canSave || empty}>
          {replacing === undefined ? 'Save' : 'Update'}
        </Button>
      </div>
    </form>
  );
}

function LocationRow({
  location,
  onOpen,
  onDelete,
}: {
  readonly location: SavedLocation;
  readonly onOpen: (location: SavedLocation) => void;
  readonly onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="border-border flex items-center justify-between gap-3 rounded-control border p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-fg flex items-center gap-2 text-base font-medium">
          <span className="truncate">{location.name}</span>
          {location.run === null ? null : <Badge tone="accent">Includes results</Badge>}
        </span>
        <span className="text-fg-muted truncate text-sm">{describe(location)}</span>
        <span className="text-fg-muted text-xs">
          Saved {SAVED_AT.format(new Date(location.savedAt))}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {confirming ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Confirm delete ${location.name}`}
              onClick={() => {
                onDelete(location.id);
              }}
            >
              Delete?
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Open ${location.name}`}
              onClick={() => {
                onOpen(location);
              }}
            >
              Open
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${location.name}`}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Saved locations: keep a field and its settings under a name, and come back to it in one click.
 * Everything stays on this device. Presentational: the caller owns the data and the actions.
 */
export function SavedLocationsDialog({
  open,
  onOpenChange,
  entries,
  isLoading,
  canSave,
  suggestedName,
  hasResult,
  onSave,
  onOpen,
  onDelete,
}: SavedLocationsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Saved locations"
      description="Keep a field and its settings on this device, so you can come back to it without setting everything up again."
    >
      {/* Re-mounted on every open so the name box starts from the current suggestion. */}
      {open ? (
        <div className="flex flex-col gap-4">
          <SaveForm
            entries={entries}
            canSave={canSave}
            suggestedName={suggestedName}
            hasResult={hasResult}
            onSave={onSave}
          />
          <div className="border-border border-t pt-3">
            {isLoading ? (
              <div role="status" aria-live="polite">
                <span className="sr-only">Loading saved locations…</span>
                <Skeleton lines={3} />
              </div>
            ) : entries.length === 0 ? (
              <EmptyState
                title="Nothing saved yet"
                description="Save a field above and it will be listed here."
              />
            ) : (
              <ul aria-label="Saved locations" className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <LocationRow
                    key={entry.id}
                    location={entry}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
