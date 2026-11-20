import { createContext, useContext } from 'react';

export interface ShellApi {
  /** At least 1280px wide: inspector sits beside the map. Below that it is an overlay drawer. */
  readonly isWide: boolean;
  readonly inspectorOpen: boolean;
  /** Feature code calls this when something is selected (for example a map cell). */
  readonly openInspector: () => void;
  readonly closeInspector: () => void;
  readonly toggleInspector: () => void;
}

export const ShellContext = createContext<ShellApi | null>(null);

/** Lets content placed in the shell's slots control the inspector. */
export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (api === null) {
    throw new Error('useShell must be used inside an <AppShell>.');
  }
  return api;
}
