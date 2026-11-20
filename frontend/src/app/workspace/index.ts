// Composition root for the real workspace feature: wires field, analysis-setup, map and results
// behind the shell's typed slots (see ARCHITECTURE.md "Planned" section, now built).
export { WorkspaceProvider, useWorkspace, type WorkspaceApi } from './WorkspaceContext';
export { SetupSlot } from './SetupSlot';
export { MapSlot } from './MapSlot';
export { InspectorSlot } from './InspectorSlot';
export { ShortcutsDialog } from './ShortcutsDialog';
export {
  describeLayer,
  buildHoverRows,
  buildLegendInput,
  type LayerDisplay,
} from './layer-display';
