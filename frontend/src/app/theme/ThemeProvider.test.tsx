import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockMatchMedia, type MediaQueryController } from '@/components/ui/test-support';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';
import { createThemeStorage, THEME_STORAGE_KEY, type ThemeStorage } from './theme-storage';

let media: MediaQueryController | undefined;

afterEach(() => {
  media?.restore();
  media = undefined;
  document.documentElement.removeAttribute('data-theme');
});

function memoryThemeStorage(initial?: string): { storage: ThemeStorage; raw: Map<string, string> } {
  const raw = new Map<string, string>(initial ? [[THEME_STORAGE_KEY, initial]] : []);
  const fake = {
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => raw.set(key, value),
    removeItem: (key: string) => raw.delete(key),
  } as unknown as Storage;
  return { storage: createThemeStorage(() => fake), raw };
}

function Probe() {
  const { theme, preference } = useTheme();
  return (
    <p>
      resolved:{theme} preference:{preference ?? 'system'}
    </p>
  );
}

function setup(options: { systemDark?: boolean; stored?: string } = {}) {
  media = mockMatchMedia(options.systemDark ?? false);
  const { storage, raw } = memoryThemeStorage(options.stored);
  render(
    <ThemeProvider storage={storage}>
      <Probe />
      <ThemeToggle />
    </ThemeProvider>,
  );
  return { raw, user: userEvent.setup() };
}

describe('ThemeProvider', () => {
  it('follows a light system with no data-theme override (CSS handles the rest)', () => {
    setup({ systemDark: false });

    expect(screen.getByText(/resolved:light preference:system/)).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('follows a dark system without forcing an attribute', () => {
    setup({ systemDark: true });

    expect(screen.getByText(/resolved:dark preference:system/)).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('applies a stored preference over the system setting', () => {
    setup({ systemDark: false, stored: 'dark' });

    expect(screen.getByText(/resolved:dark preference:dark/)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('toggles, applies and persists the choice', async () => {
    const { user, raw } = setup({ systemDark: false });

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(raw.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByText(/resolved:dark preference:dark/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(raw.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('toggles away from a dark system to light', async () => {
    const { user } = setup({ systemDark: true });

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('keeps working when storage is unavailable', async () => {
    media = mockMatchMedia(false);
    const blocked = createThemeStorage(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const user = userEvent.setup();
    render(
      <ThemeProvider storage={blocked}>
        <Probe />
        <ThemeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('tracks the system setting while no manual choice is stored', () => {
    setup({ systemDark: false });

    act(() => {
      media?.setMatches(true);
    });

    expect(screen.getByText(/resolved:dark preference:system/)).toBeInTheDocument();
  });

  it('ignores system changes once the user has chosen', () => {
    setup({ systemDark: false, stored: 'light' });

    act(() => {
      media?.setMatches(true);
    });

    expect(screen.getByText(/resolved:light preference:light/)).toBeInTheDocument();
  });

  it('works without matchMedia at all (treats the system as light)', () => {
    const { storage } = memoryThemeStorage();
    render(
      <ThemeProvider storage={storage}>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByText(/resolved:light preference:system/)).toBeInTheDocument();
  });

  it('refuses useTheme outside its provider', () => {
    function Bad() {
      useTheme();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/ThemeProvider/);
  });
});
