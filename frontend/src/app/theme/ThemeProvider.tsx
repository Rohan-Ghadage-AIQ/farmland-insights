import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createThemeStorage, type ThemePreference, type ThemeStorage } from './theme-storage';

export interface ThemeContextValue {
  /** What the user actually sees. Map and chart code reads this (for example to pick a basemap). */
  readonly theme: ThemePreference;
  /** The manual choice, or null while following the system. */
  readonly preference: ThemePreference | null;
  readonly setPreference: (preference: ThemePreference | null) => void;
  /** Flips between light and dark and remembers the choice. */
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystem(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const list = window.matchMedia(DARK_QUERY);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

const defaultStorage = createThemeStorage();

interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Injected by tests; production uses localStorage behind a safe wrapper. */
  readonly storage?: ThemeStorage;
}

export function ThemeProvider({ children, storage = defaultStorage }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference | null>(() => storage.read());
  const systemDark = useSyncExternalStore(subscribeToSystem, systemPrefersDark, () => false);
  const theme: ThemePreference = preference ?? (systemDark ? 'dark' : 'light');

  // With no manual choice the attribute is absent and tokens.css follows prefers-color-scheme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (preference === null) {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }, [preference]);

  const setPreference = useCallback(
    (next: ThemePreference | null) => {
      setPreferenceState(next);
      if (next === null) storage.clear();
      else storage.write(next);
    },
    [storage],
  );

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [setPreference, theme]);

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggle }),
    [theme, preference, setPreference, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }
  return value;
}
