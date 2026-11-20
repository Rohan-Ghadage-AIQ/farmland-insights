# Architecture

Updated at Finalize (Phases 7-8). Most of this file was written at Gate A (end of the first
parallel build, before the workspace was wired together) and left unedited below except where a
section would otherwise actively mislead a new reader; those edits are marked inline. Sections say
**built** or **planned**. If a section describes something that is not built yet, it says so.

Related docs: [API_CONTRACT.md](API_CONTRACT.md) (what the backend really does),
[DECISIONS.md](DECISIONS.md), [DESIGN.md](DESIGN.md) (tokens, primitives, shell, colour scales),
[PROGRESS.md](PROGRESS.md).

## 1. Layers

```
                         src/app            shell, providers, router, error boundaries, theme
                            |
        +-------------------+--------------------+
        |                                        |
  src/features/*                           src/components/ui
  auth | field | map | analysis-setup |    design-system primitives (no domain knowledge)
  results                                        |
        |                                        |
        +--------+---------------+---------------+
                 |               |
             src/api         src/lib
   client, errors, schemas,   env, logger, session/ (token store + expiry)
   endpoints, health hooks
                 |
             src/domain   <- pure TypeScript. Imports nothing from React, MapLibre, fetch or the UI.
```

Dependencies point downwards only. `src/domain` is the bottom layer and depends on nothing but a
type-only import of the generated OpenAPI types.

