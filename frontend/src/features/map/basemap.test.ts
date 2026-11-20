import { describe, expect, it } from 'vitest';
import { BASEMAP_RASTER_PAINT } from './color-scales';
import {
  ESRI_ATTRIBUTION,
  ESRI_IMAGERY_URL,
  ESRI_LABELS_URL,
  ESRI_MAX_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  availableBasemaps,
  resolveBasemapStyle,
  type BasemapConfig,
} from './basemap';

const none: BasemapConfig = {};

function rasterOf(style: ReturnType<typeof resolveBasemapStyle>) {
  if (typeof style === 'string') throw new Error('expected an inline style');
  const source = style.sources.basemap;
  const layer = style.layers[0];
  if (source?.type !== 'raster' || layer?.type !== 'raster')
    throw new Error('expected a raster basemap');
  return { source, layer };
}

describe('availableBasemaps', () => {
  it('offers streets, satellite and hybrid with nothing configured', () => {
    expect(availableBasemaps()).toEqual(['streets', 'satellite', 'hybrid']);
  });

  it('returns the same list every call, so React can treat it as stable', () => {
    expect(availableBasemaps()).toBe(availableBasemaps());
  });
});

describe('default OSM raster basemap', () => {
  it('uses the OSM tile server with the required attribution', () => {
    const { source } = rasterOf(
      resolveBasemapStyle({ config: none, kind: 'streets', theme: 'light' }),
    );
    expect(source.tiles).toEqual([OSM_TILE_URL]);
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(source.attribution).toBe(OSM_ATTRIBUTION);
    expect(OSM_ATTRIBUTION).toContain('https://www.openstreetmap.org/copyright');
    expect(OSM_ATTRIBUTION).toContain('OpenStreetMap');
    expect(source.tileSize).toBe(256);
    expect(source.maxzoom).toBe(19);
  });

  it('is a valid style version 8 object with no glyph or sprite dependency', () => {
    const style = resolveBasemapStyle({ config: none, kind: 'streets', theme: 'light' });
    expect(typeof style).toBe('object');
    expect(typeof style !== 'string' && style.version).toBe(8);
  });

  it.each(['light', 'dark'] as const)(
    '%s: applies the raster paint that data contrast is computed for',
    (theme) => {
      const { layer } = rasterOf(resolveBasemapStyle({ config: none, kind: 'streets', theme }));
      const expected = BASEMAP_RASTER_PAINT[theme];
      expect(layer.paint).toEqual({
        'raster-saturation': expected.saturation,
        'raster-brightness-min': expected.brightnessMin,
        'raster-brightness-max': expected.brightnessMax,
      });
    },
  );

  it('is dimmer in the dark theme than in the light theme', () => {
    const light = rasterOf(
      resolveBasemapStyle({ config: none, kind: 'streets', theme: 'light' }),
    ).layer;
    const dark = rasterOf(
      resolveBasemapStyle({ config: none, kind: 'streets', theme: 'dark' }),
    ).layer;
    expect(Number(dark.paint?.['raster-brightness-max'])).toBeLessThan(
      Number(light.paint?.['raster-brightness-max']),
    );
  });
});

describe('custom style', () => {
  const styleUrl = 'https://maps.example.com/styles/farm.json';

  it('uses VITE_MAP_STYLE_URL as-is for streets', () => {
    expect(resolveBasemapStyle({ config: { styleUrl }, kind: 'streets', theme: 'light' })).toBe(
      styleUrl,
    );
  });

  it('appends the API key as ?key= when one is configured', () => {
    expect(
      resolveBasemapStyle({
        config: { styleUrl, apiKey: 'abc 123' },
        kind: 'streets',
        theme: 'light',
      }),
    ).toBe(`${styleUrl}?key=abc%20123`);
  });

  it('uses & when the URL already has a query, and never doubles an existing key', () => {
    expect(
      resolveBasemapStyle({
        config: { styleUrl: `${styleUrl}?lang=en`, apiKey: 'k' },
        kind: 'streets',
        theme: 'light',
      }),
    ).toBe(`${styleUrl}?lang=en&key=k`);
    expect(
      resolveBasemapStyle({
        config: { styleUrl: `${styleUrl}?key=already`, apiKey: 'k' },
        kind: 'streets',
        theme: 'light',
      }),
    ).toBe(`${styleUrl}?key=already`);
  });
});

