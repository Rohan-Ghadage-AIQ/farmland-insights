# Contributing

Phase 8. House rules, scripts, commit style and the two most common "how do I add X" questions
(a metric, a crop).

## Ground rules (from the spec, non-negotiable)

- TypeScript `strict`, no `any`, no non-null (`!`) assertions, no `as` casts except at a proven
  boundary, each with a comment explaining why.
- Named exports only (enforced by ESLint — a default export is a lint error).
- `src/domain` stays pure: no React, MapLibre, `fetch`, the DOM or `@/api` runtime imports (a
  documented exception lets it import **types only** from the generated OpenAPI types, since the
  domain's branded types are built on them — see `eslint.config.js`'s `DOMAIN_FORBIDDEN_IMPORTS`
  and `src/domain/types.ts`'s own comment).
- Feature folders (`src/features/*`) talk to each other only through their `index.ts`, never a
  deep import into another feature's internals.
- No `console.*` in `src/` — use `src/lib/logger.ts` (a no-op in production).
- Strict TDD: write the failing test first, run it to see it fail for the right reason, implement
  the minimum to pass, refactor with tests green. Test behaviour, not implementation details.

## Scripts

| Script                           | What it does                                                             |
| -------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev` / `build` / `preview` | Vite dev server, production build, preview of `dist/`                    |
| `pnpm typecheck`                 | `tsc --noEmit`                                                           |
| `pnpm lint` / `lint:fix`         | ESLint, `--max-warnings=0`                                               |
| `pnpm format` / `format:check`   | Prettier                                                                 |
| `pnpm test` / `test:watch`       | Vitest (jsdom, Testing Library, MSW)                                     |
| `pnpm test:coverage`             | Vitest with v8 coverage; thresholds 70% global, 90% for `src/domain`     |
| `pnpm e2e`                       | Playwright (starts its own dev server; Chromium)                         |
| `pnpm gen:api`                   | Regenerates `src/api/generated/openapi.d.ts` from `openapi.json`         |
| `pnpm check`                     | typecheck + lint + test + build — the quality gate every phase must pass |
| `pnpm hooks:install`             | Opt in to the pre-commit hook (see the README)                           |

Run `pnpm check` before opening a PR. CI (`.github-workflows-example.yml`, see its own comment for
why it isn't a live `.github/workflows/` file yet) runs the same checks plus `e2e` and a bundle
size budget.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, one commit
per logical change.

```
feat(map): add the basemap toggle to the map's corner
fix(results): keep table row navigation from leaking to the map's shortcut
docs(progress): record the Finalize gate numbers
test(history): cover the 10-entry eviction path
refactor(workspace): share one response between the map and inspector slots
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`. Common scopes: a feature
folder name (`map`, `results`, `analysis-setup`, `auth`, `field`, `history`), `domain`, `api`,
`workspace`, `progress`/`docs` for documentation-only changes.

Never commit `.env` files, tokens, or service-account JSON — `.gitignore`/`.dockerignore` already
exclude them, but double-check `git status` before a commit that touches configuration.

## How to add a metric

Metrics are a single dictionary in `src/domain/metrics.ts` (`SPECS`), encoding what the backend's
`analytics_service.py` actually computes (API_CONTRACT.md §5), not what any doc claims — if the
backend changes, change this file and `API_CONTRACT.md` together, in the same change.

1. Add an entry to `SPECS` in `src/domain/metrics.ts`: `key` (the backend's field name),
   `label`/`shortLabel`, `unit`, `decimals` (2 for indices, 1 for physical units — see the
   existing exceptions noted at the top of the file), and `cluster` (which of the five
   `ClusterKey`s it belongs to).
2. Add a test in `src/domain/metrics.test.ts` that the new key resolves through `getMetric`,
   appears in `METRIC_KEYS` and `metricsInCluster` for its cluster, and formats with the decimals
   you chose (`formatMetricValue`).
3. If the metric needs a non-default colour scale (a diverging scale, say, because it has a
   meaningful zero midpoint like `spi`/`spei`), see `src/features/map/color-scales.ts` and
   `docs/DESIGN.md`'s "Data color scales" section — document the choice there, including a
   colour-blindness check (`color-scales.test.ts` has the pattern to extend).
4. If cell detail, the farm summary or the CSV export (`src/domain/export.ts`) need to special-
   case the metric, they read `METRIC_KEYS`/`getMetric` already, so a correctly added metric
   usually needs no changes there — add a test confirming it shows up rather than assuming so.

## How to add a crop

`src/domain/crops.ts`'s `SUPPORTED_CROPS` is a **mirror** of the backend's own crop list
(`app/models/requests.py`), kept honest by `crops.drift.test.ts`, which parses that Python file at
test time and fails the moment the two lists disagree — so the backend's list is the one source of
truth; this file never invents a crop the API doesn't accept.

1. Confirm the crop is actually in the backend's `SUPPORTED_CROPS` (`app/models/requests.py`)
   first — if it isn't, that's a backend change (file it like any other `BACKEND_REQUESTS.md`
   item), not a frontend one.
2. Add `{ english, desi, category }` to `SUPPORTED_CROPS` in `src/domain/crops.ts`, matching the
   backend's English name, its desi (Hindi, transliterated) name and its `CropCategory`.
3. Run `pnpm test src/domain/crops.drift.test.ts` — it passes once the two lists match exactly
   (same crops, same order is not required, but same membership and categories are).
4. `searchCrops`/`findCrop` (English and desi name search) and `groupCropsByCategory` all read
   `SUPPORTED_CROPS` directly, so a correctly added crop appears in the UI's crop combobox with no
   further change — add a case to `crops.test.ts` confirming the new crop is findable by both
   names rather than assuming so.

## Project layout

See `docs/ARCHITECTURE.md` for the full picture (layers, data flow, state ownership) and the
README's "Architecture overview" section for the short version.
