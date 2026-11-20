// Public surface of the results feature: the inspector (farm summary / cell detail), the table
// alternative, export controls, and the selection state the map slot needs too (ARCHITECTURE.md:
// results and map are sibling AppShell slots, so whoever composes the app wires this hook's
// selectedId/highlightIds into the map's GridOverlay, and passes the map's `exportPng` back in).
export {
  ResultsPanel,
  type ResultsError,
  type ResultsPanelProps,
  type ResultsStatus,
} from './ResultsPanel';
export { FarmSummaryPanel, type FarmSummaryPanelProps } from './FarmSummaryPanel';
export { CellDetailPanel, type CellDetailPanelProps } from './CellDetailPanel';
export { TableView, type TableViewProps } from './TableView';
export { ExportControls, type ExportControlsProps, type ReportSource } from './ExportControls';
export {
  GOOD_SCORE,
  RATING_LABEL,
  buildHtmlReport,
  ratingOf,
  reportFilename,
  type Rating,
  type ReportInput,
  type ReportLegend,
} from './report';
export { AdvisoryList, type AdvisoryListProps } from './AdvisoryList';
export {
  ClusterBarChart,
  type ClusterBarChartProps,
  type ClusterBarDatum,
} from './ClusterBarChart';
export { useCellSelection, type UseCellSelectionResult } from './use-cell-selection';
export {
  buildGridIndex,
  findNeighbor,
  type GridDirection,
  type GridIndex,
  type GridRowCol,
} from './grid-navigation';
export { hasAnySatelliteMetric } from './satellite';
export { downloadDataUrl, downloadText } from './download';