describe('satellite', () => {
  it('builds a raster style from a tile template, undimmed', () => {
    const template = 'https://tiles.example.com/sat/{z}/{x}/{y}.jpg';
    const { source, layer } = rasterOf(
      resolveBasemapStyle({
        config: { satelliteUrl: template, apiKey: 'k' },
        kind: 'satellite',
        theme: 'dark',
      }),
    );
    expect(source.tiles).toEqual([`${template}?key=k`]);
    expect(source.attribution).toMatch(/imagery/i);
    expect(layer.paint).toBeUndefined();
  });

  it('passes a style URL straight to MapLibre', () => {
    const url = 'https://maps.example.com/styles/satellite.json';
    expect(
      resolveBasemapStyle({ config: { satelliteUrl: url }, kind: 'satellite', theme: 'light' }),
    ).toBe(url);
  });

  it('stops asking Esri for tiles at level 18, so deeper zooms stretch instead of going blank', () => {
    expect(ESRI_MAX_ZOOM).toBe(18);
    const { source } = rasterOf(
      resolveBasemapStyle({ config: none, kind: 'satellite', theme: 'light' }),
    );
    expect(source.maxzoom).toBe(ESRI_MAX_ZOOM);
  });

  it('keeps the labels layer on the same limit, and a configured template on its own default', () => {
    const hybrid = resolveBasemapStyle({ config: none, kind: 'hybrid', theme: 'light' });
    if (typeof hybrid === 'string') throw new Error('expected an inline style');
    expect(hybrid.sources['basemap-labels']).toMatchObject({ maxzoom: ESRI_MAX_ZOOM });
    const custom = rasterOf(
      resolveBasemapStyle({
        config: { satelliteUrl: 'https://tiles.example.com/sat/{z}/{x}/{y}.jpg' },
        kind: 'satellite',
        theme: 'light',
      }),
    );
    expect(custom.source.maxzoom).toBe(19);
  });

  it('uses the free Esri imagery when no satellite URL is configured', () => {
    const { source, layer } = rasterOf(
      resolveBasemapStyle({ config: none, kind: 'satellite', theme: 'dark' }),
    );
    expect(source.tiles).toEqual([ESRI_IMAGERY_URL]);
    expect(source.attribution).toBe(ESRI_ATTRIBUTION);
    expect(layer.paint).toBeUndefined();
  });
});

describe('hybrid', () => {
  function layersOf(style: ReturnType<typeof resolveBasemapStyle>) {
    if (typeof style === 'string') throw new Error('expected an inline style');
    return style;
  }

  it('stacks the Esri place labels above the Esri imagery', () => {
    const style = layersOf(resolveBasemapStyle({ config: none, kind: 'hybrid', theme: 'light' }));
    expect(style.layers.map((layer) => layer.id)).toEqual(['basemap', 'basemap-labels']);
    expect(style.sources.basemap).toMatchObject({ tiles: [ESRI_IMAGERY_URL] });
    expect(style.sources['basemap-labels']).toMatchObject({ tiles: [ESRI_LABELS_URL] });
  });

  it('puts the labels over a configured tile template instead of the Esri imagery', () => {
    const template = 'https://tiles.example.com/sat/{z}/{x}/{y}.jpg';
    const style = layersOf(
      resolveBasemapStyle({ config: { satelliteUrl: template }, kind: 'hybrid', theme: 'light' }),
    );
    expect(style.sources.basemap).toMatchObject({ tiles: [template] });
    expect(style.sources['basemap-labels']).toMatchObject({ tiles: [ESRI_LABELS_URL] });
  });

  it('uses a configured style URL as is, since that style owns its labels', () => {
    const url = 'https://maps.example.com/styles/hybrid.json';
    expect(
      resolveBasemapStyle({ config: { satelliteUrl: url }, kind: 'hybrid', theme: 'light' }),
    ).toBe(url);
  });
});
