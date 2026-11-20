import {
  ATTENTION_THRESHOLD,
  CLUSTER_KEYS,
  NO_VALUE,
  areaAcres,
  areaHectares,
  cellsNeedingAttention,
  clusterLabel,
  clusterScore,
  cropCategoryLabel,
  farmBbox,
  farmClusterStats,
  formatAcres,
  formatCount,
  formatHectares,
  formatMetricValue,
  formatNumber,
  getMetric,
  gridIdOf,
  groupAdvisories,
  hasMetricValue,
  isMetricKey,
  METRIC_KEYS,
  topAdvisories,
  type AdvisoryItem,
  type ClusterKey,
  type FarmAnalysisRequest,
  type FarmFeatureCollection,
  type GridAnalysisFeature,
} from '@/domain';
import {
  REPORT_INDEX_GROUPS,
  SCALE_COLOURS,
  bandOf,
  scaleClass,
  scaleColour,
  type BandRating,
  type IndexBands,
  type ReportIndex,
  type ReportIndexGroup,
} from './report-indices';
import { fieldMapSvg } from './report-map';
import { REPORT_STYLE } from './report-style';

/** The colour bar for the map layer shown in the image (from the map's own legend). */
export interface ReportLegend {
  readonly title: string;
  readonly unit: string | null;
  /** A CSS `linear-gradient(...)` value. Anything that is not one is ignored. */
  readonly gradient: string;
  readonly min: string;
  readonly max: string;
}

export interface ReportImagery {
  readonly image_date?: string | null | undefined;
  readonly optical_date?: string | null | undefined;
  readonly radar_date?: string | null | undefined;
}

export interface ReportInput {
  readonly cells: readonly GridAnalysisFeature[];
  /** The inputs the analysis was run with. Omitted sections are simply left out. */
  readonly request?: FarmAnalysisRequest | null | undefined;
  readonly farm?: FarmFeatureCollection | null | undefined;
  /** Which satellite passes the indices came from (the analysis response's `imagery`). */
  readonly imagery?: ReportImagery | null | undefined;
  /** A PNG data URL of the map (farm boundary, basemap and grid). Anything else is ignored. */
  readonly mapImage?: string | null | undefined;
  /** One line under the map image, e.g. which layer is shown. */
  readonly mapCaption?: string | undefined;
  /** Colour key for the layer shown in the map image. */
  readonly legend?: ReportLegend | null | undefined;
  readonly generatedAt: Date;
}

const PNG_PREFIX = 'data:image/png;base64,';

/** Scores at or above this read as "Good". A reading aid for this report, not a backend value. */
export const GOOD_SCORE = 0.7;

export type Rating = 'good' | 'fair' | 'attention' | 'none';

export const RATING_LABEL: Readonly<Record<Rating, string>> = {
  good: 'Good',
  fair: 'Fair',
  attention: 'Needs attention',
  none: 'No data',
};

const BAND_LABEL: Readonly<Record<BandRating, string>> = {
  good: 'Good',
  medium: 'Medium',
  bad: 'Bad',
};
const BAND_ICON: Readonly<Record<BandRating, string>> = { good: '✓', medium: '!', bad: '×' };

/** Plain-language meaning of each score area. */
const CLUSTER_MEANING: Readonly<Record<ClusterKey, string>> = {
  Structural:
    'How dense and vigorous the crop canopy is, from optical and radar satellite indices.',
  Chlorophyll:
    'How green and healthy the leaves are, a sign of leaf chlorophyll and nutrient status.',
  Water_Drought:
    'How much moisture the crop and soil have, and how stressed the crop is by drought.',
  Environmental: 'Temperature, humidity and soil conditions on the farm.',
  Agro_Meteo: 'Rainfall, heat build-up and water loss over the analysis period.',
};

export function ratingOf(score: number | null): Rating {
  if (score === null) return 'none';
  if (score < ATTENTION_THRESHOLD) return 'attention';
  return score < GOOD_SCORE ? 'fair' : 'good';
}

/** Escapes text for HTML element content and double-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Only a well-formed PNG data URL may become an `<img src>`; anything else is dropped. */
function safeMapImage(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) return null;
  return /^[A-Za-z0-9+/=]*$/.test(value.slice(PNG_PREFIX.length)) ? value : null;
}

const GRADIENT_COLOR = String.raw`(?:#[0-9A-Fa-f]{3,8}|rgba?\(\s*\d{1,3}(?:\.\d+)?%?(?:\s*,\s*\d{1,3}(?:\.\d+)?%?){2}(?:\s*,\s*[01]?(?:\.\d+)?)?\s*\))`;
const GRADIENT_STOP = String.raw`${GRADIENT_COLOR}(?:\s+\d{1,3}%)?`;
const GRADIENT_PATTERN = new RegExp(
  String.raw`^linear-gradient\((?:to (?:right|left|top|bottom)|\d{1,3}deg),\s*${GRADIENT_STOP}(?:,\s*${GRADIENT_STOP})*\)$`,
);

