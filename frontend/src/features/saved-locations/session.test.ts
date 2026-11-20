import { describe, expect, it, vi } from 'vitest';
import {
  createLocalSessionStore,
  noSessionStore,
  parseSession,
  type SavedSession,
} from './session';
import { squareFarm } from './test-support';

const SESSION: SavedSession = {
  farm: squareFarm(),
  inputs: { crop: 'Wheat', startDate: '2026-11-01', endDate: '2026-11-07', gridSize: 50 },
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    data,
  };
}

describe('parseSession', () => {
  it('reads a valid session back, field included', () => {
    expect(parseSession(JSON.parse(JSON.stringify(SESSION)))).toEqual(SESSION);
  });

  it('accepts a session with no field yet, and an empty grid size', () => {
    const parsed = parseSession({
      farm: null,
      inputs: { crop: '', startDate: '', endDate: '', gridSize: null },
    });
    expect(parsed).toEqual({
      farm: null,
      inputs: { crop: '', startDate: '', endDate: '', gridSize: null },
    });
  });

  it('keeps the settings but drops a field that no longer passes the geometry checks', () => {
    const broken = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
      ],
    };
    const parsed = parseSession({ farm: broken, inputs: SESSION.inputs });
    expect(parsed).toEqual({ farm: null, inputs: SESSION.inputs });
  });

  it('drops a field with impossible coordinates (corrupted or hand-edited storage)', () => {
    const wild = squareFarm(500, 200);
    expect(parseSession({ farm: wild, inputs: SESSION.inputs })?.farm).toBeNull();
  });

  it.each([
    null,
    undefined,
    'text',
    42,
    [],
    {},
    { farm: null },
    { farm: null, inputs: null },
    { farm: null, inputs: { crop: 1, startDate: '', endDate: '', gridSize: 50 } },
    { farm: null, inputs: { crop: '', startDate: '', endDate: '', gridSize: 'big' } },
    { farm: null, inputs: { crop: '', startDate: '', endDate: '', gridSize: Number.NaN } },
  ])('rejects %j', (raw) => {
    expect(parseSession(raw)).toBeNull();
  });
});

describe('createLocalSessionStore', () => {
  it('remembers a session and returns it next time', () => {
    const storage = memoryStorage();
    createLocalSessionStore(storage).save(SESSION);
    expect(createLocalSessionStore(storage).load()).toEqual(SESSION);
  });

  it('returns nothing when nothing was saved', () => {
    expect(createLocalSessionStore(memoryStorage()).load()).toBeNull();
  });

  it('ignores text that is not JSON, and JSON that is not a session', () => {
    expect(
      createLocalSessionStore(memoryStorage({ 'farmland-insights-session-v1': '{oops' })).load(),
    ).toBeNull();
    expect(
      createLocalSessionStore(memoryStorage({ 'farmland-insights-session-v1': '"hi"' })).load(),
    ).toBeNull();
  });

  it('survives storage that throws on read or write (blocked or full)', () => {
    const angry = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const store = createLocalSessionStore(angry);
    expect(store.load()).toBeNull();
    expect(() => {
      store.save(SESSION);
    }).not.toThrow();
  });

  it('remembers nothing when there is no storage at all', () => {
    const store = createLocalSessionStore(null);
    store.save(SESSION);
    expect(store.load()).toBeNull();
  });
});

describe('noSessionStore', () => {
  it('never remembers anything', () => {
    noSessionStore.save(SESSION);
    expect(noSessionStore.load()).toBeNull();
  });
});
