import { describe, expect, it } from 'vitest';
import {
  CELL_CONFIRM_THRESHOLD,
  CELL_WARN_THRESHOLD,
  areaAcres,
  areaHectares,
  cellWarningLevel,
  estimateCellCount,
  farmBbox,
  sanitizeFeatureCollection,
  validateFarmGeometry,
  vertexCount,
  type GeoIssueCode,
} from './geo';
import type { FarmFeatureCollection } from './types';

type Ring = number[][];

/** A closed square ring with its lower-left corner at (x, y). */
function square(x: number, y: number, size = 0.01): Ring {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

function polygonFeature(
  rings: Ring[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: rings },
    ...extra,
  };
}

function collection(
  features: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: 'FeatureCollection', features, ...extra };
}

function codes(input: unknown): GeoIssueCode[] {
  const result = validateFarmGeometry(input);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('sanitizeFeatureCollection', () => {
  it('keeps only type and features[].{type,id,geometry,properties}', () => {
    const dirty = {
      type: 'FeatureCollection',
      name: 'my farm',
      bbox: [0, 0, 1, 1],
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
      foreign: 1,
      features: [
        {
          type: 'Feature',
          id: 'f1',
          bbox: [0, 0, 1, 1],
          title: 'x',
          properties: { crop: 'wheat' },
          geometry: { type: 'Polygon', bbox: [0, 0, 1, 1], crs: 'x', coordinates: [square(0, 0)] },
        },
      ],
    };
    expect(sanitizeFeatureCollection(dirty)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'f1',
          properties: { crop: 'wheat' },
          geometry: { type: 'Polygon', coordinates: [square(0, 0)] },
        },
      ],
    });
  });

  it('does not mutate its input', () => {
    const input = collection([polygonFeature([square(0, 0)], { bbox: [1] })], { name: 'n' });
    const snapshot = structuredClone(input);
    sanitizeFeatureCollection(input);
    expect(input).toEqual(snapshot);
  });

  it('defaults missing or non-object properties to {} and omits an undefined id', () => {
    const out = sanitizeFeatureCollection(
      collection([
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [square(0, 0)] } },
        {
          type: 'Feature',
          properties: 'nope',
          geometry: { type: 'Polygon', coordinates: [square(0, 0)] },
        },
        {
          type: 'Feature',
          properties: null,
          id: null,
          geometry: { type: 'Polygon', coordinates: [square(0, 0)] },
        },
      ]),
    ) as { features: Record<string, unknown>[] };
    expect(out.features[0]).toEqual({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [square(0, 0)] },
    });
    expect(Object.hasOwn(out.features[0] ?? {}, 'id')).toBe(false);
    expect(out.features[1]?.properties).toEqual({});
    expect(out.features[2]).toMatchObject({ id: null, properties: {} });
  });

  it('keeps altitude by default and drops it on request, for Polygon and MultiPolygon', () => {
    const withAlt = collection([
      polygonFeature([
        [
          [0, 0, 10],
          [1, 0, 11],
          [1, 1, 12],
          [0, 0, 10],
        ],
      ]),
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [0, 0, 5],
                [1, 0, 5],
                [1, 1, 5],
                [0, 0, 5],
              ],
            ],
          ],
        },
      },
    ]);
    const kept = sanitizeFeatureCollection(withAlt) as {
      features: { geometry: { coordinates: unknown } }[];
    };
    expect(kept.features[0]?.geometry.coordinates).toEqual([
      [
        [0, 0, 10],
        [1, 0, 11],
        [1, 1, 12],
        [0, 0, 10],
      ],
    ]);
    const dropped = sanitizeFeatureCollection(withAlt, { dropAltitude: true }) as {
      features: { geometry: { coordinates: unknown } }[];
    };
    expect(dropped.features[0]?.geometry.coordinates).toEqual([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ]);
    expect(dropped.features[1]?.geometry.coordinates).toEqual([
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    ]);
  });

  it('returns anything that is not a FeatureCollection unchanged, so validation can explain it', () => {
    const feature = { type: 'Feature', geometry: null, properties: {} };
    expect(sanitizeFeatureCollection(feature)).toBe(feature);
    expect(sanitizeFeatureCollection('text')).toBe('text');
    expect(sanitizeFeatureCollection(null)).toBeNull();
    const noFeatures = { type: 'FeatureCollection' };
    expect(sanitizeFeatureCollection(noFeatures)).toBe(noFeatures);
  });

  it('does not invent a type for a feature that has none', () => {
    const out = sanitizeFeatureCollection(
      collection([{ geometry: { type: 'Polygon', coordinates: [square(0, 0)] } }]),
    ) as { features: Record<string, unknown>[] };
    expect(Object.hasOwn(out.features[0] ?? {}, 'type')).toBe(false);
  });

  it('passes malformed features through for validation to report', () => {
    const out = sanitizeFeatureCollection(
      collection([
        'junk',
        { type: 'Feature', geometry: null },
        { type: 'Feature', geometry: 'x' },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: 'x' } },
        { type: 'Feature', geometry: { type: 'Point' } },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [['x'], [[1, 'a']], 'z'] } },
      ]),
    ) as { features: unknown[] };
    expect(out.features[0]).toBe('junk');
    expect(out.features[1]).toMatchObject({ geometry: null });
    expect(out.features[2]).toMatchObject({ geometry: 'x' });
    expect(out.features[3]).toMatchObject({ geometry: { type: 'Polygon', coordinates: 'x' } });
    expect(out.features[4]).toMatchObject({ geometry: { type: 'Point' } });
    expect(out.features[5]).toMatchObject({
      geometry: { type: 'Polygon', coordinates: [['x'], [[1, 'a']], 'z'] },
    });
  });
});