/** Only a plain `linear-gradient(direction, colour stops...)` may reach a `style` attribute. */
function safeGradient(value: string): string | null {
  return GRADIENT_PATTERN.test(value) ? value : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A date from the API, or null; only `YYYY-MM-DD` reaches the page. */
function safeDate(value: string | null | undefined): string | null {
  return typeof value === 'string' && ISO_DATE.test(value) ? value : null;
}

/** `farmland-report-2024-01-01_to_2024-02-15.html`, or a dated name without a request. */
export function reportFilename(
  request: FarmAnalysisRequest | null | undefined,
  generatedAt: Date,
): string {
  if (request) return `farmland-report-${request.start_date}_to_${request.end_date}.html`;
  return `farmland-report-${generatedAt.toISOString().slice(0, 10)}.html`;
}

function percent(part: number, total: number): string {
  return total === 0 ? NO_VALUE : `${String(Math.round((part / total) * 100))}%`;
}

const score2 = (value: number | null): string =>
  value === null ? NO_VALUE : formatNumber(value, 2);

/** Known metrics in dictionary order, then unknown ones alphabetically (same rule as the CSV). */
function orderedMetricKeys(cells: readonly GridAnalysisFeature[]): string[] {
  const present = new Set<string>();
  for (const cell of cells) {
    for (const key of Object.keys(cell.properties.raw_metrics ?? {})) present.add(key);
  }
  const known = METRIC_KEYS.filter((key) => present.has(key));
  const unknown = [...present].filter((key) => !isMetricKey(key)).sort();
  return [...known, ...unknown];
}

function metricValues(cells: readonly GridAnalysisFeature[], key: string): number[] {
  return cells.flatMap((cell) => {
    const value = cell.properties.raw_metrics?.[key];
    return hasMetricValue(cell, key) && value !== undefined ? [value] : [];
  });
}

function withUnit(key: string, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return isMetricKey(key) ? formatMetricValue(key, value) : formatNumber(value, 2);
}

function cellText(key: string, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_VALUE;
  return formatNumber(value, isMetricKey(key) ? getMetric(key).decimals : 2);
}

function metricLabel(key: string): string {
  return isMetricKey(key) ? getMetric(key).label : key;
}

const DESCRIPTIVE_UNITS: readonly string[] = ['0–100', '0 or 1', 'ratio'];

function metricHeading(key: string): string {
  if (!isMetricKey(key)) return key;
  const { label, unit } = getMetric(key);
  return unit === null || DESCRIPTIVE_UNITS.includes(unit) ? label : `${label} (${unit})`;
}

const td = (value: string, className = ''): string =>
  `<td${className === '' ? '' : ` class="${className}"`}>${escapeHtml(value)}</td>`;
const th = (value: string, className = ''): string =>
  `<th${className === '' ? '' : ` class="${className}"`}>${escapeHtml(value)}</th>`;
const chip = (rating: Rating): string =>
  `<span class="chip ${rating}">${escapeHtml(RATING_LABEL[rating])}</span>`;
const pad2 = (n: number): string => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------------------------

interface Context {
  readonly input: ReportInput;
  readonly cells: readonly GridAnalysisFeature[];
  /** Area of each cell in square metres, in `cells` order. */
  readonly areas: readonly number[];
  readonly advisories: ReturnType<typeof groupAdvisories>;
  readonly opticalDate: string | null;
  readonly radarDate: string | null;
  readonly period: string | null;
}

function cellArea(cell: GridAnalysisFeature): number {
  const squareMetres =
    areaHectares({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: cell.geometry, properties: {} }],
    }) * 10_000;
  return Number.isFinite(squareMetres) && squareMetres > 0 ? squareMetres : 0;
}

function formatArea(squareMetres: number): string {
  if (squareMetres >= 10_000) return `${formatNumber(squareMetres / 10_000, 2)} ha`;
  return `${formatCount(Math.round(squareMetres))} m²`;
}

const NDVI_BANDS = REPORT_INDEX_GROUPS.flatMap((group) => group.indices).find(
  (index) => index.key === 'ndvi',
)?.bands;

const MARK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 20c0-8 6-14 16-16-1 10-7 16-15 16"/><path d="M4 20l8-8"/></svg>';
const ARCS =
  '<svg class="arcs" viewBox="0 0 200 200" fill="none" stroke="#8fd6e2" stroke-width="0.8" aria-hidden="true">' +
  '<circle cx="100" cy="100" r="40" opacity=".55"/><circle cx="100" cy="100" r="62" opacity=".4"/>' +
  '<circle cx="100" cy="100" r="84" opacity=".28"/><circle cx="100" cy="100" r="99" opacity=".16"/></svg>';

function passLine(ctx: Context, index: ReportIndex): string {
  if (index.sensor === 'weather') {
    return ctx.period === null
      ? 'Weather data for the farm location'
      : `Weather data, ${escapeHtml(ctx.period)}`;
  }
  const date = index.sensor === 'radar' ? ctx.radarDate : ctx.opticalDate;
  const source = index.sensor === 'radar' ? 'Sentinel-1 radar' : 'Sentinel-2 optical';
  if (date !== null) return `<b>${source}</b> pass of ${date}`;
  if (ctx.input.imagery?.image_date) return `<b>${source}</b>: no pass in the period`;
  return `<b>${source}</b>, every pass ${ctx.period === null ? 'in the period' : `from ${escapeHtml(ctx.period)}`} combined`;
}

// ---------------------------------------------------------------------------------------------
// Index pages
// ---------------------------------------------------------------------------------------------

