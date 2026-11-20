import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from '@/components/ui';
import { farmBbox } from '@/domain';
import { AnalysisSetupPanel } from '@/features/analysis-setup';
import { FieldStep } from '@/features/field';
import { SavedLocationsDialog, type SavedLocation } from '@/features/saved-locations';
import { useWorkspace } from './WorkspaceContext';

/**
 * The setup panel (spec 3.3): step 1 (field boundary) plus steps 2-4 and Analyze. The field's
 * Draw tab only shows instructions; the actual drawing canvas is `DrawControlLazy`, rendered in
 * the map slot and driven by the same `farm` state (see `MapSlot` and ARCHITECTURE.md). Also hosts
 * "Saved locations": keep a field and its settings under a name and come back to it in one click.
 */
export function SetupSlot() {
  const {
    farm,
    setFarm,
    flow,
    mapActions,
    response,
    savedLocations,
    isSavedLocationsLoading,
    saveLocation,
    openSavedLocation,
    deleteSavedLocation,
  } = useWorkspace();
  const [savedOpen, setSavedOpen] = useState(false);
  const crop = useWatch({ control: flow.form.control, name: 'crop' });
  const locked = flow.state.status === 'running';
  // "Zoom to field" (FieldSummary) needs the map's actions, which live in a sibling slot; pushed
  // up through the workspace context the same way `MapActionsBridge` supplies `ExportControls`.
  const onZoomToField =
    mapActions === null || farm === null
      ? undefined
      : () => {
          mapActions.fitBounds(farmBbox(farm));
        };

  const openLocation = (location: SavedLocation): void => {
    openSavedLocation(location);
    setSavedOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="-mb-3 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          disabled={locked}
          onClick={() => {
            setSavedOpen(true);
          }}
        >
          {savedLocations.length === 0
            ? 'Saved locations'
            : `Saved locations (${String(savedLocations.length)})`}
        </Button>
      </div>
      <FieldStep
        value={farm}
        onChange={setFarm}
        disabled={locked}
        {...(onZoomToField === undefined ? {} : { onZoomToField })}
      />
      <AnalysisSetupPanel flow={flow} />
      <SavedLocationsDialog
        open={savedOpen}
        onOpenChange={setSavedOpen}
        entries={savedLocations}
        isLoading={isSavedLocationsLoading}
        canSave={farm !== null}
        suggestedName={crop.trim() === '' ? 'My field' : `${crop.trim()} field`}
        hasResult={response !== undefined}
        onSave={(name) => {
          void saveLocation(name);
        }}
        onOpen={openLocation}
        onDelete={(id) => {
          void deleteSavedLocation(id);
        }}
      />
    </div>
  );
}
