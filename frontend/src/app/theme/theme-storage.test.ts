import { describe, expect, it } from 'vitest';
import { createThemeStorage, THEME_STORAGE_KEY } from './theme-storage';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('createThemeStorage', () => {
  it('returns null when nothing has been stored', () => {
    expect(createThemeStorage(() => memoryStorage()).read()).toBeNull();
  });

  it('round-trips light and dark', () => {
    const storage = memoryStorage();
    const themeStorage = createThemeStorage(() => storage);

    expect(themeStorage.write('dark')).toBe(true);
    expect(themeStorage.read()).toBe('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    themeStorage.write('light');
    expect(themeStorage.read()).toBe('light');
  });

  it('ignores a stored value it does not recognise', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' });

    expect(createThemeStorage(() => storage).read()).toBeNull();
  });

  it('survives storage being unavailable (private windows, blocked site data)', () => {
    const blocked = createThemeStorage(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(blocked.read()).toBeNull();
    expect(blocked.write('dark')).toBe(false);
  });

  it('survives a full or read-only storage', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };

    expect(createThemeStorage(() => storage).write('dark')).toBe(false);
  });

  it('can forget the preference to go back to following the system', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'dark' });
    const themeStorage = createThemeStorage(() => storage);

    themeStorage.clear();

    expect(themeStorage.read()).toBeNull();
  });
});
