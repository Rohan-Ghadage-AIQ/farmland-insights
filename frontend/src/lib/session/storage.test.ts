import { describe, expect, it, vi } from 'vitest';
import { createSafeStorage, resolveSessionStorage } from './storage';

function throwingStorage(): Storage {
  const fail = (): never => {
    throw new DOMException('denied', 'SecurityError');
  };
  return {
    length: 0,
    clear: fail,
    key: fail,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  };
}

function mapStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('createSafeStorage', () => {
  it('reads and writes through to a working backend', () => {
    const backend = mapStorage();
    const storage = createSafeStorage(backend);

    storage.setItem('k', 'v');

    expect(backend.getItem('k')).toBe('v');
    expect(storage.getItem('k')).toBe('v');
  });

  it('returns null for a missing key', () => {
    expect(createSafeStorage(mapStorage()).getItem('missing')).toBeNull();
  });

  it('removes from the backend and from memory', () => {
    const backend = mapStorage();
    const storage = createSafeStorage(backend);
    storage.setItem('k', 'v');

    storage.removeItem('k');

    expect(backend.getItem('k')).toBeNull();
    expect(storage.getItem('k')).toBeNull();
  });

  it('falls back to memory when every backend call throws, without throwing itself', () => {
    const storage = createSafeStorage(throwingStorage());

    expect(() => {
      storage.setItem('k', 'v');
    }).not.toThrow();
    expect(storage.getItem('k')).toBe('v');
    expect(() => {
      storage.removeItem('k');
    }).not.toThrow();
    expect(storage.getItem('k')).toBeNull();
  });

  it('keeps the value readable when only the write fails (quota exceeded)', () => {
    const backend = mapStorage();
    vi.spyOn(backend, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const storage = createSafeStorage(backend);

    storage.setItem('k', 'v');

    expect(storage.getItem('k')).toBe('v');
  });

  it('works with no backend at all (storage unavailable)', () => {
    const storage = createSafeStorage(undefined);

    storage.setItem('k', 'v');

    expect(storage.getItem('k')).toBe('v');
  });
});

describe('resolveSessionStorage', () => {
  it('returns window.sessionStorage when accessible', () => {
    expect(resolveSessionStorage()).toBe(window.sessionStorage);
  });

  it('returns undefined when merely touching sessionStorage throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(resolveSessionStorage()).toBeUndefined();
  });
});