describe('validateFarmGeometry', () => {
  it('accepts a simple polygon and returns the sanitized collection', () => {
    const result = validateFarmGeometry(
      collection([polygonFeature([square(77, 28)])], { name: 'x', bbox: [0] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.collection).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [square(77, 28)] },
        },
      ],
    });
  });

  it('accepts a MultiPolygon, a polygon with a hole and 3D positions', () => {
    const multi = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [[square(0, 0)], [square(1, 1)]] },
    };
    expect(codes(collection([multi]))).toEqual([]);
    expect(
      codes(collection([polygonFeature([square(0, 0, 1), square(0.25, 0.25, 0.25)])])),
    ).toEqual([]);
    const threeD: Ring = square(0, 0).map(([x = 0, y = 0]) => [x, y, 100]);
    expect(codes(collection([polygonFeature([threeD])]))).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'FeatureCollection'],
    ['an array', []],
    ['a bare Feature', polygonFeature([square(0, 0)])],
    ['a bare geometry', { type: 'Polygon', coordinates: [square(0, 0)] }],
    ['a collection without features', { type: 'FeatureCollection' }],
    ['a collection whose features is not a list', { type: 'FeatureCollection', features: {} }],
  ])('rejects %s as not a FeatureCollection', (_name, input) => {
    expect(codes(input)).toEqual(['not_feature_collection']);
  });

  it('rejects an empty feature list', () => {
    expect(codes(collection([]))).toEqual(['empty_features']);
  });

  it.each(['Point', 'LineString', 'MultiPoint', 'GeometryCollection'])(
    'rejects %s geometry',
    (type) => {
      const result = validateFarmGeometry(
        collection([{ type: 'Feature', properties: {}, geometry: { type, coordinates: [0, 0] } }]),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues[0]).toMatchObject({
        code: 'unsupported_geometry_type',
        featureIndex: 0,
      });
      expect(result.issues[0]?.message).toContain(type);
    },
  );

  it('rejects a MultiPolygon part that is not a list', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: ['nope'] },
    };
    expect(codes(collection([feature]))).toEqual(['invalid_coordinates']);
  });

  it('names an unknown geometry type generically', () => {
    const result = validateFarmGeometry(
      collection([{ type: 'Feature', properties: {}, geometry: { type: 7, coordinates: [] } }]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ code: 'unsupported_geometry_type' });
    expect(result.issues[0]?.message).toContain('unknown shape');
  });

  it('rejects features that are not Feature objects', () => {
    expect(codes(collection(['junk']))).toEqual(['invalid_feature']);
    expect(codes(collection([{ type: 'Polygon', coordinates: [square(0, 0)] }]))).toEqual([
      'invalid_feature',
    ]);
  });

  it.each([
    ['missing geometry', { type: 'Feature', properties: {} }],
    ['null geometry', { type: 'Feature', properties: {}, geometry: null }],
    ['no rings', polygonFeature([])],
    ['an empty ring', polygonFeature([[]])],
    [
      'an empty multipolygon',
      { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [] } },
    ],
    [
      'a multipolygon part without rings',
      { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[]] } },
    ],
  ])('rejects %s as an empty geometry', (_name, feature) => {
    expect(codes(collection([feature]))).toEqual(['empty_geometry']);
  });

  it('rejects a ring with fewer than 4 positions', () => {
    const triangleNotClosed: Ring = [
      [0, 0],
      [1, 0],
      [0, 0],
    ];
    expect(codes(collection([polygonFeature([triangleNotClosed])]))).toEqual(['ring_too_short']);
  });

  it('rejects a ring whose last position differs from its first', () => {
    const open = square(0, 0)
      .slice(0, 4)
      .concat([[0.5, 0.5]]);
    expect(codes(collection([polygonFeature([open])]))).toEqual(['ring_not_closed']);
  });

  it('rejects a self-intersecting (bow-tie) ring', () => {
    const bowTie: Ring = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    const result = validateFarmGeometry(collection([polygonFeature([bowTie])]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.code)).toEqual(['self_intersection']);
    expect(result.issues[0]?.message).toMatch(/cross/i);
  });

  it('finds self-intersection inside a MultiPolygon part', () => {
    const bowTie: Ring = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    const multi = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [[square(5, 5)], [bowTie]] },
    };
    expect(codes(collection([multi]))).toEqual(['self_intersection']);
  });

  it.each([
    ['longitude above 180', square(179.995, 10)],
    ['longitude below -180', square(-181, 10)],
    ['latitude above 90', square(10, 89.995)],
    ['latitude below -90', square(10, -91)],
  ])('rejects %s', (_name, ring) => {
    expect(codes(collection([polygonFeature([ring])]))).toContain('out_of_bounds');
  });

  it('accepts coordinates exactly on the WGS84 bounds', () => {
    const edge: Ring = [
      [-180, -90],
      [180, -90],
      [180, 90],
      [-180, 90],
      [-180, -90],
    ];
    expect(codes(collection([polygonFeature([edge])]))).not.toContain('out_of_bounds');
  });

  it('does not run the self-intersection check on out-of-bounds rings', () => {
    expect(codes(collection([polygonFeature([square(200, 10)])]))).toEqual(['out_of_bounds']);
  });

  it.each([
    ['text coordinates', [[['a', 'b']]]],
    ['a missing latitude', [[[1], [2], [3], [1]]]],
    [
      'a NaN value',
      [
        [
          [Number.NaN, 0],
          [1, 0],
          [1, 1],
          [Number.NaN, 0],
        ],
      ],
    ],
    ['a ring that is not a list', ['nope']],
    ['coordinates that are not a list', 'nope'],
  ])('rejects %s as invalid coordinates', (_name, coordinates) => {
    const feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } };
    expect(codes(collection([feature]))).toEqual(['invalid_coordinates']);
  });

  it('reports problems per feature and keeps going', () => {
    const result = validateFarmGeometry(
      collection([
        polygonFeature([square(0, 0)]),
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
        polygonFeature([
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ]),
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => [i.featureIndex, i.code])).toEqual([
      [1, 'unsupported_geometry_type'],
      [2, 'ring_too_short'],
    ]);
  });

  it('writes plain-language messages without implementation jargon', () => {
    const result = validateFarmGeometry('x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.message).toMatch(/GeoJSON/);
    expect(result.issues[0]?.message.length).toBeGreaterThan(10);
  });
});