function fmtValue(value: number): string {
  return formatNumber(value, 2).replace('-', '−');
}

/** A band boundary without trailing zeros: 0.3, −0.25, 0. */
function fmtCut(value: number): string {
  return String(Number(value.toFixed(2))).replace('-', '−');
}

function bandRanges(bands: IndexBands): Record<BandRating, string> {
  const low = fmtCut(bands.cuts[0]);
  const high = fmtCut(bands.cuts[1]);
  return bands.higherIsBetter
    ? { good: `≥ ${high}`, medium: `${low} – ${high}`, bad: `< ${low}` }
    : { good: `≤ ${low}`, medium: `${low} – ${high}`, bad: `> ${high}` };
}

function scaleHtml(bands: IndexBands): string {
  const [min, max] = bands.domain;
  const at = (value: number): number => ((value - min) / (max - min)) * 100;
  const lowCut = at(bands.cuts[0]);
  const highCut = at(bands.cuts[1]);
  const left = bands.higherIsBetter ? 'bad' : 'good';
  const right = bands.higherIsBetter ? 'good' : 'bad';
  const bracket = (cls: string, from: number, to: number): string =>
    `<span class="${cls}" style="left:${from.toFixed(1)}%;width:${Math.max(0, to - from - 1).toFixed(1)}%"></span>`;
  const colours = bands.higherIsBetter ? SCALE_COLOURS : [...SCALE_COLOURS].reverse();
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => fmtValue(min + t * (max - min)));
  return (
    '<div class="scale" aria-hidden="true"><div class="brackets">' +
    bracket(left, 0, lowCut) +
    bracket('medium', lowCut + 1, highCut) +
    bracket(right, highCut + 1, 100) +
    `</div><div class="ramp">${colours.map((c) => `<i style="background:${c}"></i>`).join('')}</div>` +
    `<div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join('')}</div></div>`
  );
}

function scaleCard(index: ReportIndex, bands: IndexBands, mean: number | null): string {
  const ranges = bandRanges(bands);
  const rating = mean === null ? null : bandOf(bands, mean);
  const band = (r: BandRating): string =>
    `<div class="${r}"><span class="dot">${BAND_ICON[r]}</span>${BAND_LABEL[r]}<b>${ranges[r]}</b></div>`;
  return (
    '<div class="card"><p class="eyebrow">Analysis scale</p>' +
    `<p class="scale-name">${escapeHtml(index.short)}</p>` +
    `<p class="scale-tag">${escapeHtml(index.tagline)}<small>${escapeHtml(index.hint)}</small></p>` +
    scaleHtml(bands) +
    `<div class="bands">${band('good')}${band('medium')}${band('bad')}</div>` +
    `<div class="avg"><span>Average of the field’s cells</span><span><b>${mean === null ? NO_VALUE : fmtValue(mean)}</b> ` +
    (rating === null ? '' : `<span class="chip ${rating}">${BAND_LABEL[rating]}</span>`) +
    '</span></div></div>'
  );
}

interface Reading {
  readonly cell: GridAnalysisFeature;
  readonly value: number;
  readonly area: number;
}

function readingsOf(ctx: Context, key: string): Reading[] {
  return ctx.cells.flatMap((cell, i) => {
    const value = cell.properties.raw_metrics?.[key];
    return hasMetricValue(cell, key) && value !== undefined && Number.isFinite(value)
      ? [{ cell, value, area: ctx.areas[i] ?? 0 }]
      : [];
  });
}

function areaCard(index: ReportIndex, bands: IndexBands, readings: readonly Reading[]): string {
  const totals: Record<BandRating, number> = { good: 0, medium: 0, bad: 0 };
  const bins = SCALE_COLOURS.map(() => 0);
  let total = 0;
  for (const { value, area } of readings) {
    // Cells of zero area (degenerate edge slivers) still count once, so a tiny farm is not empty.
    const weight = area > 0 ? area : 1e-9;
    totals[bandOf(bands, value)] += weight;
    const bin = scaleClass(bands, value);
    bins[bin] = (bins[bin] ?? 0) + weight;
    total += weight;
  }
  const share = (part: number): number => (total === 0 ? 0 : (part / total) * 100);
  const order: readonly BandRating[] = ['good', 'medium', 'bad'];
  const split = order
    .map((r) => `<i class="${r}" style="width:${share(totals[r]).toFixed(1)}%"></i>`)
    .join('');
  const stats = order
    .map(
      (r) =>
        `<div class="${r}"><span>● ${BAND_LABEL[r]}</span><b>${String(Math.round(share(totals[r])))}%</b>${escapeHtml(formatArea(totals[r] < 1e-6 ? 0 : totals[r]))}</div>`,
    )
    .join('');
  const tallest = Math.max(...bins, 0);
  const binColours = bands.higherIsBetter ? SCALE_COLOURS : [...SCALE_COLOURS].reverse();
  const hist = bins
    .map((weight, i) => {
      const pct = share(weight);
      const height = tallest === 0 ? 0 : (weight / tallest) * 100;
      if (height === 0) return '<div></div>';
      return `<div style="height:${height.toFixed(1)}%;background:${binColours[i] ?? '#ccc'}">${pct >= 0.5 ? `<em>${String(Math.round(pct))}%</em>` : ''}</div>`;
    })
    .join('');
  const [min, max] = bands.domain;
  return (
    `<div class="card"><p class="eyebrow">${escapeHtml(index.short)} · Field area</p>` +
    `<div class="split" role="img" aria-label="Share of the field rated Good, Medium and Bad">${split}</div>` +
    `<div class="shares">${stats}</div>` +
    `<div class="hist" role="img" aria-label="Share of the field in each value range">${hist}</div>` +
    `<div class="ticks"><span>${fmtValue(min)}</span><span>${fmtValue((min + max) / 2)}</span><span>${fmtValue(max)}</span></div></div>`
  );
}

