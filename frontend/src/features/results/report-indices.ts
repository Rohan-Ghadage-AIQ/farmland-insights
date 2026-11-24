import type { MetricKey } from '@/domain';

/**
 * The satellite indices the report gives a page each, grouped the way an agronomist reads them:
 * radar, crop health, irrigation. The Good / Medium / Bad bands are a reading aid for the report,
 * not crop-specific thresholds (those drive the advice text, which comes from the backend).
 */

export type IndexSensor = 'radar' | 'optical' | 'weather';

export interface IndexBands {
  /** Value range the colour scale covers; values outside it take the end colour. */
  readonly domain: readonly [number, number];
  /** Boundary between Bad and Medium, and between Medium and Good, in scale order. */
  readonly cuts: readonly [number, number];
  /** False when lower values are the healthy end (NDWI: positive means standing water). */
  readonly higherIsBetter: boolean;
}

export interface ReportIndex {
  readonly key: MetricKey;
  /** Abbreviation shown large on the scale card. */
  readonly short: string;
  readonly name: string;
  /** What the index tells the farmer, in two or three words. */
  readonly tagline: string;
  /** A second, smaller line under the tagline. */
  readonly hint: string;
  readonly sensor: IndexSensor;
  /** What the map shows and when to look at it. */
  readonly about: string;
  /** How it is measured. */
  readonly background: string;
  /** Absent for farm-wide values, which have no map or bands. */
  readonly bands?: IndexBands;
}

export interface ReportIndexGroup {
  readonly id: string;
  readonly title: string;
  readonly indices: readonly ReportIndex[];
}

const UNIT: IndexBands['domain'] = [0, 1];

const RVI: ReportIndex = {
  key: 'rvi',
  short: 'RVI',
  name: 'Radar Vegetation Index',
  tagline: 'Crop health (radar)',
  hint: 'Works through heavy cloud',
  sensor: 'radar',
  about:
    'Radar map of how much crop is standing in the field. Red areas have little biomass or bare soil; green areas have a dense, growing canopy. Use it when clouds hide the optical images.',
  background:
    'Sentinel-1 sends microwaves to the ground and records the echo in two polarisations, VV and VH. Leaves and stems scatter the signal in random directions, which strengthens the cross-polarised VH echo. RVI = 4·VH / (VV + VH) is close to 0 over smooth bare soil and rises as the crop grows, levelling off once the canopy closes. Microwaves pass through cloud, so RVI is available in any weather.',
  bands: { domain: UNIT, cuts: [0.3, 0.6], higherIsBetter: true },
};

const RSM: ReportIndex = {
  key: 'rsm',
  short: 'RSM',
  name: 'Radar Soil Moisture',
  tagline: 'Soil moisture (radar)',
  hint: 'Works through heavy cloud',
  sensor: 'radar',
  about:
    'Relative wetness of the top few centimetres of soil: 0 is the driest and 1 the wettest this field has been over the past year. Red areas are drier than usual for this field.',
  background:
    'Wet soil reflects more radar energy than dry soil. RSM places this pass’s VV echo between the field’s own driest (5th percentile) and wettest (95th percentile) echo over the previous 12 months, a method known as change detection. It is relative to the field, not a volumetric measurement, and a dense canopy weakens the soil signal.',
  bands: { domain: UNIT, cuts: [0.25, 0.5], higherIsBetter: true },
};

const NDVI: ReportIndex = {
  key: 'ndvi',
  short: 'NDVI',
  name: 'Normalized Difference Vegetation Index',
  tagline: 'Crop vigour',
  hint: 'Best from early growth to mid-season',
  sensor: 'optical',
  about:
    'Colour map of how green and vigorous the crop is. Red patches are growing less than the rest of the field and are worth a visit. NDVI stops changing once the canopy is very dense; use EVI or NDRE then.',
  background:
    'Healthy leaves absorb red light for photosynthesis and strongly reflect near-infrared (NIR) light. NDVI = (NIR − Red) / (NIR + Red) turns that contrast into a number from −1 to 1: bare soil reads about 0.1–0.2 and a dense, healthy crop above 0.6. It is computed from Sentinel-2 at 10 m resolution.',
  bands: { domain: UNIT, cuts: [0.3, 0.6], higherIsBetter: true },
};