describe('farm statistics', () => {
  // 0.01 x 0.01 degrees at the equator is about 123.9 hectares.
  const equatorSquare = collection([
    polygonFeature([square(0, 0)]),
  ]) as unknown as FarmFeatureCollection;

  it('computes area in hectares and acres', () => {
    const ha = areaHectares(equatorSquare);
    expect(ha).toBeGreaterThan(122);
    expect(ha).toBeLessThan(126);
    expect(areaAcres(equatorSquare)).toBeCloseTo(ha * 2.47105381, 5);
  });

  it('sums the area of all features and subtracts holes', () => {
    const two = collection([
      polygonFeature([square(0, 0)]),
      polygonFeature([square(1, 1)]),
    ]) as unknown as FarmFeatureCollection;
    expect(areaHectares(two)).toBeGreaterThan(areaHectares(equatorSquare) * 1.99);
    const holed = collection([
      polygonFeature([square(0, 0), square(0.0025, 0.0025, 0.005)]),
    ]) as unknown as FarmFeatureCollection;
    expect(areaHectares(holed)).toBeCloseTo(areaHectares(equatorSquare) * 0.75, 0);
  });

  it('counts distinct vertices, not the repeated closing position', () => {
    expect(vertexCount(equatorSquare)).toBe(4);
    const holed = collection([
      polygonFeature([square(0, 0, 1), square(0.25, 0.25, 0.25)]),
    ]) as unknown as FarmFeatureCollection;
    expect(vertexCount(holed)).toBe(8);
    const multi = collection([
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiPolygon', coordinates: [[square(0, 0)], [square(2, 2)]] },
      },
    ]) as unknown as FarmFeatureCollection;
    expect(vertexCount(multi)).toBe(8);
  });

  it('returns the bounding box as [minLng, minLat, maxLng, maxLat]', () => {
    const farm = collection([
      polygonFeature([square(77, 28)]),
      polygonFeature([square(78, 27)]),
    ]) as unknown as FarmFeatureCollection;
    expect(farmBbox(farm)).toEqual([77, 27, 78.01, 28.01]);
  });
});

