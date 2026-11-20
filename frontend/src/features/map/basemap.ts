import type { StyleSpecification } from 'maplibre-gl';
import { BASEMAP_RASTER_PAINT } from './color-scales';
import type { Theme } from './types';

export type BasemapKind = 'streets' | 'satellite' | 'hybrid';

/** Basemap configuration, read from `lib/env` by the caller (VITE_MAP_* variables). */
export interface BasemapConfig {
  /** VITE_MAP_STYLE_URL: a custom style that replaces the OSM default for "streets". */
  readonly styleUrl?: string | undefined;
  /** VITE_MAP_STYLE_SATELLITE_URL: a style URL, or a raster tile template containing `{z}`. */
  readonly satelliteUrl?: string | undefined;
  /** VITE_MAP_API_KEY, appended as `?key=` when the URL does not already carry one. */
  readonly apiKey?: string | undefined;
}

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const SATELLITE_ATTRIBUTION = 'Imagery &copy; the configured tile provider';

/** Free Esri tiles used when no VITE_MAP_STYLE_SATELLITE_URL is configured. No key needed. */
export const ESRI_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
/**
 * The deepest level Esri's imagery is reliably real. At level 19 many areas (rural India included)
 * return a "map data not yet available" placeholder, so the base looked blank past about 30 m on
 * the scale bar. Telling MapLibre the source stops at 18 makes it stretch the level-18 tiles when
 * you zoom in further, so the base never disappears.
 */
export const ESRI_MAX_ZOOM = 18;
export const ESRI_ATTRIBUTION =
  'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export const BASEMAP_ID = 'basemap';
export const BASEMAP_LABELS_ID = 'basemap-labels';

const BASEMAPS: readonly BasemapKind[] = ['streets', 'satellite', 'hybrid'];

/** Streets, Satellite and Hybrid are always offered: satellite falls back to the free Esri tiles. */
export function availableBasemaps(): readonly BasemapKind[] {
  return BASEMAPS;
}

// Manual string work rather than `new URL()`, which would percent-encode the `{z}/{x}/{y}` template.
function withKey(url: string, apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey === '' || /[?&]key=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
}

function rasterStyle(
  tileUrl: string,
  attribution: string,
  paint?: NonNullable<Extract<StyleSpecification['layers'][number], { type: 'raster' }>['paint']>,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      [BASEMAP_ID]: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [
      {
        id: BASEMAP_ID,
        type: 'raster',
        source: BASEMAP_ID,
        ...(paint === undefined ? {} : { paint }),
      },
    ],
  };
}

interface RasterLayerSpec {
  readonly id: string;
  readonly url: string;
  readonly attribution: string;
  /** Deepest level the tiles exist at; deeper zooms stretch it. */
  readonly maxzoom?: number;
}

/** Stacks undimmed raster layers bottom to top (satellite imagery, then optional labels). */
function stackedRasterStyle(layers: readonly RasterLayerSpec[]): StyleSpecification {
  return {
    version: 8,
    sources: Object.fromEntries(
      layers.map(({ id, url, attribution, maxzoom }) => [
        id,
        {
          type: 'raster' as const,
          tiles: [url],
          tileSize: 256,
          maxzoom: maxzoom ?? 19,
          attribution,
        },
      ]),
    ),
    layers: layers.map(({ id }) => ({ id, type: 'raster' as const, source: id })),
  };
}

export interface ResolveBasemapOptions {
  readonly config: BasemapConfig;
  readonly kind: BasemapKind;
  readonly theme: Theme;
}

/**
 * The `style` to hand to MapLibre. OSM raster by default (dimmed in the dark theme so that data
 * colours keep their contrast), a custom style when configured, and satellite or hybrid (imagery
 * plus place labels) from the configured tiles or the free Esri ones.
 * Custom styles are used as authored: pick a theme-appropriate one or accept that the 3:1 mark
 * contrast guarantee in DESIGN.md only covers the default OSM raster.
 */
export function resolveBasemapStyle({
  config,
  kind,
  theme,
}: ResolveBasemapOptions): StyleSpecification | string {
  if (kind === 'satellite' || kind === 'hybrid') {
    const configured = config.satelliteUrl;
    // A configured style URL is used as authored (it decides for itself whether it has labels).
    if (configured !== undefined && !configured.includes('{z}')) {
      return withKey(configured, config.apiKey);
    }
    const imagery: RasterLayerSpec =
      configured === undefined
        ? {
            id: BASEMAP_ID,
            url: ESRI_IMAGERY_URL,
            attribution: ESRI_ATTRIBUTION,
            maxzoom: ESRI_MAX_ZOOM,
          }
        : {
            id: BASEMAP_ID,
            url: withKey(configured, config.apiKey),
            attribution: SATELLITE_ATTRIBUTION,
          };
    return stackedRasterStyle(
      kind === 'hybrid'
        ? [
            imagery,
            {
              id: BASEMAP_LABELS_ID,
              url: ESRI_LABELS_URL,
              attribution: ESRI_ATTRIBUTION,
              maxzoom: ESRI_MAX_ZOOM,
            },
          ]
        : [imagery],
    );
  }
  if (config.styleUrl !== undefined) {
    return withKey(config.styleUrl, config.apiKey);
  }
  const paint = BASEMAP_RASTER_PAINT[theme];
  return rasterStyle(OSM_TILE_URL, OSM_ATTRIBUTION, {
    'raster-saturation': paint.saturation,
    'raster-brightness-min': paint.brightnessMin,
    'raster-brightness-max': paint.brightnessMax,
  });
}