| Layer                            | Path                   | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Must not                                                                                                                |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Domain (built)                   | `src/domain`           | Types and branded ids, the 82-crop mirror, the metric and cluster dictionary, CPI maths, advisory grouping, GeoJSON validation and sanitising, date presets and the +16-day rule, request building, CSV export, number formatting                                                                                                                                                                                                                                                              | Import React, MapLibre, `fetch`, the DOM or `@/api`. Enforced by ESLint (`DOMAIN_FORBIDDEN_IMPORTS`).                   |
| API (built)                      | `src/api`              | `fetch` client, `ApiError` taxonomy and plain-language messages, Zod schemas, endpoint functions, health query                                                                                                                                                                                                                                                                                                                                                                                 | Log, store tokens, or leak request or response bodies into errors.                                                      |
| Session (built)                  | `src/lib/session`      | The one sessionStorage-backed token store, expiry maths and timers, the `expired` event                                                                                                                                                                                                                                                                                                                                                                                                        | Use localStorage. Hold the token anywhere else.                                                                         |
| Design system                    | `src/components/ui`    | Primitives, icons, date utils. Contrast-checked tokens live in `src/styles`                                                                                                                                                                                                                                                                                                                                                                                                                    | Know about analysis, crops or the API.                                                                                  |
| Shell (built)                    | `src/app`              | Providers, router, `AppShell` with typed slots, theme, error boundaries, the dev-only `/dev/ui` route                                                                                                                                                                                                                                                                                                                                                                                          | Contain feature logic.                                                                                                  |
| Map feature                      | `src/features/map`     | MapLibre view, Terra Draw, grid layer and colour scales, legend, tooltip, layer switcher                                                                                                                                                                                                                                                                                                                                                                                                       | Import MapLibre or Terra Draw outside the lazy chunk (`MapView` and `DrawControl` are only exported as `*Lazy`).        |
| Other features                   | `src/features/*`       | **(Finalize update: this row is stale — `auth`, `field`, `analysis-setup` and `results` are all built, with their own UI, tested end to end through `src/app/workspace`; see each phase's section in PROGRESS.md.)**                                                                                                                                                                                                                                                                           | Import another feature's internals. Cross-feature imports go through `@/features/<name>` (ESLint `@/features/*/*` ban). |
| History feature (built, Phase 7) | `src/features/history` | Session history (spec 3.4): `store.ts` (an `IndexedDB`-backed store with an injectable in-memory fallback, used automatically when `IndexedDB` is unavailable — including in every jsdom unit test), `use-session-history.ts` (load/add/trim-to-10/clear), `HistoryPanel.tsx` (the list UI). Wired into `src/app/workspace/WorkspaceContext.tsx` (one shared `historyView` so a saved run can be shown in place of the live result) and `InspectorSlot.tsx` (the "History" button and dialog). | Send anything it stores anywhere; it is local-only, as the spec requires.                                               |

Other rules enforced by tooling: TypeScript strict, no `any`, no non-null assertions, named exports
only, no `console.*` in `src` (only `lib/logger.ts` may wrap it).

## 2. Data flow

### Built

```
 user input                       (planned UI: field + analysis-setup features)
     |
     v
 domain.buildAnalysisRequest(inputs)  -> FarmAnalysisRequest   (validation + sanitising are domain functions)
     |
     v
 useAnalyzeMutation (features/auth/api-hooks)        TanStack Query mutation; never retries, aborts on unmount,
     |                                                exposes cancel() and startedAt
     v
 endpoints.analyze  ->  apiClient.request            src/api
     |   - Bearer token read from session store per request
     |   - own timeout (180 s for /analyze, 30 s otherwise) vs. caller abort kept distinct
     |   - 401/403 -> session.handleAuthFailure()  (only if a token was sent)
     |   - non-2xx -> parseApiError -> ApiError (kind: validation | domain | auth | notFound |
     |                rateLimited | server | network | aborted | timeout | unknown)
     |   - 2xx -> Zod parse (analysisResponseSchema) -> typed value, optional fields defaulted
     v
 FarmAnalysisResponse                (type derived from the generated OpenAPI types, see 4)
     |
     +--> domain.*  (CPI cluster scores, no-data rule, advisory grouping, formatting, CSV)   pure
     |
     +--> features/map  (grid-source -> GeoJSON source, layer-model -> paint, legend-model)
```

The map is prop-driven. `features/map/domain-options.ts` is the single place that turns the domain
metric dictionary (`getMetric`, `METRIC_KEYS`, `CLUSTERS`, `metricsInCluster`) into the
`MetricOption` and `ClusterOption` props. `MetricKey` and `ClusterKey` come from the domain, so a
metric or cluster name the domain does not know does not compile.

### Planned at Gate A, built since (Finalize update)

Everything this section originally listed as "not built yet" is now built and wired:
`RouteGuard` sits around `/` and redirects to `/login?next=...`; `main.tsx` passes every real
feature component into `App`'s `slots`; `SessionExpiryToast` is mounted (`RouteGuard.tsx`) and
`session.onEvent('expired', ...)` clears the query cache; the analysis state is exactly the
`idle | running | success | error` union described here (`useAnalysisFlow`'s `AnalysisFlowState`,
with an added `request` field on `success` for session history), with `isStale` from
`domain.inputsHash`. Nothing is left in this list.

## 3. State ownership

One owner per kind of state. If you are about to add a second owner, stop and put it in the first.

| State                                                   | Owner                                                                   | Notes                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Auth token and expiry                                   | `src/lib/session` store (sessionStorage only, memory fallback)          | React reads it through `useSession` (external-store subscription). Never in React state, never localStorage.                  |
| Server data (health, whoami, analysis result)           | TanStack Query cache                                                    | Cleared on sign-out. Retries: network, timeout and 5xx once; nothing else. Analyze never retries.                             |
| Pending analyze call (cancel, elapsed time)             | `useAnalyzeMutation`                                                    | `cancel()` aborts the fetch. Aborted is an `ApiError` kind, not a failure toast.                                              |
| Map instance, camera, draw state, hover                 | `features/map` map controller (external store) and `MapActions` context | Imperative MapLibre calls live in `map-actions.ts` behind a small interface so tests use a fake.                              |
| Theme                                                   | `app/theme` `ThemeProvider`                                             | OS preference by default, manual override stored in localStorage key `fi-theme` (safe storage).                               |
| Form values (field, crop, dates, grid size)             | `analysis-setup`'s React Hook Form + Zod resolver (`useAnalysisFlow`)   | Built.                                                                                                                        |
| Per-viewer conveniences (recent crops, collapsed panel) | localStorage via safe wrapper (`crop-recents.ts`, theme/shell storage)  | Never for anything that must persist reliably.                                                                                |
| Session history (the last 10 runs)                      | `features/history` (`IndexedDB`-backed, in-memory fallback)             | Built, Phase 7. `WorkspaceContext` records each new success and can show a saved run (`historyView`) instead of the live one. |

## 4. Single source of truth for API shapes

`openapi.json` (saved from the backend's `app.openapi()`) generates `src/api/generated/openapi.d.ts`
with `pnpm gen:api`. Everything else derives from it:

- `src/domain/types.ts` re-exports the generated types under domain names (`FarmAnalysisResponse`,
  `ClusterKey`, ...) and adds branded types (`GridId`, `CropCategoryKey`, `IsoDate`).
- `src/api/schemas.ts` holds the runtime Zod schemas. `schemas.types.test.ts` is a compile-time test
  in both directions (schema output assignable to the generated type, generated type accepted by the
  schema input). It runs under `pnpm typecheck`, not under Vitest.
- `src/features/map/types.ts` aliases the domain types.
- `src/domain/crops.drift.test.ts` reads `app/models/requests.py` and fails if the TypeScript crop
  mirror and the backend enum differ. It resolves the repo root three levels above `src/domain`.

If the backend changes, run `pnpm gen:api`, fix the schemas until `pnpm typecheck` and the drift test
pass, then update the domain.

## 5. Bundles

**(Finalize update, replaces the Gate A numbers below.)** Once the map and every feature were
wired in, `vite build` produces the initial JS as one chunk around 232 kB gzip (plus ~6.4 kB CSS
gzip), under the spec's 250 kB gzip budget, with the map genuinely code-split into its own chunks
(`MapView-*.js` ~291 kB gzip, `DrawControl-*.js` ~36 kB gzip, loaded only once the workspace
mounts). See `docs/PROGRESS.md`'s Finalize numbers for the exact figures from the last full gate
run. `/dev/ui` is lazy and stays out of production builds. A bundle-size budget now runs in CI
(see `.github-workflows-example.yml`), not just as a number recorded by hand here.

Original Gate A note, kept for history: "one JS chunk of 562 kB (175 kB gzip) plus 27 kB CSS...
MapLibre and Terra Draw are not in the bundle at all because nothing statically imports
`MapViewLazy` yet" — this was true only before the workspace composition step wired the map in.

## 6. Testing

- Vitest + jsdom + Testing Library for components, hooks and logic. MSW (`src/test/msw`) for the API.
  No test calls a real backend, PropelAuth or Earth Engine.
- Domain tests are pure and fast. Coverage threshold: 90% on `src/domain/**`; global 70% (the whole
  suite runs well above both bars; see PROGRESS.md for the exact numbers).
- MapLibre and Terra Draw are replaced by hand-written fakes (`maplibre-fake.ts`, `draw-fake.ts`) in
  jsdom. Real rendering (WebGL, hover performance, PNG export, Terra Draw vertex editing) is
  exercised only by Playwright, in a real Chromium browser, not by any Vitest test.
- `IndexedDB` (the session history store, `src/features/history/store.ts`) does not exist in
  jsdom either: every Vitest test for it exercises the in-memory fallback. The real IndexedDB path
  is covered by `tests/e2e/history.spec.ts`, which reloads the page between saving and reopening a
  run to prove the entry survived in real browser storage, not just React state.
- Playwright (`tests/e2e`): the axe accessibility spec (`a11y-ui.spec.ts`), the smoke spec, the E2E
  happy path (`happy-path.spec.ts`, success path only — 400/422/500/network/cancel are covered at
  the component level, not in Playwright) and session history (`history.spec.ts`). All run against
  `pnpm dev` locally; `.github-workflows-example.yml` (Phase 8) is a ready-to-copy CI workflow that
  runs them, since this repo has no `.github/` of its own to edit directly (see that file's own
  comment for why).
- Colour contrast of the design tokens, and of the data colour scales against colour-blindness
  simulation, is checked numerically in unit tests (see `docs/DESIGN.md`). Real axe contrast checks
  run only in the Playwright spec.
- Not done: a Lighthouse performance report for `/login` (needs a `lighthouse`/`@lhci/cli`
  devDependency outside this phase's permitted scope to add; see PROGRESS.md), and a profiled
  10,000-cell hover-performance check in a real browser.
