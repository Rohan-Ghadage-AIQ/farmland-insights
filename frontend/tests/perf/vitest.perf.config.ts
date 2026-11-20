import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Standalone Vitest config for performance benchmarks (`vitest bench`), kept separate from
 * `vitest.config.ts` (owned by the main app) so this independent review does not touch that file.
 * Run from `frontend/`: `npx vitest bench --config tests/perf/vitest.perf.config.ts --run`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.bench.ts'],
  },
});