function adviceCard(ctx: Context, key: string): string {
  const items = [...ctx.advisories.clusters.flatMap((g) => g.items), ...ctx.advisories.other]
    .filter((item) => item.metric === key)
    .slice(0, 3);
  const body =
    items.length === 0
      ? '<p class="muted">No specific action for this index on this pass.</p>'
      : `<ul>${items
          .map(
            (item) =>
              `<li>${escapeHtml(item.text)} <span class="muted">(${percent(item.cellCount, item.totalCells)} of the field)</span></li>`,
          )
          .join('')}</ul>`;
  return `<div class="card soft todo"><p class="eyebrow">What to do</p>${body}</div>`;
}

function background(index: ReportIndex): string {
  return `<div class="background"><p class="eyebrow">Scientific background</p><p>${escapeHtml(index.background)}</p></div>`;
}

function noDataCard(index: ReportIndex, ctx: Context): string {
  const why =
    index.key === 'rsm'
      ? 'Radar soil moisture needs a year of Sentinel-1 history for this field and is only computed by the Earth Engine data source.'
      : index.sensor === 'optical' && ctx.opticalDate === null && ctx.input.imagery?.image_date
        ? 'There was no Sentinel-2 pass in the period.'
        : index.sensor === 'radar' && ctx.radarDate === null && ctx.input.imagery?.image_date
          ? 'There was no Sentinel-1 pass in the period.'
          : 'The pass may have been cloudy over the field, or the satellite source returned no value.';
  return `<div class="empty"><b>No ${escapeHtml(index.short)} data for this field</b>${escapeHtml(why)}</div>`;
}

function indexId(index: ReportIndex): string {
  return `index-${index.key.replaceAll('_', '-')}`;
}

function indexBody(index: ReportIndex, ctx: Context): string {
  const title = index.bands === undefined ? index.name : `${index.short} (${index.name})`;
  const heading = `<h3 class="idx">${escapeHtml(title)}</h3><p class="lead">${escapeHtml(index.about)}</p>`;
  const readings = readingsOf(ctx, index.key);
  const pass = `<div class="pass"><span>${passLine(ctx, index)}</span><span>${formatCount(readings.length)} of ${formatCount(ctx.cells.length)} cells with data</span></div>`;

  if (readings.length === 0) {
    return (
      `${heading}${noDataCard(index, ctx)}<div class="pass" style="margin:8px 0 12px"><span>${passLine(ctx, index)}</span></div>` +
      `<div class="row2">${adviceCard(ctx, index.key)}<div></div></div>${background(index)}`
    );
  }
  const mean = readings.reduce((sum, r) => sum + r.value, 0) / readings.length;
  const { bands } = index;

  if (bands === undefined) {
    // Farm-wide weather value: one number, no map.
    const unit = isMetricKey(index.key) ? (getMetric(index.key).unit ?? '') : '';
    const perDay =
      unit === 'mm/h' ? `<small>≈ ${formatNumber(mean * 24, 1)} mm per day</small>` : '';
    const note = isMetricKey(index.key) ? getMetric(index.key).note : undefined;
    return (
      heading +
      '<div class="row2"><div class="card value-card"><p class="eyebrow">Field value</p>' +
      `<span class="big">${escapeHtml(formatNumber(mean, 2))} <small style="display:inline">${escapeHtml(unit)}</small></span>${perDay}` +
      `<div class="pass" style="margin-top:8px"><span>${passLine(ctx, index)}</span></div>` +
      (note === undefined ? '' : `<small>${escapeHtml(note)}</small>`) +
      `</div>${adviceCard(ctx, index.key)}</div>${background(index)}`
    );
  }

  const byCell = new Map(readings.map((r) => [r.cell, r.value]));
  const map = fieldMapSvg({
    cells: ctx.cells,
    farm: ctx.input.farm,
    fillOf: (cell) => {
      const value = byCell.get(cell);
      return value === undefined ? null : scaleColour(bands, value);
    },
    label: escapeHtml(`${index.short} map of the field`),
  });
  return (
    heading +
    `<div class="row2"><div class="card map-card">${map ?? '<div class="empty">No field outline to draw.</div>'}${pass}</div>` +
    `${scaleCard(index, bands, mean)}</div>` +
    `<div class="row2">${areaCard(index, bands, readings)}${adviceCard(ctx, index.key)}</div>` +
    background(index)
  );
}

// ---------------------------------------------------------------------------------------------
// Summary, actions, parameters and cells
// ---------------------------------------------------------------------------------------------