const EVI: ReportIndex = {
  key: 'evi',
  short: 'EVI',
  name: 'Enhanced Vegetation Index',
  tagline: 'Vigour in dense canopy',
  hint: 'Best later in the season',
  sensor: 'optical',
  about:
    'Like NDVI, but it keeps telling healthy and stressed areas apart when the canopy is thick. Use it later in the season, once NDVI is high everywhere.',
  background:
    'EVI = 2.5·(NIR − Red) / (NIR + 6·Red − 7.5·Blue + 1). The blue band corrects for haze and dust in the air, and the extra terms damp the soil background, so EVI saturates far less than NDVI over dense crops.',
  bands: { domain: UNIT, cuts: [0.2, 0.5], higherIsBetter: true },
};

const SAVI: ReportIndex = {
  key: 'savi',
  short: 'SAVI',
  name: 'Soil Adjusted Vegetation Index',
  tagline: 'Vigour on sparse cover',
  hint: 'Best early, or in widely spaced crops',
  sensor: 'optical',
  about:
    'Vegetation map that corrects for bright soil showing between the plants. Use it early in the season or for row crops and orchards where much of the ground is still bare.',
  background:
    'When plants cover little of the ground, the soil’s brightness distorts NDVI. SAVI = 1.5·(NIR − Red) / (NIR + Red + 0.5) adds a soil-brightness correction (L = 0.5), so sparse stands on light and dark soils read comparably.',
  bands: { domain: UNIT, cuts: [0.25, 0.5], higherIsBetter: true },
};

const NDRE: ReportIndex = {
  key: 'ndre',
  short: 'NDRE',
  name: 'Normalized Difference Red Edge',
  tagline: 'Chlorophyll & nitrogen',
  hint: 'Best mid- to late-season',
  sensor: 'optical',
  about:
    'Shows leaf chlorophyll, and so nitrogen status. Red zones are the first candidates for a nutrient top-dressing. It stays informative after NDVI has levelled off.',
  background:
    'The red-edge band sits where leaf reflectance climbs steeply from red to near-infrared, and that slope shifts with chlorophyll content. NDRE = (NIR − RedEdge) / (NIR + RedEdge) reads deeper into the canopy than NDVI and saturates later, which makes it a practical guide for variable-rate nitrogen.',
  bands: { domain: UNIT, cuts: [0.2, 0.4], higherIsBetter: true },
};

const NDWI: ReportIndex = {
  key: 'ndwi',
  short: 'NDWI',
  name: 'Normalized Difference Water Index',
  tagline: 'Standing water',
  hint: 'Lower is normal; near 0 or above is water',
  sensor: 'optical',
  about:
    'Highlights standing water and waterlogged patches. Crop and dry soil read well below 0; values near or above 0 mean water on the surface, for example after heavy rain or over-irrigation. Red marks those wet patches.',
  background:
    'Open water absorbs near-infrared light almost completely but still reflects some green light. NDWI = (Green − NIR) / (Green + NIR), from Sentinel-2, is therefore positive over water and negative over vegetation and soil, which makes it the quickest way to spot ponding and drainage problems. For the water held inside the crop, see NDMI.',
  bands: { domain: [-1, 1], cuts: [-0.3, 0], higherIsBetter: false },
};

const FARMONAUT_NDWI: ReportIndex = {
  key: 'ndwi_farmonaut',
  short: 'Farmonaut NDWI',
  name: 'Normalized Difference Water Index, crop water',
  tagline: 'Water in the crop',
  hint: 'Higher is wetter; the NDWI Farmonaut reports',
  sensor: 'optical',
  about:
    'Water held in the crop canopy, computed the way Farmonaut computes its NDWI so the two reports can be compared directly. Red areas hold less water than the rest of the field. This is a different index from the NDWI above, which looks for standing water.',
  background:
    'Farmonaut NDWI = (NIR − SWIR2) / (NIR + SWIR2), from Sentinel-2 bands B8 (842 nm) and B12 (2190 nm). Leaf water absorbs the short-wave infrared, so wetter crops read higher. B12 is a 20 m band, resampled onto the 10 m grid.',
  bands: { domain: UNIT, cuts: [0.4, 0.7], higherIsBetter: true },
};