describe('estimateCellCount', () => {
  it('divides the area by the cell area and rounds up', () => {
    expect(estimateCellCount(100, 50)).toBe(400);
    expect(estimateCellCount(1.5, 100)).toBe(2);
    expect(estimateCellCount(1, 100)).toBe(1);
  });

  it('counts a field smaller than one cell as one cell', () => {
    expect(estimateCellCount(0.01, 100)).toBe(1);
  });

  it('returns 0 for no area or an unusable grid size', () => {
    expect(estimateCellCount(0, 50)).toBe(0);
    expect(estimateCellCount(-1, 50)).toBe(0);
    expect(estimateCellCount(10, 0)).toBe(0);
    expect(estimateCellCount(10, -5)).toBe(0);
    expect(estimateCellCount(10, Number.NaN)).toBe(0);
    expect(estimateCellCount(Number.NaN, 50)).toBe(0);
  });
});

describe('cellWarningLevel', () => {
  it('warns above 2,000 cells and asks for confirmation above 10,000', () => {
    expect(CELL_WARN_THRESHOLD).toBe(2000);
    expect(CELL_CONFIRM_THRESHOLD).toBe(10000);
    expect(cellWarningLevel(0)).toBe('ok');
    expect(cellWarningLevel(2000)).toBe('ok');
    expect(cellWarningLevel(2001)).toBe('warn');
    expect(cellWarningLevel(10000)).toBe('warn');
    expect(cellWarningLevel(10001)).toBe('confirm');
  });
});
