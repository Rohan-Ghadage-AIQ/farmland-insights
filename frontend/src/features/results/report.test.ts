import { describe, expect, it } from 'vitest';
import type { FarmAnalysisRequest, FarmFeatureCollection } from '@/domain';
import {
  GOOD_SCORE,
  buildHtmlReport,
  escapeHtml,
  ratingOf,
  reportFilename,
  type ReportLegend,
} from './report';
import { makeCell } from './test-support';

const GENERATED = new Date('2024-02-16T09:30:00Z');

const REQUEST: FarmAnalysisRequest = {
  farm_geojson: { type: 'FeatureCollection', features: [] },
  start_date: '2024-01-01',
  end_date: '2024-02-15',
  crop_category: 'cereals_c3_temperate',
  grid_size: 50,
};

const FARM: FarmFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [72.4, 23.6],
            [72.405, 23.6],
            [72.405, 23.605],
            [72.4, 23.605],
            [72.4, 23.6],
          ],
        ],
      },
      properties: {},
    },
  ],
};

// Cell 1 scores low on canopy (0.30), cell 2 is fine everywhere.
const CELLS = [
  makeCell('1', {
    metrics: { ndvi: 0.31, gndvi: 0.2, lst: 28.5, t2m: 22.4 },
    cpi: { Structural: 0.3, Chlorophyll: 0.8, Environmental: 0.55 },
    advisories: { ndvi: 'Scout this cell for pests.' },
  }),
  makeCell('2', {
    metrics: { ndvi: 0.55, gndvi: 0.4, lst: 29.1, t2m: 22.4 },
    cpi: { Structural: 0.6, Chlorophyll: 0.5, Environmental: 0.55 },
    advisories: { ndvi: 'Scout this cell for pests.' },
  }),
];

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const LEGEND: ReportLegend = {
  title: 'Canopy structure',
  unit: null,
  gradient: 'linear-gradient(to right, #440154 0%, #21908d 50%, #fde725 100%)',
  min: '0.00',
  max: '1.00',
};

const FULL = buildHtmlReport({
  cells: CELLS,
  request: REQUEST,
  farm: FARM,
  imagery: { image_date: '2024-02-10', optical_date: '2024-02-10', radar_date: '2024-02-09' },
  mapImage: PNG,
  legend: LEGEND,
  generatedAt: GENERATED,
});

/** The HTML of one report page (`<section class="page" id="...">`). */
function pageOf(html: string, id: string): string {
  const start = html.indexOf(`<section class="page" id="${id}">`);
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  return html.slice(start, end < 0 ? undefined : end + '</section>'.length);
}

