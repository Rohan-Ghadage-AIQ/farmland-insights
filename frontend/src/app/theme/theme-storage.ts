export type ThemePreference = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fi-theme';

export interface ThemeStorage {
  /** The saved choice, or null when there is none (follow the system) or storage is unusable. */
  read(): ThemePreference | null;
  /** Returns false when the choice could not be saved; the theme still applies for this visit. */
  write(preference: ThemePreference): boolean;
  clear(): void;
}

function isPreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

/**
 * Safe wrapper over Web Storage. Just touching `window.localStorage` can throw (private windows,
 * blocked site data), so every access sits behind try/catch and the app works without it.
 * The theme is a per-viewer convenience, which is the one thing localStorage is used for here.
 */
export function createThemeStorage(
  getStorage: () => Storage = () => window.localStorage,
): ThemeStorage {
  return {
    read() {
      try {
        const value = getStorage().getItem(THEME_STORAGE_KEY);
        return isPreference(value) ? value : null;
      } catch {
        return null;
      }
    },
    write(preference) {
      try {
        getStorage().setItem(THEME_STORAGE_KEY, preference);
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        getStorage().removeItem(THEME_STORAGE_KEY);
      } catch {
        // Nothing to forget if storage cannot be reached.
      }
    },
  };
}
