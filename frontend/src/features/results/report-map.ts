import type { FarmFeatureCollection, GridAnalysisFeature } from '@/domain';

/**
 * Draws the farm's grid cells as an inline SVG, each filled by its value. Coordinates are projected
 * with a simple equirectangular scale (longitude shrunk by cos(latitude)), which is exact enough for
 * a field a few kilometres across. Only numbers and fixed colours reach the markup.
 */

type Position = readonly number[];
type Ring = readonly Position[];
type CellGeometry = GridAnalysisFeature['geometry'];

const WIDTH = 360;
const HEIGHT = 260;
const PAD = 14;
/** Above this many cells the thin white cell borders are dropped to keep the file small. */
const BORDER_CELL_LIMIT = 2500;
export const NO_DATA_FILL = '#d5dfdf';

function polygonsOf(geometry: CellGeometry): readonly (readonly Ring[])[] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

interface Projection {
  readonly project: (position: Position) => readonly [number, number];
}

function boundsOf(rings: Iterable<Ring>): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y))
        continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return minX <= maxX && minY <= maxY ? [minX, minY, maxX, maxY] : null;
}

function* allRings(
  cells: readonly GridAnalysisFeature[],
  farm: FarmFeatureCollection | null | undefined,
): Generator<Ring> {
  for (const feature of farm?.features ?? []) {
    for (const polygon of polygonsOf(feature.geometry)) yield* polygon;
  }
  for (const cell of cells) {
    for (const polygon of polygonsOf(cell.geometry)) yield* polygon;
  }
}

function projectionFor(bounds: [number, number, number, number]): Projection {
  const [minX, minY, maxX, maxY] = bounds;
  const midLat = ((minY + maxY) / 2) * (Math.PI / 180);
  const xScale = Math.max(Math.cos(midLat), 0.01);
  const spanX = Math.max((maxX - minX) * xScale, 1e-12);
  const spanY = Math.max(maxY - minY, 1e-12);
  const scale = Math.min((WIDTH - 2 * PAD) / spanX, (HEIGHT - 2 * PAD) / spanY);
  const offsetX = (WIDTH - spanX * scale) / 2;
  const offsetY = (HEIGHT - spanY * scale) / 2;
  return {
    project: ([x = 0, y = 0]) => [
      offsetX + (x - minX) * xScale * scale,
      offsetY + (maxY - y) * scale,
    ],
  };
}

const fmt = (value: number): string => (Math.round(value * 10) / 10).toString();

function pathOf(polygons: readonly (readonly Ring[])[], projection: Projection): string {
  let d = '';
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach((position, index) => {
        const [x, y] = projection.project(position);
        d += `${index === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`;
      });
      d += 'Z';
    }
  }
  return d;
}

export interface FieldMapOptions {
  readonly cells: readonly GridAnalysisFeature[];
  readonly farm?: FarmFeatureCollection | null | undefined;
  /** The fill for a cell; null draws it as "no data". Must return a fixed, trusted colour. */
  readonly fillOf: (cell: GridAnalysisFeature) => string | null;
  /** Accessible description of what the map shows. Must already be HTML-escaped. */
  readonly label: string;
  /** Draw a north arrow (default true). */
  readonly north?: boolean;
}

/** An inline SVG of the field, or null when there is no geometry to draw. */
export function fieldMapSvg({
  cells,
  farm,
  fillOf,
  label,
  north: showNorth = true,
}: FieldMapOptions): string | null {
  const bounds = boundsOf(allRings(cells, farm));
  if (bounds === null) return null;
  const projection = projectionFor(bounds);
  const stroke =
    cells.length <= BORDER_CELL_LIMIT ? ' stroke="#ffffff" stroke-width="0.6"' : ' stroke="none"';

  const cellPaths = cells
    .map((cell) => {
      const fill = fillOf(cell) ?? NO_DATA_FILL;
      return `<path d="${pathOf(polygonsOf(cell.geometry), projection)}" fill="${fill}"${stroke}/>`;
    })
    .join('');
  const outline = (farm?.features ?? [])
    .map(
      (feature) =>
        `<path d="${pathOf(polygonsOf(feature.geometry), projection)}" fill="none" stroke="#0e2a30" stroke-width="1.4" stroke-linejoin="round"/>`,
    )
    .join('');
  const north = !showNorth
    ? ''
    : `<g transform="translate(${String(WIDTH - 22)} 16)" aria-hidden="true">` +
      '<path d="M0 -10L5 4L0 1L-5 4Z" fill="#0e2a30"/>' +
      '<text x="0" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="#0e2a30">N</text></g>';
  return (
    `<svg class="field-map" viewBox="0 0 ${String(WIDTH)} ${String(HEIGHT)}" role="img" aria-label="${label}">` +
    `<g fill-rule="evenodd">${cellPaths}</g>${outline}${north}</svg>`
  );
}