function summaryBody(ctx: Context, stats: ReturnType<typeof farmClusterStats>): string {
  const { cells } = ctx;
  const parts: string[] = ['<h2 class="band">Field summary' + ARCS + '</h2>'];
  if (cells.length === 0) {
    parts.push('<p class="muted">There are no grid cells in this analysis.</p>');
    return parts.join('');
  }
  const attention = cellsNeedingAttention(cells);
  const ranked = CLUSTER_KEYS.flatMap((cluster) => {
    const mean = stats[cluster].mean;
    return mean === null ? [] : [{ cluster, mean }];
  }).sort((a, b) => a.mean - b.mean);
  const weakest = ranked[0];
  const strongest = ranked.at(-1);
  const tiles: string[] = [
    `<div class="tile ${attention.count === 0 ? 'good' : 'attention'}"><span class="big">${percent(attention.count, attention.total)}</span>` +
      `<span>of the field needs attention</span><small>${formatCount(attention.count)} of ${formatCount(attention.total)} cells score below ${formatNumber(ATTENTION_THRESHOLD, 2)} in at least one area</small></div>`,
  ];
  if (weakest !== undefined && strongest !== undefined) {
    tiles.push(
      `<div class="tile ${ratingOf(weakest.mean)}"><span class="big">${escapeHtml(clusterLabel(weakest.cluster))}</span>` +
        `<span>is the weakest area</span><small>Average score ${score2(weakest.mean)}</small></div>`,
      `<div class="tile ${ratingOf(strongest.mean)}"><span class="big">${escapeHtml(clusterLabel(strongest.cluster))}</span>` +
        `<span>is the strongest area</span><small>Average score ${score2(strongest.mean)}</small></div>`,
    );
  }
  parts.push(`<div class="tiles">${tiles.join('')}</div>`);

  const top = topAdvisories(ctx.advisories, 3);
  if (top.length > 0) {
    parts.push(
      `<div class="card soft todo" style="margin-bottom:14px"><p class="eyebrow">Most widespread actions</p><ol style="margin:0;padding-left:18px">${top
        .map(
          (item) =>
            `<li><strong>${escapeHtml(metricLabel(item.metric))}:</strong> ${escapeHtml(item.text)} <span class="muted">(${percent(item.cellCount, item.totalCells)} of the field)</span></li>`,
        )
        .join('')}</ol></div>`,
    );
  }

  parts.push(`<h3 class="idx" id="scores">Scores by area</h3>${scoreRows(stats)}`);
  parts.push(mapFigure(ctx.input));
  parts.push(
    '<div class="background" style="margin-top:14px"><p class="eyebrow">How to read this report</p><ul class="guide">' +
      '<li>The field is split into small square <strong>grid cells</strong>; each value is the average of the satellite or weather data inside that cell.</li>' +
      `<li>Area scores run from 0 to 1, <strong>higher is better</strong>: ${chip('good')} ${formatNumber(GOOD_SCORE, 2)} or more, ${chip('fair')} ${formatNumber(ATTENTION_THRESHOLD, 2)} to ${formatNumber(GOOD_SCORE, 2)}, ${chip('attention')} below ${formatNumber(ATTENTION_THRESHOLD, 2)}.</li>` +
      '<li>Each index page colours the field from <strong>red (poor)</strong> to <strong>green (healthy)</strong> and splits it into Good, Medium and Bad. These bands are a reading aid, not an official standard.</li>' +
      `<li>A dash (${NO_VALUE}) means there was no data for that value.</li></ul></div>`,
  );
  return parts.join('');
}

function scoreRows(stats: ReturnType<typeof farmClusterStats>): string {
  return CLUSTER_KEYS.map((cluster) => {
    const s = stats[cluster];
    const rating = ratingOf(s.mean);
    const width = s.mean === null ? 0 : Math.max(0, Math.min(100, Math.round(s.mean * 100)));
    const range =
      s.min === null || s.max === null
        ? 'No data'
        : `Lowest cell ${score2(s.min)}, highest ${score2(s.max)}`;
    return (
      `<div class="score-row"><div><strong>${escapeHtml(clusterLabel(cluster))}</strong>` +
      `<small>${escapeHtml(CLUSTER_MEANING[cluster])}</small></div>` +
      `<div class="score-bar" role="img" aria-label="${escapeHtml(clusterLabel(cluster))} score ${score2(s.mean)} of 1">` +
      `<span class="fill ${rating}" style="width:${String(width)}%"></span></div>` +
      `<div class="score-value"><strong>${score2(s.mean)}</strong>${chip(rating)}` +
      `<small>${escapeHtml(range)} · ${formatCount(s.cellsWithData)} of ${formatCount(s.totalCells)} cells</small></div></div>`
    );
  }).join('');
}

function mapFigure(input: ReportInput): string {
  const image = safeMapImage(input.mapImage);
  if (image === null) return '';
  const caption =
    input.mapCaption ?? 'Farm boundary and analysis grid on the basemap, as shown in the app.';
  const { legend } = input;
  const gradient = legend ? safeGradient(legend.gradient) : null;
  const unit = legend?.unit ?? '';
  const legendHtml =
    legend && gradient !== null
      ? `<div class="legend"><strong>${escapeHtml(legend.title)}${unit === '' ? '' : ` (${escapeHtml(unit)})`}</strong>` +
        `<div class="legend-bar"><span>${escapeHtml(legend.min)}</span><i style="background-image:${gradient}"></i><span>${escapeHtml(legend.max)}</span></div></div>`
      : '';
  return (
    '<h3 class="idx" id="map">Field map</h3><figure style="margin:0">' +
    `<img class="photo" src="${image}" alt="Map of the farm boundary and analysis grid">` +
    `<figcaption class="muted" style="font-size:11px;margin-top:6px">${escapeHtml(caption)}</figcaption></figure>${legendHtml}`
  );
}