describe('escapeHtml', () => {
  it('escapes the five characters that matter in HTML text and attributes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('reportFilename', () => {
  it('names the file after the analysis period', () => {
    expect(reportFilename(REQUEST, GENERATED)).toBe(
      'farmland-report-2024-01-01_to_2024-02-15.html',
    );
  });

  it('falls back to the generation date without a request', () => {
    expect(reportFilename(null, GENERATED)).toBe('farmland-report-2024-02-16.html');
  });
});

describe('ratingOf', () => {
  it.each([
    [null, 'none'],
    [0, 'attention'],
    [0.39, 'attention'],
    [0.4, 'fair'],
    [GOOD_SCORE - 0.01, 'fair'],
    [GOOD_SCORE, 'good'],
    [1, 'good'],
  ] as const)('rates %s as %s', (score, rating) => {
    expect(ratingOf(score)).toBe(rating);
  });
});

describe('buildHtmlReport structure', () => {
  it('is a complete, self-contained HTML document with no scripts or external requests', () => {
    expect(FULL.startsWith('<!doctype html>')).toBe(true);
    expect(FULL).toContain('<title>Farmland Insights report</title>');
    expect(FULL).toContain('Generated 2024-02-16 09:30:00 UTC');
    expect(FULL).not.toMatch(/<script/i);
    expect(FULL).not.toMatch(/(?:src|href)="https?:/i);
    expect(FULL).not.toMatch(/url\(/i);
  });

  it('opens with a cover: field details, report and satellite dates, and a contents table', () => {
    const cover = pageOf(FULL, 'cover');
    expect(cover).toContain('<h1>Field Report</h1>');
    for (const text of ['Cereals', '2024-01-01 to 2024-02-15', '50 m cell size', '2 cells']) {
      expect(cover).toContain(text);
    }
    expect(cover).toMatch(/Field area<\/dt><dd>[\d,]+ m² \(approx\.\)/);
    expect(cover).toMatch(/Field location<\/dt><dd>Latitude 23\.6025/);
    expect(cover).toContain('<small>Report generation date</small><b>2024-02-16</b>');
    expect(cover).toContain('<small>Satellite image date</small><b>2024-02-10</b>');
    expect(cover).toContain('Optical 2024-02-10');
    expect(cover).toContain('Radar 2024-02-09');
    for (const id of [
      'summary',
      'scores',
      'map',
      'radar',
      'crop-health',
      'irrigation',
      'actions',
      'parameters',
      'cells',
    ]) {
      expect(cover).toContain(`href="#${id}"`);
      expect(FULL).toContain(`id="${id}"`);
    }
    for (const title of [
      'Radar (RVI, RSM)',
      'RVI (Radar Vegetation Index)',
      'RSM (Radar Soil Moisture)',
      'Crop Health (NDVI, EVI, SAVI, NDRE)',
      'NDRE (Normalized Difference Red Edge)',
      'Irrigation (NDWI, Farmonaut NDWI, NDMI, Evapotranspiration)',
      'NDWI (Normalized Difference Water Index)',
      'Farmonaut NDWI (Normalized Difference Water Index, crop water)',
      'NDMI (Normalized Difference Moisture Index)',
      '>Evapotranspiration<',
    ]) {
      expect(cover).toContain(title);
    }
  });

  it('puts the pages in reading order, one per index, numbered as the contents says', () => {
    const ids = [...FULL.matchAll(/<section class="page" id="([^"]+)">/g)].map((m) => m[1]);
    expect(ids).toEqual([
      'cover',
      'summary',
      'index-rvi',
      'index-rsm',
      'index-ndvi',
      'index-evi',
      'index-savi',
      'index-ndre',
      'index-ndwi',
      'index-ndwi-farmonaut',
      'index-ndmi',
      'index-et-actual',
      'actions',
      'parameters',
      'cells',
    ]);
    // The contents row for NDVI and the NDVI page's own number agree.
    expect(pageOf(FULL, 'cover')).toMatch(/href="#index-ndvi">NDVI[^<]*<\/a><\/td><td>5<\/td>/);
    expect(pageOf(FULL, 'index-ndvi')).toContain('<span class="pno">05</span>');
    expect(pageOf(FULL, 'cells')).toContain('<span class="pno">15</span>');
  });

  it('keeps the how-to-read guide on the summary page', () => {
    const summary = pageOf(FULL, 'summary');
    expect(summary).toContain('How to read this report');
    expect(summary).toContain('higher is better');
  });
});

describe('summary', () => {
  it('says how much of the farm needs attention, in plain words', () => {
    expect(FULL).toContain('<span class="big">50%</span>');
    expect(FULL).toContain('of the field needs attention');
    expect(FULL).toContain('1 of 2 cells score below 0.40 in at least one area');
  });

  it('names the weakest and strongest areas with their average scores', () => {
    expect(FULL).toMatch(
      /<span class="big">Canopy structure<\/span><span>is the weakest area<\/span>/,
    );
    expect(FULL).toMatch(
      /<span class="big">Chlorophyll<\/span><span>is the strongest area<\/span>/,
    );
    expect(FULL).toContain('Average score 0.45');
  });

  it('lists the most widespread actions with the share of the farm they cover', () => {
    expect(FULL).toContain('Most widespread actions');
    expect(FULL).toMatch(
      /<strong>NDVI:<\/strong> Scout this cell for pests\. <span class="muted">\(100% of the field\)/,
    );
  });

  it('turns green when no cell needs attention', () => {
    const fine = makeCell('1', { metrics: { ndvi: 0.6 }, cpi: { Structural: 0.8 } });
    const html = buildHtmlReport({ cells: [fine], generatedAt: GENERATED });
    expect(html).toContain('<div class="tile good"><span class="big">0%</span>');
  });
});

describe('scores by area', () => {
  it('shows a bar, a number and a rating for every area, with its meaning', () => {
    expect(FULL).toContain('How dense and vigorous the crop canopy is');
    expect(FULL).toContain('class="fill fair" style="width:45%"');
    expect(FULL).toContain('class="fill fair" style="width:65%"');
    expect(FULL).toContain('<span class="chip fair">Fair</span>');
  });

  it('marks areas with no data instead of inventing a score', () => {
    // No water or agro-meteo metrics exist in the fixtures.
    expect(FULL).toContain('class="fill none" style="width:0%"');
    expect(FULL).toContain('<span class="chip none">No data</span>');
    expect(FULL).toContain('0 of 2 cells');
  });
});

describe('map section', () => {
  it('embeds the image and a colour key built from the map legend', () => {
    expect(pageOf(FULL, 'summary')).toContain(`<img class="photo" src="${PNG}"`);
    expect(FULL).toContain('Farm boundary and analysis grid');
    expect(FULL).toContain('background-image:linear-gradient(to right, #440154 0%');
    expect(FULL).toContain('<strong>Canopy structure</strong>');
    expect(FULL).toContain('OpenStreetMap contributors');
  });

  it.each([
    'linear-gradient(red, url(https://evil.example/x))',
    'linear-gradient(to right, #fff);background:url(x)',
    'linear-gradient(to right, expression(alert(1)))',
    'url(https://evil.example/x)',
  ])('refuses a legend gradient that is not plain colour stops: %s', (gradient) => {
    const html = buildHtmlReport({
      cells: CELLS,
      mapImage: PNG,
      legend: { ...LEGEND, gradient },
      generatedAt: GENERATED,
    });
    expect(html).not.toContain('class="legend-bar"');
    expect(html).not.toMatch(/url\(|expression/i);
  });

  it('accepts rgb() colour stops too', () => {
    const html = buildHtmlReport({
      cells: CELLS,
      mapImage: PNG,
      legend: {
        ...LEGEND,
        gradient: 'linear-gradient(to right, rgb(68, 1, 84) 0%, rgb(253, 231, 37) 100%)',
      },
      generatedAt: GENERATED,
    });
    expect(html).toContain('class="legend-bar"');
  });

  it('leaves the map photo, its contents entry and its attribution out when there is none', () => {
    const html = buildHtmlReport({ cells: CELLS, mapImage: null, generatedAt: GENERATED });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="#map"');
    expect(html).not.toContain('OpenStreetMap contributors');
  });

  it.each([
    'javascript:alert(1)',
    'https://evil.example/x.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,AAAA"onerror="alert(1)',
  ])('refuses a map image that is not a plain PNG data URL: %s', (mapImage) => {
    const html = buildHtmlReport({ cells: CELLS, mapImage, generatedAt: GENERATED });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
  });
});

describe('parameters', () => {
  it('groups parameters under their area with full names and a farm average', () => {
    expect(FULL).toContain('<tr class="group"><th colspan="5">Canopy structure</th></tr>');
    expect(FULL).toContain('<tr class="group"><th colspan="5">Environment</th></tr>');
    expect(FULL).toContain('Normalized Difference Vegetation Index');
    expect(FULL).toMatch(
      /<strong>NDVI<\/strong>.*?<td class="num strong">0\.43<\/td><td class="num">0\.31<\/td><td class="num">0\.55<\/td>/,
    );
  });

  it('says a farm-wide parameter is the same everywhere instead of a fake range', () => {
    expect(FULL).toContain('Same for the whole farm');
    expect(FULL).toContain('<div class="xscroll"><table class="params">');
  });

  it('leaves parameters out when no cell has them', () => {
    expect(FULL).not.toContain('<strong>VCI</strong>');
  });
});

describe('cell-by-cell data', () => {
  it('gives each area its own table with a colour-coded score and every cell value', () => {
    expect(FULL).toContain('<h2 class="band">Cell-by-cell data');
    expect(FULL).toContain('<td class="num score attention">0.30</td>');
    expect(FULL).toContain('<td class="num score fair">0.60</td>');
    expect(FULL).toContain('<td class="num score good">0.80</td>');
    const tables = FULL.match(/<table class="cells">/g) ?? [];
    expect(tables.length).toBeGreaterThanOrEqual(3);
    const rows = FULL.match(/<tr><td>[12]<\/td>/g) ?? [];
    expect(rows.length).toBe(CELLS.length * tables.length);
  });

  it('keeps advice next to the area it belongs to', () => {
    const canopy =
      /<details[^>]*><summary>Canopy structure[\s\S]*?<\/details>/.exec(FULL)?.[0] ?? '';
    expect(canopy).toContain('NDVI: Scout this cell for pests.');
    const environment =
      /<details[^>]*><summary>Environment[\s\S]*?<\/details>/.exec(FULL)?.[0] ?? '';
    expect(environment).not.toContain('Scout this cell');
  });

  it('opens short lists and collapses long ones', () => {
    expect(FULL).toContain('<details open><summary>Canopy structure');
    const many = Array.from({ length: 101 }, (_, i) =>
      makeCell(String(i + 1), { metrics: { ndvi: 0.5 } }),
    );
    const html = buildHtmlReport({ cells: many, generatedAt: GENERATED });
    expect(html).toContain('<details><summary>Canopy structure');
    expect(html).not.toContain('<details open>');
  });

  it('shows a dash for a value a cell has no data for', () => {
    const withLst = makeCell('1', { metrics: { ndvi: 0.4, lst: 30 } });
    const withoutLst = makeCell('2', { metrics: { ndvi: 0.5 } });
    const html = buildHtmlReport({ cells: [withLst, withoutLst], generatedAt: GENERATED });
    const environment =
      /<details[^>]*><summary>Environment[\s\S]*?<\/details>/.exec(html)?.[0] ?? '';
    expect(environment).toContain('>—<');
  });
});

describe('actions', () => {
  it('groups merged advice by area with the share of the farm it applies to', () => {
    expect(FULL).toContain('<h3>Canopy structure</h3>');
    expect(FULL).toContain('100% of the field (2 cells)');
  });

  it('says so when there is nothing to recommend', () => {
    const html = buildHtmlReport({ cells: [], generatedAt: GENERATED });
    expect(html).toContain('No recommended actions.');
  });
});

describe('untrusted text', () => {
  it('escapes advice text and unknown parameter names from the server', () => {
    const cell = makeCell('7', {
      metrics: { '<b>weird</b>': 1.5, ndvi: 0.4 },
      advisories: { ndvi: '<img src=x onerror=alert(1)>' },
    });
    const html = buildHtmlReport({ cells: [cell], generatedAt: GENERATED });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>weird</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;weird&lt;/b&gt;');
    expect(html).toContain('Other parameters');
  });

  it('still builds a valid report with no cells', () => {
    const html = buildHtmlReport({ cells: [], generatedAt: GENERATED });
    expect(html).toContain('There are no grid cells in this analysis.');
    expect(html).not.toContain('Cell-by-cell data');
    expect(html).toContain('No RVI data for this field');
  });

  it('drops imagery dates that are not plain calendar dates', () => {
    const html = buildHtmlReport({
      cells: CELLS,
      imagery: { image_date: '<script>', optical_date: '2024-02-10"><b>', radar_date: null },
      generatedAt: GENERATED,
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('2024-02-10"');
    expect(html).toContain('<small>Satellite image date</small><b>Not recorded</b>');
  });
});

describe('index pages', () => {
  const ndvi = pageOf(FULL, 'index-ndvi');

  it('opens each group with its title band and explains the index', () => {
    expect(ndvi).toContain('<h2 class="band" id="crop-health">Crop Health (NDVI, EVI, SAVI, NDRE)');
    expect(ndvi).toContain('<h3 class="idx">NDVI (Normalized Difference Vegetation Index)</h3>');
    expect(ndvi).toContain('Scientific background');
    expect(ndvi).toContain('NDVI = (NIR − Red) / (NIR + Red)');
    expect(pageOf(FULL, 'index-evi')).not.toContain('class="band"');
  });

  it('draws the field coloured by the index, with the pass it came from', () => {
    expect(ndvi).toContain('<svg class="field-map"');
    expect(ndvi).toContain('aria-label="NDVI map of the field"');
    // 0.31 falls in the 4th of ten classes, 0.55 in the 6th.
    expect(ndvi).toContain('fill="#fdae61"');
    expect(ndvi).toContain('fill="#d9ef8b"');
    expect(ndvi).toContain('<b>Sentinel-2 optical</b> pass of 2024-02-10');
    expect(pageOf(FULL, 'index-rvi')).toContain('<b>Sentinel-1 radar</b>');
  });

  it('shows the analysis scale, its bands and the field average with its rating', () => {
    expect(ndvi).toContain('<p class="scale-name">NDVI</p>');
    expect(ndvi).toContain('Good<b>≥ 0.6</b>');
    expect(ndvi).toContain('Medium<b>0.3 – 0.6</b>');
    expect(ndvi).toContain('Bad<b>< 0.3</b>');
    expect(ndvi).toMatch(/<b>0\.43<\/b> <span class="chip medium">Medium<\/span>/);
  });

  it('splits the field area into Good, Medium and Bad and lists the index’s own advice', () => {
    // Both cells are equal squares and both read Medium.
    expect(ndvi).toContain('<span>● Medium</span><b>100%</b>');
    expect(ndvi).toContain('<span>● Good</span><b>0%</b>');
    expect(ndvi).toContain('What to do');
    expect(ndvi).toContain(
      'Scout this cell for pests. <span class="muted">(100% of the field)</span>',
    );
  });

  it('says plainly when an index has no data instead of drawing an empty map', () => {
    const rsm = pageOf(FULL, 'index-rsm');
    expect(rsm).toContain('No RSM data for this field');
    expect(rsm).not.toContain('<svg class="field-map"');
  });

  it('runs NDWI the other way round: positive (standing water) is red', () => {
    const wet = makeCell('1', { metrics: { ndwi: 0.9 } });
    const html = buildHtmlReport({ cells: [wet], generatedAt: GENERATED });
    const page = pageOf(html, 'index-ndwi');
    expect(page).toContain('Good<b>≤ −0.3</b>');
    expect(page).toContain('fill="#a50026"');
    expect(page).toMatch(/<span class="chip bad">Bad<\/span>/);
  });

  it('shows farm-wide evapotranspiration as one value with a daily equivalent', () => {
    const cell = makeCell('1', { metrics: { et_actual: 0.2 } });
    const html = buildHtmlReport({ cells: [cell], request: REQUEST, generatedAt: GENERATED });
    const page = pageOf(html, 'index-et-actual');
    expect(page).toContain('<h3 class="idx">Evapotranspiration</h3>');
    expect(page).toContain('≈ 4.8 mm per day');
    expect(page).toContain('Weather data, 2024-01-01 to 2024-02-15');
    expect(page).not.toContain('<svg class="field-map"');
  });

  it('says every pass was combined when no satellite date was chosen', () => {
    const html = buildHtmlReport({ cells: CELLS, request: REQUEST, generatedAt: GENERATED });
    expect(pageOf(html, 'index-ndvi')).toContain(
      '<b>Sentinel-2 optical</b>, every pass from 2024-01-01 to 2024-02-15 combined',
    );
    expect(pageOf(html, 'cover')).toContain('<b>All passes in the period</b>');
  });
});
