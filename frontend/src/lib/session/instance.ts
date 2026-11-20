import { createSafeStorage, resolveSessionStorage } from './storage';
import { createSessionStore } from './store';

/** The app-wide session. Tests build their own stores with `createSessionStore`. */
export const session = createSessionStore({ storage: createSafeStorage(resolveSessionStorage()) });