function advisoryList(items: readonly AdvisoryItem[]): string {
  return `<ul>${items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(metricLabel(item.metric))}:</strong> ${escapeHtml(item.text)} ` +
        `<span class="muted">${percent(item.cellCount, item.totalCells)} of the field (${formatCount(item.cellCount)} cells)</span></li>`,
    )
    .join('')}</ul>`;
}

function actionsBody(ctx: Context): string {
  const grouped = ctx.advisories;
  const blocks = grouped.clusters
    .filter((group) => group.items.length > 0)
    .map(
      (group) => `<h3>${escapeHtml(clusterLabel(group.cluster))}</h3>${advisoryList(group.items)}`,
    );
  if (grouped.other.length > 0) blocks.push(`<h3>Other</h3>${advisoryList(grouped.other)}`);
  const missing = grouped.noData.length;
  const note =
    missing > 0
      ? `<p class="muted">${formatCount(missing)} advice text(s) were left out because the parameter had no value for those cells.</p>`
      : '';
  const body =
    blocks.length === 0 ? '<p class="muted">No recommended actions.</p>' : blocks.join('');
  return `<h2 class="band">Recommended actions${ARCS}</h2><p class="muted">Grouped by area, most widespread first.</p><div class="actions">${body}</div>${note}`;
}

interface ParameterGroup {
  readonly title: string;
  readonly cluster: ClusterKey | null;
  readonly keys: readonly string[];
}

function parameterGroups(keys: readonly string[]): ParameterGroup[] {
  const groups: ParameterGroup[] = CLUSTER_KEYS.map((cluster) => ({
    title: clusterLabel(cluster),
    cluster,
    keys: keys.filter((key) => isMetricKey(key) && getMetric(key).cluster === cluster),
  }));
  groups.push({
    title: 'Other parameters',
    cluster: null,
    keys: keys.filter((key) => !isMetricKey(key)),
  });
  return groups.filter((group) => group.keys.length > 0);
}

function parameterRow(cells: readonly GridAnalysisFeature[], key: string): string {
  const values = metricValues(cells, key);
  const meta = isMetricKey(key) ? getMetric(key) : null;
  const has = values.length > 0;
  const mean = has ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const name =
    `<strong>${escapeHtml(metricLabel(key))}</strong>` +
    (meta === null ? '' : `<small>${escapeHtml(meta.fullName)}</small>`) +
    (meta?.note === undefined ? '' : `<small>${escapeHtml(meta.note)}</small>`);
  const range =
    meta?.scope === 'farm'
      ? '<td class="num muted" colspan="2">Same for the whole farm</td>'
      : td(withUnit(key, has ? Math.min(...values) : undefined), 'num') +
        td(withUnit(key, has ? Math.max(...values) : undefined), 'num');
  return `<tr><td>${name}</td>${td(withUnit(key, mean), 'num strong')}${range}${td(formatCount(values.length), 'num')}</tr>`;
}

function parametersBody(cells: readonly GridAnalysisFeature[], keys: readonly string[]): string {
  const body =
    keys.length === 0
      ? '<p class="muted">No parameter values in this analysis.</p>'
      : `<div class="xscroll"><table class="params"><thead><tr>${th('Parameter')}${th('Average of cells', 'num')}${th('Lowest cell', 'num')}${th('Highest cell', 'num')}${th('Cells', 'num')}</tr></thead><tbody>${parameterGroups(
          keys,
        )
          .map(
            (group) =>
              `<tr class="group"><th colspan="5">${escapeHtml(group.title)}</th></tr>` +
              group.keys.map((key) => parameterRow(cells, key)).join(''),
          )
          .join('')}</tbody></table></div>`;
  return `<h2 class="band">All parameters${ARCS}</h2><p class="muted">Every parameter the analysis returned: the average of the cells, and the lowest and highest cell.</p>${body}`;
}

function cellAdvisories(cell: GridAnalysisFeature, keys: readonly string[]): string {
  return Object.entries(cell.properties.advisories ?? {})
    .filter(([metric]) => keys.includes(metric) && hasMetricValue(cell, metric))
    .map(([metric, text]) => `${metricLabel(metric)}: ${text}`)
    .join(' | ');
}

function cellTable(cells: readonly GridAnalysisFeature[], group: ParameterGroup): string {
  const { cluster, keys } = group;
  const head =
    th('Cell') +
    (cluster === null ? '' : th('Score', 'num')) +
    keys.map((key) => th(metricHeading(key), 'num')).join('') +
    th('Advice');
  const rows = cells
    .map((cell) => {
      const raw = cell.properties.raw_metrics ?? {};
      const score = cluster === null ? null : clusterScore(cell, cluster);
      return (
        `<tr>${td(String(gridIdOf(cell)))}` +
        (cluster === null ? '' : td(score2(score), `num score ${ratingOf(score)}`)) +
        keys.map((key) => td(cellText(key, raw[key]), 'num')).join('') +
        `${td(cellAdvisories(cell, keys), 'wrap')}</tr>`
      );
    })
    .join('');
  return `<div class="scroll"><table class="cells"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function cellsBody(cells: readonly GridAnalysisFeature[], keys: readonly string[]): string {
  // Short lists open by default; long ones stay collapsed so the report is easy to scroll.
  const open = cells.length <= 100 ? ' open' : '';
  const blocks = parameterGroups(keys).map(
    (group) =>
      `<details${open}><summary>${escapeHtml(group.title)} <span class="muted">${formatCount(cells.length)} cells, ${formatCount(group.keys.length)} parameters</span></summary>` +
      `${cellTable(cells, group)}</details>`,
  );
  return (
    `<h2 class="band">Cell-by-cell data${ARCS}</h2>` +
    '<p class="muted">Every value for every grid cell, one table per area. Click a heading to open or close it; only open tables appear when printing.</p>' +
    blocks.join('')
  );
}