const NDMI: ReportIndex = {
  key: 'ndmi',
  short: 'NDMI',
  name: 'Normalized Difference Moisture Index',
  tagline: 'Crop water content',
  hint: 'Drops before drought stress is visible',
  sensor: 'optical',
  about:
    'Water content of the crop canopy. Red areas hold less water than the rest of the field and will suffer first in a dry spell, so check irrigation there first.',
  background:
    'Water in leaves absorbs short-wave infrared (SWIR) light, while near-infrared is reflected by the leaf structure whatever its water content. NDMI = (NIR − SWIR) / (NIR + SWIR) isolates the water signal, so it falls as plants dry out, often before wilting can be seen.',
  bands: { domain: [-0.2, 0.8], cuts: [0.2, 0.4], higherIsBetter: true },
};

const ET: ReportIndex = {
  key: 'et_actual',
  short: 'ET',
  name: 'Evapotranspiration',
  tagline: 'Water loss to the air',
  hint: 'Same for the whole field (weather data)',
  sensor: 'weather',
  about:
    'How much water leaves the field through evaporation from the soil and transpiration by the crop. High water loss together with low NDMI is a signal to irrigate; when NDWI and NDMI look normal it needs no action.',
  background:
    'Evapotranspiration (ET) combines soil evaporation and plant transpiration. It comes from weather data for the farm’s location, averaged over the report period, so it is one value for the whole field. Irrigation should roughly replace the water ET removes.',
};

export const REPORT_INDEX_GROUPS: readonly ReportIndexGroup[] = [
  { id: 'radar', title: 'Radar (RVI, RSM)', indices: [RVI, RSM] },
  {
    id: 'crop-health',
    title: 'Crop Health (NDVI, EVI, SAVI, NDRE)',
    indices: [NDVI, EVI, SAVI, NDRE],
  },
  {
    id: 'irrigation',
    title: 'Irrigation (NDWI, Farmonaut NDWI, NDMI, Evapotranspiration)',
    indices: [NDWI, FARMONAUT_NDWI, NDMI, ET],
  },
];

export type BandRating = 'good' | 'medium' | 'bad';

/** Good / Medium / Bad for a value, following the index's direction. */
export function bandOf(bands: IndexBands, value: number): BandRating {
  const [low, high] = bands.cuts;
  if (bands.higherIsBetter) {
    if (value >= high) return 'good';
    return value >= low ? 'medium' : 'bad';
  }
  if (value <= low) return 'good';
  return value <= high ? 'medium' : 'bad';
}

/** Ten classes from red (poor) to green (healthy), as on the analysis scale. */
export const SCALE_COLOURS: readonly string[] = [
  '#a50026',
  '#d73027',
  '#f46d43',
  '#fdae61',
  '#fee08b',
  '#d9ef8b',
  '#a6d96a',
  '#66bd63',
  '#1a9850',
  '#006837',
];

/** Which of the ten classes a value falls in (0 = left end of the scale). */
export function scaleClass(bands: IndexBands, value: number): number {
  const [min, max] = bands.domain;
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return Math.min(SCALE_COLOURS.length - 1, Math.floor(t * SCALE_COLOURS.length));
}

/** The colour for a value: red is always the poor end, whichever way the index runs. */
export function scaleColour(bands: IndexBands, value: number): string {
  const index = scaleClass(bands, value);
  const colour = bands.higherIsBetter
    ? SCALE_COLOURS[index]
    : SCALE_COLOURS[SCALE_COLOURS.length - 1 - index];
  return colour ?? '#cccccc';
}
