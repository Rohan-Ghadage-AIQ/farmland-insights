// Saved locations: named fields (boundary, crop, dates, grid size and results) kept on this device,
// and the last working session, restored when the app reopens.
export { SavedLocationsDialog, type SavedLocationsDialogProps } from './SavedLocationsDialog';
export {
  createIndexedDbSavedLocationStore,
  createMemorySavedLocationStore,
  type SavedLocationStore,
} from './store';
export {
  createLocalSessionStore,
  noSessionStore,
  parseSession,
  type SavedSession,
  type SessionStore,
} from './session';
export {
  useSavedLocations,
  type SaveDraft,
  type UseSavedLocationsResult,
} from './use-saved-locations';
export {
  MAX_NAME_LENGTH,
  MAX_SAVED_LOCATIONS,
  normaliseName,
  sameName,
  type SavedInputs,
  type SavedLocation,
  type SavedRun,
} from './types';