function notesHtml(keys: readonly string[], hasMap: boolean): string {
  const notes: string[] = [];
  for (const key of keys) {
    if (!isMetricKey(key)) continue;
    const meta = getMetric(key);
    if (meta.scaleUnverified) {
      notes.push(
        `${meta.label}: its scale does not match the advice thresholds, so treat its advice with care.`,
      );
    }
  }
  if (hasMap) {
    notes.push(
      'Map imagery: OpenStreetMap contributors (Streets) or Esri, Maxar, Earthstar Geographics and the GIS User Community (Satellite and Hybrid), depending on the basemap selected.',
    );
  }
  notes.push(
    'Satellite data: Copernicus Sentinel-2 (optical) and Sentinel-1 (radar), European Space Agency. Weather: Open-Meteo.',
  );
  return `<ul class="notes">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------------------------

interface TocEntry {
  readonly title: string;
  readonly id: string;
  readonly page: number;
  readonly subs: readonly { readonly title: string; readonly id: string; readonly page: number }[];
}

function coverHtml(ctx: Context, generated: string, toc: readonly TocEntry[]): string {
  const { request, farm, imagery } = ctx.input;
  const imageDate = safeDate(imagery?.image_date);
  const satelliteText =
    imageDate ?? (ctx.period === null ? 'Not recorded' : 'All passes in the period');

  const heroMap =
    ctx.cells.length > 0
      ? fieldMapSvg({
          cells: ctx.cells,
          farm,
          fillOf: (cell) => {
            const ndvi = cell.properties.raw_metrics?.ndvi;
            return hasMetricValue(cell, 'ndvi') && ndvi !== undefined && NDVI_BANDS !== undefined
              ? scaleColour(NDVI_BANDS, ndvi)
              : '#8fd6e2';
          },
          label: 'Field outline coloured by NDVI',
          north: false,
        })
      : null;

  const details: [string, string, string][] = [];
  if (request) details.push(['Crop', cropCategoryLabel(request.crop_category), '']);
  if (farm) {
    const ha = areaHectares(farm);
    details.push([
      'Field area',
      `${formatCount(Math.round(ha * 10_000))} m² (approx.)`,
      `${formatHectares(ha)} · ${formatAcres(areaAcres(farm))}`,
    ]);
    const [minX, minY, maxX, maxY] = farmBbox(farm);
    if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
      details.push([
        'Field location',
        `Latitude ${formatNumber((minY + maxY) / 2, 4)}`,
        `Longitude ${formatNumber((minX + maxX) / 2, 4)}`,
      ]);
    }
  }
  if (ctx.period !== null) details.push(['Period', ctx.period, '']);
  if (request) {
    details.push([
      'Grid',
      `${formatCount(ctx.cells.length)} cells`,
      `${formatCount(request.grid_size)} m cell size`,
    ]);
  } else {
    details.push(['Grid cells', formatCount(ctx.cells.length), '']);
  }
  if (ctx.opticalDate !== null || ctx.radarDate !== null) {
    details.push([
      'Satellite passes used',
      `Optical ${ctx.opticalDate ?? NO_VALUE}`,
      `Radar ${ctx.radarDate ?? NO_VALUE}`,
    ]);
  }

  const detailCards = details
    .map(
      ([label, value, extra]) =>
        `<div class="card"><span class="mark">${MARK}</span><dl style="margin:0"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>${extra === '' ? '' : `<dd class="muted" style="font-weight:400;font-size:11px">${escapeHtml(extra)}</dd>`}</dl></div>`,
    )
    .join('');

  const rows = toc
    .map(
      (entry, i) =>
        `<tr class="main"><td>${String(i + 1)}</td><td><a href="#${entry.id}">${escapeHtml(entry.title)}</a></td><td>${String(entry.page)}</td></tr>` +
        entry.subs
          .map(
            (sub) =>
              `<tr class="sub"><td></td><td><a href="#${sub.id}">${escapeHtml(sub.title)}</a></td><td>${String(sub.page)}</td></tr>`,
          )
          .join(''),
    )
    .join('');

  return (
    `<div class="brand"><span class="mark">${MARK}</span><div><b>Farmland Insights</b><small>Satellite-based crop health monitoring</small></div></div>` +
    `<div class="hero">${ARCS}<div>` +
    '<h1>Field Report</h1>' +
    '<p>Satellite monitoring results for one of your fields: radar, crop health and irrigation indices for the chosen satellite pass, with the actions they suggest.</p>' +
    '<div class="pills">' +
    `<div class="pill"><span class="mark">${MARK}</span><div><small>Report generation date</small><b>${escapeHtml(generated.slice(0, 10))}</b></div></div>` +
    `<div class="pill"><span class="mark">${MARK}</span><div><small>Satellite image date</small><b>${escapeHtml(satelliteText)}</b></div></div>` +
    `</div></div><div class="hero-art">${heroMap ?? ''}</div></div>` +
    `<p class="section-label">Field details</p><div class="details">${detailCards}</div>` +
    `<p class="section-label">Contents</p><table class="toc"><thead><tr><th>Serial no.</th><th>Title</th><th>Page no.</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="muted" style="font-size:11px;margin-top:10px">Generated ${escapeHtml(generated)} UTC</p>`
  );
}

// ---------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------

interface Page {
  readonly id: string;
  readonly html: string;
}

function groupPages(group: ReportIndexGroup, ctx: Context): Page[] {
  return group.indices.map((index, i) => ({
    id: indexId(index),
    html:
      (i === 0 ? `<h2 class="band" id="${group.id}">${escapeHtml(group.title)}${ARCS}</h2>` : '') +
      `<div id="${indexId(index)}-body">${indexBody(index, ctx)}</div>`,
  }));
}

function pageHead(number: number, total: number): string {
  const progress = total <= 1 ? 100 : (number / total) * 100;
  return `<div class="page-head" aria-hidden="true"><span class="mark">${MARK}</span><span class="progress"><i style="width:${progress.toFixed(0)}%"></i></span><span class="pno">${pad2(number)}</span></div>`;
}

/**
 * A self-contained HTML report laid out as A4 pages: a cover with the field details and contents,
 * a field summary, one page per satellite index (radar, crop health, irrigation), the recommended
 * actions, and every parameter and cell value as an appendix.
 */
export function buildHtmlReport(input: ReportInput): string {
  const { cells, request } = input;
  const keys = orderedMetricKeys(cells);
  const hasMap = safeMapImage(input.mapImage) !== null;
  const generated = input.generatedAt.toISOString().replace('T', ' ').slice(0, 19);
  const stats = farmClusterStats(cells);
  const ctx: Context = {
    input,
    cells,
    areas: cells.map(cellArea),
    advisories: groupAdvisories(cells),
    opticalDate: safeDate(input.imagery?.optical_date),
    radarDate: safeDate(input.imagery?.radar_date),
    period: request ? `${request.start_date} to ${request.end_date}` : null,
  };

  const pages: Page[] = [{ id: 'summary', html: summaryBody(ctx, stats) }];
  const groupStart = new Map<string, number>();
  for (const group of REPORT_INDEX_GROUPS) {
    groupStart.set(group.id, pages.length);
    pages.push(...groupPages(group, ctx));
  }
  pages.push({ id: 'actions', html: actionsBody(ctx) });
  pages.push({ id: 'parameters', html: parametersBody(cells, keys) });
  if (cells.length > 0) pages.push({ id: 'cells', html: cellsBody(cells, keys) });

  // The cover is page 1, so body page i is number i + 2.
  const numberOf = (id: string): number => pages.findIndex((page) => page.id === id) + 2;
  const toc: TocEntry[] = [
    {
      title: 'Field summary',
      id: 'summary',
      page: numberOf('summary'),
      subs: [
        { title: 'Scores by area', id: 'scores', page: numberOf('summary') },
        ...(hasMap ? [{ title: 'Field map', id: 'map', page: numberOf('summary') }] : []),
      ],
    },
    ...REPORT_INDEX_GROUPS.map((group) => ({
      title: group.title,
      id: group.id,
      page: (groupStart.get(group.id) ?? 0) + 2,
      subs: group.indices.map((index) => ({
        title: index.bands === undefined ? index.name : `${index.short} (${index.name})`,
        id: indexId(index),
        page: numberOf(indexId(index)),
      })),
    })),
    { title: 'Recommended actions', id: 'actions', page: numberOf('actions'), subs: [] },
    { title: 'All parameters', id: 'parameters', page: numberOf('parameters'), subs: [] },
    ...(cells.length > 0
      ? [{ title: 'Cell-by-cell data', id: 'cells', page: numberOf('cells'), subs: [] }]
      : []),
  ];

  const total = pages.length + 1;
  const body = pages
    .map(
      (page, i) =>
        `<section class="page" id="${page.id}">${pageHead(i + 2, total)}${page.html}` +
        (i === pages.length - 1
          ? `<div class="closing">Keep monitoring your field</div>${notesHtml(keys, hasMap)}<footer>Generated by Farmland Insights. Values are model outputs for guidance, not measurements.</footer>`
          : '') +
        '</section>',
    )
    .join('\n');

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Farmland Insights report</title>',
    `<style>${REPORT_STYLE}</style></head><body><main>`,
    `<section class="page" id="cover">${coverHtml(ctx, generated, toc)}</section>`,
    body,
    '</main></body></html>',
  ].join('\n');
}
