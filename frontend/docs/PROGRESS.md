# Progress

Plan and spec: [`../../docs/FRONTEND_BUILD_PROMPT.md`](../../docs/FRONTEND_BUILD_PROMPT.md)
Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

Last updated at **Finalize** (Phases 7-8: session history, the spec §3.6 checklist, the production
Dockerfile and `docker-compose.frontend.yml`, `docs/DEPLOYMENT.md`, `docs/CONTRIBUTING.md`, a final
README, a CI workflow example, and a full final-gate run from a clean install). A QA/fix round ran
between Integrate and this step (see "Fix round" near the end of this file) and is folded in here.
Earlier history (Gate A: domain, API/session, design-system/shell and map; the feature tracks:
auth+field UI, analysis-setup, results; Integrate: workspace composition) is kept below unedited
except for status lines, so this file still reads as a record of what happened in what order.

| Phase | Name                          | Status                                                                                                                                                                                         |
| ----- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Discovery and contract        | ✅ done                                                                                                                                                                                        |
| 1     | Scaffold and tooling          | ✅ done                                                                                                                                                                                        |
| 2     | Design system and app shell   | ✅ done — the §3.6 checklist (Phase 7's exit criterion) is in `docs/DESIGN.md`; axe is run in Playwright but not yet in a live CI (a workflow for it now exists, see Phase 8)                  |
| 3     | API client and authentication | ✅ done: UI wired into `/` and `/login`; **live-backend check still pending (Q1, unverified)**                                                                                                 |
| 4     | Field input and map           | ✅ done: draw/upload/paste share one state with the map; checked in a real browser                                                                                                             |
| 5     | Analysis setup and run        | ✅ done: form, run, cancel and errors wired; E2E covers the success path, 400/422/500/network/cancel are covered at the component level only                                                   |
| 6     | Results visualization         | ✅ done: inspector, table view, keyboard nav wired; **10k-cell hover-performance check still not done**                                                                                        |
| 7     | Export, history and polish    | ✅ done: export, shortcut sheet, session history (IndexedDB, last 10 runs, reopen, clear), session-expiry toast, reduced motion, empty states, and the full §3.6 checklist in `docs/DESIGN.md` |
| 8     | Hardening and documentation   | ✅ done, with honest carve-outs below (Docker build/compose reviewed but not actually run — no daemon in this sandbox; Lighthouse and the live E2E not run)                                    |

Gate A numbers (run by the integrator, all in `frontend/`):

| Command              | Result                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install`       | Already up to date                                                                             |
| `pnpm typecheck`     | exit 0                                                                                         |
| `pnpm lint`          | exit 0 (`--max-warnings=0`)                                                                    |
| `pnpm format:check`  | exit 0                                                                                         |
| `pnpm test`          | 70 files, 1012 tests, 1012 passed, 0 failed                                                    |
| `pnpm test:coverage` | all files: 96.53% statements, 93.24% branches, 93.77% functions, 97.32% lines. Thresholds met. |
| `pnpm build`         | exit 0. One chunk: 562.41 kB JS (175.35 kB gzip), 26.90 kB CSS                                 |
| `pnpm e2e`           | 17 passed (15 axe, 2 smoke), Chromium, against `pnpm dev`                                      |

**Integrate numbers** (run by the integrator after wiring the real workspace; see "Integrate —
workspace composition" near the end of this file for the full write-up):

| Command                          | Result                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`               | exit 0, whole project                                                                                                                                                                                                                                                                                   |
| `npx eslint . --max-warnings=0`  | exit 0, whole project (the 14 pre-existing `analysis-setup` lint errors one feature track's self-report mentioned were already gone by the time this ran)                                                                                                                                               |
| `npx prettier --check .`         | 3 files needed formatting (new `src/app/workspace/*`); fixed with `--write`, then clean                                                                                                                                                                                                                 |
| `npx vitest run --coverage`      | 111 files, **1271 tests passed, 0 failed**. 93.95% statements, 90.17% branches, 92.5% functions, 95.16% lines (global thresholds met; `src/domain` stays far above its 90% bar)                                                                                                                         |
| `npx vite build`                 | exit 0. Initial chunk 734.96 kB JS (**230.39 kB gzip**) + 28.21 kB CSS (6.37 kB gzip) — under the spec's 250 kB gzip budget. The map now really does split out: `MapView-*.js` 291.19 kB gzip + `DrawControl-*.js` 35.95 kB gzip + `MapView-*.css` 10.25 kB gzip, loaded only once the workspace mounts |
| `npx playwright test` (Chromium) | **18 passed, 1 skipped** (the `E2E_LIVE=1`-gated live-backend happy path, skipped by design). Includes the new `happy-path.spec.ts`                                                                                                                                                                     |

**Fix round** (between Integrate and Finalize, QA findings remediation — not owned by this file,
but recorded here honestly since Finalize's own numbers build on it): fixed a flaky
`use-analysis-flow` test, added 28 tests for the previously-0%-covered `src/app/workspace`
composition layer (0% → 87.87% statements), fixed an arrow-key event leaking from `DateCalendar`
and the `Slider` into `ResultsPanel`'s window-level cell navigation, put the stale badge in a live
region, and added a roving-tabindex keyboard pattern to `TableView`. Left at 1308/1308 tests
passing, 95.93%/91.97%/93.93%/97.34% coverage. One finding (a Lighthouse report) was carried
forward as out of that round's scope (no `lighthouse` devDependency); it is still out of scope
here for the same reason (Phase 8's own safety rules say not to add dependencies this phase
doesn't own).

**Finalize numbers** (this step, run from a clean state, all in `frontend/`):

| Command                                                                  | Result                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                         | "Lockfile is up to date, resolution step is skipped." No dependency was added or changed.                                                                                                                                      |
| `npx tsc --noEmit`                                                       | exit 0, whole project                                                                                                                                                                                                          |
| `npx eslint . --max-warnings=0`                                          | exit 0, whole project (fixed one pre-existing error and 8 pre-existing stale-`eslint-disable` warnings in `tests/perf/*`, carried forward since Gate A/Integrate — see "Deviations" below)                                     |
| `npx prettier --check .`                                                 | Clean except `docs/BENCHMARKS.md`, a pre-existing issue from before this step (table-column misalignment in sections this step never touched); `format:check` is not part of `pnpm check`, so this does not fail the gate      |
| `npx vitest run --coverage`                                              | **120 files, 1335 tests passed, 0 failed.** 94.69% statements, 91.74% branches, 92.39% functions, 96% lines (global 70% bar and `src/domain`'s 90% bar both comfortably met)                                                   |
| `npx vite build`                                                         | exit 0. Initial JS 740.80 kB (**232.04 kB gzip**) + 28.31 kB CSS (6.39 kB gzip), under the spec's 250 kB gzip budget. Map chunks unchanged in shape: `MapView-*.js` 291.19 kB gzip, `DrawControl-*.js` 35.95 kB gzip           |
| `npx playwright test` (Chromium, fresh `pnpm dev`)                       | **20 passed, 1 skipped** (the `E2E_LIVE=1`-gated live-backend variant). Includes the two new `tests/e2e/history.spec.ts` specs (session history, including a real page reload to prove the IndexedDB-backed entry survives it) |
| `pnpm check` (typecheck + lint + test + build, the combined gate script) | exit 0                                                                                                                                                                                                                         |

---

## Phase 0 — Discovery and contract (status: ✅ done)

**Done:**

- Read the backend: `main.py`, `auth.py`, `config.py`, `exceptions.py`, both endpoint modules, all three model modules, the geometry, weather and analytics services, the unit/band parts of `gee_service.py`, the constants, and the threshold JSON scales.
- `frontend/openapi.json`: generated from `app.openapi()` (5 paths, 16 schemas).
- `frontend/docs/API_CONTRACT.md`: verified contract, error shapes, failure semantics, metric and unit dictionary, differences D1–D7.
- `frontend/docs/BACKEND_REQUESTS.md`: 13 requests, including all six the prompt required (CORS, password-less token, crops endpoint, advisory condition and units, no-data vs 0.0, data-source status).
- `frontend/docs/DECISIONS.md`: ADR-001 to ADR-007.
- No application code was written (per the phase's exit rule).

**Verified:**

- `.env` is empty and git-ignored, so the backend can't start (`PROPELAUTH_AUTH_URL` and `PROPELAUTH_API_KEY` missing). **Live checks were not possible.** See ADR-002.
- `uv run python -c "from app.main import app; app.openapi()"` works, and its output is saved to `frontend/openapi.json`.
- Tooling present: Node v24.21.0, pnpm 12.4.2, corepack 0.36.0.
- Backend files were not modified. The only changes are under `frontend/`.

**Deviations / decisions:** [ADR-001 to ADR-007](DECISIONS.md). Prompt-vs-code differences: API_CONTRACT §6.

**Known issues (backend, none block the frontend):** see [BACKEND_REQUESTS.md](BACKEND_REQUESTS.md). The three most important:

1. `/auth/token` mints a token for any email without a password (#1).
2. `precip`, `et_actual` and `gdd` are computed on a scale that doesn't match their thresholds, so the Agro_Meteo CPI and several advisories are wrong (#4).
3. A 200 response can contain no satellite data, and the response doesn't say so (#8).

### Open questions

None of these block the current work.

| #   | Question                                                                                                   | Needed by                              | Default if unanswered                                       |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Q1  | Can you provide `.env` values (PropelAuth test tenant and Earth Engine access) so the live checks can run? | Phase 3 manual check; Phase 8 live E2E | Mock with MSW and record the live checks as pending         |
| Q2  | Is the `precip`, `et_actual` and `gdd` scaling (BACKEND_REQUESTS #4) a known bug or intended?              | Phase 6 unit labels                    | Show hourly units with a caveat (ADR-006)                   |
| Q3  | What is the production sign-in plan (hosted PropelAuth login vs. password endpoint)?                       | Phase 3 UI                             | Build register plus dev-token tabs only                     |
| Q4  | Which basemap provider and key for production? The public OSM tile server is not meant for app traffic.    | Phase 4 wiring                         | OSM raster in dev, key-based style via `VITE_MAP_STYLE_URL` |
| Q5  | Should the frontend live in `frontend/` of this repo (assumed), or in its own repo?                        | Phase 1                                | `frontend/` in this repo (assumed so far)                   |

---

## Phase 1 — Scaffold and tooling (status: ✅ done)

**Done:**

- Vite 8 + React 19 + TypeScript strict in `frontend/`, Tailwind 4, ESLint (with the domain-purity, feature-boundary, named-export and no-console rules), Prettier, Husky and lint-staged, Vitest (jsdom, v8 coverage with thresholds), Playwright, MSW, `src/lib/env.ts` validation, the Vite `/api` proxy, `pnpm gen:api` and `src/api/generated/openapi.d.ts`, `src/lib/logger.ts`.
- Config: `package.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `README.md` (skeleton).

**Verified:** see the Gate A table above. `pnpm check` equivalents all exit 0 (typecheck, lint, test, build).

**Deviations / decisions:** none new. ESLint rules were not weakened at Gate A.

**Known issues:**

- The proxied `/health` call against a real running backend is **not verified**: the backend cannot start without `.env` (ADR-002). The Playwright smoke test passes against the dev server, not against the real API.
- No pre-paint theme script in `index.html`, so a user whose stored manual theme differs from the OS may see one frame of the wrong theme.
- An orphan `pnpm dev` (vite, port 5173, pid 5748 when checked) was left running by an earlier agent. `playwright.config.ts` reuses an existing server, so it was used by the Gate A e2e run. Stop it when finished.

**Next:** Husky hooks should be confirmed on a fresh clone (`pnpm hooks:install`), not checked at Gate A.

## Phase 2 — Design system and app shell (status: ✅ done)

**Done:**

- Tokens and global styles: `src/styles/tokens.css`, `globals.css`, `contrast.ts`.
- Primitives in `src/components/ui`: Button, IconButton, TextField and TextArea, NumberField, Combobox, DateRangePicker, Slider, Tabs, Tooltip, Toast, Dialog, Drawer, Badge, Skeleton, EmptyState, ErrorBanner, Stepper, icons, date utils.
- App shell in `src/app`: providers, `ThemeProvider` and toggle, router (`/login`, `/`, `/dev/ui`, catch-all), `AppShell` (56 px top bar, 360 px setup panel, fluid map, collapsible 380 px inspector, drawer and desktop notice below 1280 px), error boundaries at app, panel and route level, API health slot in the top bar, dev-only `/dev/ui` showcase.
- `App` takes typed `slots={{ login, user, setup, map, inspector }}` so feature tracks plug in without editing the shell.
- Docs: `docs/DESIGN.md` (tokens, primitives, shell, integration points, data colour scales).

**Verified:**

- Contrast of text (>= 4.5:1) and UI (>= 3:1) is computed in both themes in `tokens.test.ts`.
- Playwright axe spec: 15 tests, 0 violations, Chromium (re-run at Gate A: 17 passed with the smoke spec).
- `/dev/ui` is absent from a production build (track checked a build into a temp dir: no showcase strings, no extra chunk).

**Deviations / decisions:**

- Disabled dates beyond today + 16 are explained by a persistent note in the calendar plus `aria-describedby`, not a hover tooltip.
- `Button` uses `aria-disabled` and stays focusable so a tooltip can say why. Tests assert `aria-disabled`.
- `DateRangePicker` has no typed-date entry yet.
- NumberField, Combobox and the calendar are hand-built to the ARIA patterns (Radix has none), with no new dependency.

**Known issues:**

- `jest-axe` and `axe-core` are not importable from `src` under pnpm, so jsdom tests check roles, names and keyboard behaviour but real axe and contrast checks exist only in Playwright, and Playwright is not in CI.
- Open dialog, drawer and calendar states were checked by axe and DOM tests, not by eye. Only the shell and `/dev/ui` at 1440 px were reviewed in screenshots.
- Fixed at Gate A: `Toast.test.tsx` "dismisses itself after its duration" used a 30 ms toast and failed once under coverage load (the toast was gone before `findByText` looked). Duration is now 1000 ms with a 5 s wait; assertions unchanged.

**Next:** none for this phase. The §3.6 review checklist is Phase 7.

## Phase 3 — API client and authentication (status: ✅ done)

**Done (non-UI):**

- `src/api`: `errors.ts` (ApiError union with 10 kinds, `parseApiError` that never throws, `userMessage`, field-path mapping, `Retry-After`), `client.ts` (fetch wrapper: per-request token, own timeout vs caller abort, Zod validation, 401/403 handling), `schemas.ts` (+ `schemas.types.test.ts` compile-time contract test), `endpoints.ts`, `instance.ts`, `health.ts`.
- `src/lib/session`: `storage.ts` (safe storage with memory fallback), `store.ts` (sessionStorage-only token store, `expiresAt`, `subscribe`, `onEvent`, `signOut`, `handleAuthFailure`, `expire`), `expiry.ts` (expiry maths, 5-minute warning, timer clamp above 2^31 ms).
- `src/features/auth/api-hooks`: `useSession`, `useSessionExpiry`, `useSignOut`, `useWhoAmI`, `useRegisterMutation`, `useTokenMutation`, `useRenewSessionMutation`, `useAnalyzeMutation` (cancel, `startedAt`, no retry, aborts on unmount), `shouldRetryQuery`. Re-exported from `src/features/auth/index.ts`.

**Verified:**

- 198 tests (155 in `src/api` and `src/lib/session`, 43 in `features/auth`) pass; every error shape in API_CONTRACT §2 is tested, plus network failure, caller abort, timeout, malformed JSON and bad-schema 200s. Coverage on `src/api` is 98.82% statements, 97.98% branches; `src/lib/session` 100% / 95.74%; `features/auth/api-hooks` 100% / 95%.
- `schemas.types.test.ts` was shown to fail `tsc` when a schema drifted (track check), then restored. It only runs under `pnpm typecheck`.
- All tests use MSW fixtures. **No real PropelAuth or backend call was made.**

**Deviations / decisions:**

- `ApiError` is `Error & union-by-kind` plus `isApiError`, not a class, so it is a true discriminated union.
- Schemas do not enforce CPI in 0..1 (float drift would reject a whole analysis) but require `features.min(1)`, so an empty 200 becomes an `unknown` error.
- `ANALYZE_TIMEOUT_MS` is 180 s and the default is 30 s. Both are assumptions: real `/analyze` latency is unverified (API_CONTRACT §7).
- 401/403 body shapes and `Retry-After` / PropelAuth `field_to_errors` shapes are inferred and tolerated, not verified against a live backend.

**Known issues:**

- No login page, user menu, route guard or "Your session expired." message yet. `session.onEvent` must be wired to the router, `queryClient.clear()` must be called on `expired`, and `useSessionExpiry` must be mounted once near the root.
- `useWhoAmI` is keyed by user id, so after a 401 clears the session its error is not shown. Consumers must use the session event for the expired message.
- Manual check against the real backend: **pending** (Q1).

**Next (as of Gate A):** build the login page (register and dev-token tabs) through `slots.login`, the user menu through `slots.user`, the route guard with `?next=`, and the expiry wiring above, with component tests for each auth path.

**Integrate update (done by the integrator):** the auth UI (`LoginCard`, `DevTokenSignInForm`,
`RegisterForm`, `ProductionSignInNotice`, `RouteGuard`, `UserMenu`, `SessionExpiryToast`) already
existed from the auth+field feature track; this step wires it into the running app:

- `src/app/router.tsx`: the `/` route element is now `<RouteGuard><WorkspacePage slots={slots} /></RouteGuard>`, so the workspace actually requires a session and redirects to `/login?next=...` (previously `RouteGuard` existed but nothing used it).
- `src/main.tsx`: `<App slots={{ login: <LoginCard />, user: <UserMenu />, ... }}>` — the login card and user menu are the real feature components, not placeholders.
- `src/app/ApiHealthIndicator.tsx`: the healthy-state label changed from "API healthy" to **"API reachable"** per `BACKEND_REQUESTS.md` #11 (`/health` is liveness only). Updated everywhere it was asserted: `ApiHealthIndicator.test.tsx`, `App.test.tsx`, `tests/e2e/smoke.spec.ts`, `tests/e2e/a11y-ui.spec.ts`.
- `src/app/App.test.tsx`: updated for the new auth gate — added a test that `/` redirects to `/login` with no session, and every other `/` test now calls a `signIn()` helper (`session.setSession(...)` plus a mocked `/auth/whoami`) first. This is a real behaviour change (the whole point of wiring `RouteGuard`), not a weakened test: nothing was deleted, a case was added.
- `playwright.config.ts`: the dev server Playwright starts now gets `env: { VITE_ENABLE_DEV_TOKEN_LOGIN: 'true' }`, since `.env` stays empty (ADR-002) and the dev-token sign-in tab must be visible for every E2E spec that signs in. This is a boolean feature flag, not a secret.
- `tests/e2e/fixtures/mock-api.ts` (new): route-interception helpers (`mockHealth`, `mockAuth`, `mockAnalyze`, `mockHappyPath`, `signIn`) shared by `smoke.spec.ts`, `a11y-ui.spec.ts` and the new `happy-path.spec.ts`.

**Verified:** `npx vitest run src/app/App.test.tsx` and the full suite both pass (see the Integrate
numbers table). `npx playwright test` passes the sign-in step in both `smoke.spec.ts` and
`happy-path.spec.ts`, against the mocked dev-token endpoints, in a real Chromium browser.

**Known issues (unchanged):** manual check against the real backend is still **pending** (Q1):
`.env` is still empty, so `/auth/token`, `/auth/whoami` and PropelAuth itself have never been
called for real, only through MSW (unit tests) and Playwright route interception (E2E).

## Phase 4 — Field input and map (status: ✅ done)

**Done:**

- Domain geo in `src/domain/geo.ts`: `validateFarmGeometry`, `sanitizeFeatureCollection` (typed overloads, altitude kept unless `dropAltitude`), `areaHectares`, `areaAcres`, `vertexCount`, `farmBbox`, `estimateCellCount` and the cell-count warning levels (warn at 2000, confirm at 10000). 207 domain tests in total.
- Map layer in `src/features/map`: `MapView` and `DrawControl` (lazy wrappers only), basemap and theme handling, `BasemapToggle`, Terra Draw wrapper, grid source and layers, `GridOverlay`, `Legend`, `HoverTooltip`, `LayerSwitcher`, colour scales, `domain-options.ts` (domain metric dictionary to `MetricOption` and `ClusterOption` props).

**Verified:**

- 296 map tests pass (18 files, plus `domain-options.test.ts`). Coverage on `features/map`: 97.39% statements, 91.17% branches.
- `src/domain` coverage: 100% statements, 99.59% branches, 100% functions, 100% lines (threshold 90%).
- Colour scales (measured, see `DESIGN.md` "Data color scales"): worst contrast against basemap reference colours 3.09:1 (metric, light; needs >= 3:1); lightness monotonic for every sequential scale; protanopia and deuteranopia adjacent steps >= dE2000 3.1.
- Integration fix at Gate A: map props now use the domain `MetricKey` (previously `string`) in `LayerSpec`, `LayerSelection`, `MetricOption.key`, `ClusterOption.metricKeys`. `types.ts` imports the types from `@/domain`, which the map track had already started. Behaviour unchanged; two tests that fed deliberately unknown keys (`'toString'`, `'nope'`) now cast them, and the metric `<select>` resolves the picked key against the option list instead of passing the raw string.

**Deviations / decisions:**

- Map track began with the code already present, so its test-first order for that code is unverified. Lint and format fixes were done under green tests.
- Domain track: for every module a red run (module not found) was seen, but not red on the assertions. Five rule mutations were applied and each made tests fail.
- `fixtures.ts` (the `makeCell` helper) lives in `src/domain` and counts toward domain coverage. It is not exported.

**Known issues:**

- **Nothing here has run in a real browser.** MapLibre and Terra Draw are mocked, so WebGL rendering, the hatch pattern, hover performance, PNG export and real vertex editing with undo/redo are untested.
- Colour-blind checks cover protanopia and deuteranopia only. Margins are thin: cpi/dark under protanopia (dE 3.1 at 6 classes, 2.6 at 7), and 3.09:1 contrast for metric/light. Satellite and custom styles are outside the 3:1 guarantee.
- Not built: GeoJSON upload and paste UI, drawing wired to the form, sample field, area/vertex stats panel. Domain validation does not check that a hole lies inside its shell, does not reject zero-area rings, and does not wrap a bare Feature or geometry into a FeatureCollection (the server catches the first two). Rings that touch themselves at a vertex are untested with `kinks`.
- `eslint.config.js` bans `@/api` in `domain/`, so `domain/types.ts` imports the generated types by the relative path `../api/generated/openapi` (type-only). Allowing `@/api/generated/*` type imports in the domain rule is the cleaner fix, left to a deliberate lint-config decision.
- `crops.drift.test.ts` finds the repo root three levels above `src/domain`; moving it breaks it. The backend has 82 crops, not the roughly 80 the spec says.

**Next (as of Gate A):** build the field-input UI (draw, upload, paste, sample field) so all three produce the same normalised `FarmFeatureCollection`, wire `MapViewLazy` into the shell's `map` slot, check in a real browser, and confirm the map lands in its own chunk.

**Integrate update (done by the integrator):** `features/field`'s UI (`FieldStep`, `UploadField`,
`PasteField`, `FieldSummary`, `SAMPLE_FIELD`) already existed from the auth+field feature track,
built to share the same `FarmFeatureCollection | null` / `onChange` contract as the map's
`DrawControl` (by design, see that track's own notes) but never actually rendered together. This
step does that:

- `src/app/workspace/WorkspaceContext.tsx` (new): the single `farm` state both `SetupSlot` (`FieldStep`'s Draw/Upload/Paste tabs plus "Load sample field") and `MapSlot` (`DrawControlLazy`) read and write, so drawing, uploading, pasting and the sample field all land in one place and are visible on the map immediately.
- `src/app/workspace/MapSlot.tsx` (new): `MapViewLazy` is now rendered for real (via `main.tsx` → `slots.map`), with `fieldBounds={farmBbox(farm)}` so the map fits the field automatically, `GridOverlay`, the `LayerSwitcher`/`Legend` in the map's corner, and the hover tooltip.
- **Confirmed in a real browser** (Chromium, via Playwright): `npx vite build` now actually code-splits the map — `MapView-*.js` (291.19 kB gzip) and `DrawControl-*.js` (35.95 kB gzip) are separate chunks from the 230.39 kB gzip initial bundle, loaded only once the workspace mounts (previously nothing statically imported `MapViewLazy`, so the map code wasn't in the build at all; ARCHITECTURE.md §5 said to re-check this once wired in). The initial bundle still sits under the 250 kB gzip budget.
- The `happy-path.spec.ts` E2E test loads the sample field, draws nothing (uses the sample), and gets a field summary ("108.55 ha · 268.24 ac", 4 vertices) in a real browser — the first time any of this has run outside jsdom mocks.

**Known issues found during Integrate:** a `console.error` ("Worker failed to load. Check that the
worker URL is correct.", from MapLibre's own code) appears in the dev server's console on every
page load in this sandboxed browser environment. It did not fail any test or visibly break the
map (the field summary, draw toolbar and layer switcher all render and respond), but it was not
investigated further here — flagged for whoever next touches the map in a real deployment
environment to confirm it is sandbox-specific and not a real worker-bundling problem.

## Phase 5 — Analysis setup and run (status: ✅ done)

**Done (non-UI):**

- Domain helpers: crop dictionary with English and desi names (`crops.ts`), date presets and the +16-day rule (`dates.ts`), `estimateCellCount`, `isValidGridSize`, `GRID_SIZE_PRESETS`, `buildAnalysisRequest`, `inputsHash` (`request.ts`).
- The analyze mutation with cancel, `startedAt` and no retry (`useAnalyzeMutation`).
- UI primitives these will use: Combobox, DateRangePicker, Slider, NumberField, Button with a disabled reason tooltip, ErrorBanner.

**Verified:** covered by the domain and auth hook tests above. There is no end-to-end analyze run yet, so the Phase 5 exit criterion (MSW-mocked analyze run through 400, 422, 500, network failure and cancel in component tests) is **not met**; the hook-level tests cover those cases without a UI.

**Deviations / decisions:**

- Season-to-date preset starts on the latest of 1 June (Kharif) or 1 November (Rabi). This is the domain agent's own heuristic. **Needs owner review.**
- Last 7 and last 30 days both end today and are inclusive; forecast runs from tomorrow to today + 16.
- Cell estimate takes hectares and the grid size as the cell side in metres, minimum 1 for any positive area.
- `inputsHash`: 14 hex characters, non-cryptographic, over geometries, dates, crop and grid size; ignores feature ids and properties.

**Known issues:** no setup panel, no React Hook Form + Zod form, no recents, no live cell-estimate warning UI, no progress UI.

**Next (as of Gate A):** build `analysis-setup` (form, crop combobox, date range, grid size, "what's missing" tooltip, run and cancel with elapsed time) and the error rendering, with MSW tests for 400, 422, 500, network failure and cancel.

**Integrate update (done by the integrator):** `features/analysis-setup`'s UI (`AnalysisSetupPanel`,
`useAnalysisFlow`, `RunningOverlay`, `AnalysisErrorPanel`, `StaleBadge`, ...) already existed from
its own feature track, exit-criterion component tests included (400/422/500/network/cancel, per
that track's report). This step wires it into the real page so the flow can run end to end:

- `src/app/workspace/SetupSlot.tsx` (new): renders `<AnalysisSetupPanel flow={flow} />` next to `FieldStep`, sharing the one `useAnalysisFlow({ farm })` call from `WorkspaceContext`.
- `src/app/workspace/MapSlot.tsx`: renders `<RunningOverlay>` over the map while `flow.state.status === 'running'`, wired to `flow.cancel` — this is the first time the running/cancel UI has been shown over a real map rather than a standalone component test.
- `tests/e2e/happy-path.spec.ts` (new): drives the real form — crop combobox ("Wheat"), the "Last 30 days" date preset, the default 50 m grid — through a real `Analyze` click, and asserts the honest "Fetching satellite & weather data…" message appears (backend mocked with a deliberate 500 ms delay so the running state is actually observable, not raced past) before results land.

**Known issues:** the Phase 5 exit criterion ("an MSW-mocked analyze run works end to end in
component tests, including 400, 422, 500, network failure and cancel") was already met at the
component level by the analysis-setup track before this step. The new E2E test exercises only the
**success** path end to end in a real browser; the 400/422/500/network/cancel paths are still
verified only by component tests (Testing Library + MSW), not by Playwright. Given the time this
Integrate pass had, that was judged the right trade-off — the component tests already cover those
branches thoroughly — but a fuller E2E error-path sweep is reasonable future work (Phase 8 or a
dedicated QA pass).

## Phase 6 — Results visualization (status: ✅ done)

**Done (partial):**

- Map-side results: grid choropleth, `Legend`, `HoverTooltip`, `LayerSwitcher` (including the `L` cycle), `GridOverlay`, no-data hatch, colour scales and legend/layer models.
- Domain-side results: CPI clusters and the no-data rule (ADR-003), advisory grouping with "applies to N of M" (ADR-004), metric dictionary with units and decimals, formatting (`src/domain`).

**Verified:** unit and component tests only (see Phase 4). The Phase 6 exit criteria (10k-cell hover performance check, the E2E happy path) are **not done**.

**Deviations / decisions:**

- A cluster with no data exports an empty cell, not 0.0, in CSV (ADR-003). Advisories for metrics with no value are exported empty (ADR-004).
- `MetricMeta.decimals` is 2 for indices and 1 for physical units, with exceptions: `soil_moist` 2; `vci`, `tci`, `vhi` 1; `payout` 0. Units follow API_CONTRACT §5: `gdd` is "°C·hours", `crti` is "mm/h·cells", `vci`/`tci`/`vhi` are "0–100". `precip` shows 1 decimal, so a typical hourly mean reads 0.0 mm/h (ADR-006 caveat).

**Known issues:** no inspector (farm summary, CPI bars, advisories, cell detail), no table view, no keyboard grid navigation, no stale-results detection UI, no E2E happy path. Rendering and hover performance are unmeasured because the map has only run under mocks.

**Next (as of Gate A):** build the inspector and table view, then measure hover with a 10k-cell fixture in a real browser.

**Integrate update (done by the integrator):** `features/results`'s UI (`ResultsPanel`,
`FarmSummaryPanel`, `CellDetailPanel`, `TableView`, `AdvisoryList`, `ClusterBarChart`,
`ExportControls`, `use-cell-selection`) already existed from its own feature track. This step wires
it into the inspector slot and connects its selection state to the map, which the results track's
own report flagged as the one thing it could not do (results and map are sibling `AppShell` slots):

- `src/features/results/ResultsPanel.tsx`: added an **optional** `selection?: UseCellSelectionResult` prop. When omitted it behaves exactly as before (an internal `useCellSelection(cells)`, still always called so hook order never changes) — every existing `ResultsPanel` test still passes unmodified. When supplied, the panel and the map share one selection.
- `src/app/workspace/WorkspaceContext.tsx`: owns the one `useCellSelection(cells)` for the whole workspace.
- `src/app/workspace/MapSlot.tsx`: `GridOverlay`'s `selectedId`/`highlightIds` read from that same selection, and clicking a cell on the map (`onSelect`) calls `selection.select(...)` — so a map click and a table/advisory click now affect the same state, as ARCHITECTURE.md's state-ownership table always intended.
- `src/app/workspace/MapSlot.tsx` / `InspectorSlot.tsx`: a small `MapActionsBridge` component, rendered inside `<MapView>`, pushes `useMapActions()` up into `WorkspaceContext` so `ExportControls`' PNG button (in the inspector, outside the map's React context) gets a real `exportMapPng` once the map exists — the other thing the results track's report flagged as unwired.
- `src/app/workspace/layer-display.ts` (new, unit-tested): `describeLayer`, `buildLegendInput` and `buildHoverRows` — pure functions that turn the active `LayerSpec` into the legend's title/unit/decimals/scope and the hover tooltip's rows, from the domain's own cluster and metric dictionaries (so the legend, tooltip and layer switcher can never disagree about what a layer is called). 7 new Vitest tests, written red-then-green.
- `src/app/workspace/ShortcutsDialog.tsx` (new) and the `L` / `?` keydown handling in `WorkspaceContext`: the two spec 3.6 shortcuts with no single owning component (`D`, `Esc` and Ctrl/Cmd+Enter live with `DrawControl`/`useAnalysisFlow`; `[`/`]` live with `ResultsPanel`).
- `tests/e2e/happy-path.spec.ts`: after Analyze, switches to "View as table" and clicks a row to select a cell — a deliberate choice over clicking the map's WebGL canvas at a pixel coordinate, which would be far less reliable in CI; the table and the map read the same selection state either way. Then exports CSV and reads the downloaded file's content back to confirm it contains the real `grid_id` of the selected row.

**Verified:** the full happy path (analyze → results → select a cell → export CSV, content
checked) passes in a real Chromium browser (see `happy-path.spec.ts`). The farm summary ("Cells
needing attention" heading), the CPI bars, advisories and the cell detail view were all visually
confirmed to render in that run.

**Known issues (still open):** the **10,000-cell hover-performance check** (this phase's other
exit criterion) was **not done** in this Integrate step — it needs a dedicated performance pass
with the `tests/fixtures/large-analysis.ts` fixture loaded into a real browser and profiled, which
was out of scope for wiring the workspace together. Flagged for Phase 8 or a dedicated QA pass.
Colour-blind checks (Phase 4) are unchanged. Keyboard arrow-key cell navigation and `[`/`]` were
exercised by the results track's own component tests but not re-verified in the new E2E test.

## Phase 7 — Export, history and polish (status: ✅ done)

**Done:**

- Export (CSV, GeoJSON, PNG) and the shortcut sheet: already built and wired at Integrate (see
  that section below) — confirmed still working, unchanged, by this step's full gate run.
- **Session history** (new, this step, TDD throughout — failing test, minimal implementation,
  green, for every module below):
  - `src/domain/history.ts`: `HistoryEntry`, `MAX_HISTORY_ENTRIES` (10), `summarizeHistoryEntry`
    (crop, date range, cell count with correct singular/plural), `trimHistory` (newest first,
    non-mutating). 5 tests.
  - `src/features/history/store.ts`: `HistoryStore` interface, `createMemoryHistoryStore` (a real,
    fully-featured in-memory implementation — list/put/delete/clear, overwrite-by-id, returns
    copies not live references) and `createIndexedDbHistoryStore` (wraps the real browser
    `IndexedDB`, every operation caught so a blocked/missing/failing database degrades to "no
    history" rather than throwing — history is explicitly optional local storage, never
    load-bearing). 7 tests. jsdom (the unit-test environment) has no `IndexedDB` at all (confirmed
    by a throwaway probe before writing the store: `typeof indexedDB === 'undefined'` in every
    Vitest test), so `createIndexedDbHistoryStore()` automatically falls back to the in-memory
    implementation there — the real `IndexedDB` code path is covered instead by a real-browser E2E
    spec (see below), not by any Vitest test.
  - `src/features/history/use-session-history.ts`: load/add (trims to 10, evicting the oldest from
    storage too, not just from what's displayed)/clear. The store is constructed lazily inside the
    hook (`useState(() => store ?? createIndexedDbHistoryStore())`), not as a module-level
    singleton, specifically so each component mount (and, in tests, each render) gets its own
    isolated store rather than silently sharing one global instance across unrelated tests. 4 tests.
  - `src/features/history/format-saved-at.ts` (1 test) and `HistoryPanel.tsx` (the list UI: loading
    skeleton, empty state, Reopen, Clear history — 6 tests).
  - Wired into `src/app/workspace/WorkspaceContext.tsx`: a new shared `response`/`cells` (replacing
    each slot's own ad hoc derivation from `flow.state`, so the map and inspector can never
    disagree about what's on screen), `historyEntries`, `historyView` (the saved run currently
    shown in place of the live one, or `null`), `openHistoryEntry`/`closeHistoryView`/
    `clearHistory`. Each new successful run is recorded once (deduplicated by `requestHash`, never
    while viewing a saved run); starting a fresh run always leaves the saved view behind. The
    "leave the saved view" reset uses the state-tracks-state render-time pattern
    (react.dev/learn/you-might-not-need-an-effect), not a ref and not an effect, after the new
    `eslint-plugin-react-hooks` rules in this repo (`react-hooks/refs`, `react-hooks/set-state-in-effect`)
    refused both of the more obvious approaches — each refusal is recorded as a comment at the call
    site, not just fixed silently. 3 new tests in `WorkspaceContext.test.tsx`, driving a real
    analyze run through MSW exactly as `use-analysis-flow.test.tsx` does (sign in, fill the form,
    wait for `canSubmit`, submit, wait for success).
  - `src/app/workspace/InspectorSlot.tsx`: a "History" button and dialog (`HistoryPanel` inside
    `Dialog`), plus a banner ("Viewing a saved run — run a new analysis for current results.") with
    a "Back to current" button while `historyView` is set.
  - `use-analysis-flow.ts`'s `AnalysisFlowState`'s `success` variant gained a `request` field (the
    exact `FarmAnalysisRequest` that run used), added TDD (one new failing test first) so
    `WorkspaceContext` has something concrete to hand `history.add()`.
  - `tests/e2e/history.spec.ts` (new, real Chromium): a completed run is saved, **survives a page
    reload** (the one place the real `IndexedDB` path actually runs, not the in-memory fallback),
    can be reopened, and "Clear history" empties the list.
- A reduced-motion pass across the new workspace composition: already covered everywhere it
  matters — the global CSS override (`globals.css`) handles the composition's own layout
  transitions with no extra code needed, and the only JS-driven motion a composition-level
  component touches (`RunningOverlay`, the map's camera moves) already checked
  `prefers-reduced-motion` directly before this phase. Confirmed, not just assumed: re-read every
  file with `prefers-reduced-motion`/`reduceMotion` in it and re-ran
  `tests/e2e/a11y-ui.spec.ts`'s "reduced motion removes animations" spec (still passes).
- The full spec §3.6 review checklist: written into `docs/DESIGN.md` as a table, one row per
  principle, each with concrete evidence (a file, a test, or both) rather than a bare checkmark;
  two rows are marked "not separately measured" / "one open owner question" rather than silently
  claimed — see that file for the honest detail.

**Verified:** see "Finalize numbers" above. `src/domain/history.test.ts` (5),
`src/features/history/*.test.ts(x)` (18 across 4 files), `WorkspaceContext.test.tsx`'s new
`describe('session history')` block (3), `use-analysis-flow.test.tsx`'s new request-field test (1),
and `tests/e2e/history.spec.ts` (2) are all new; every pre-existing test in every file this step
touched (`use-analysis-flow.ts`, `WorkspaceContext.tsx`, `MapSlot.tsx`, `InspectorSlot.tsx`) still
passes unmodified.

**Deviations / decisions:**

- Session history is a new `src/features/history` feature, not `src/lib`, even though it's mostly
  storage plumbing: it owns UI (`HistoryPanel`) as well as the store, so it fits the "feature"
  shape (domain-ish logic + UI) better than the purely-infrastructure `src/lib/session`.
- `WorkspaceContext`'s `response`/`cells` is now the one shared source both `MapSlot` and
  `InspectorSlot` read, instead of each deriving it separately from `flow.state`. This was
  necessary for `historyView` to actually change what the map and inspector show, and happens to
  remove a small duplication that predated this phase.
- No "typed-in" confirmation before "Clear history" (just the button): the spec's own wording is
  "offer a Clear history action", and the data it clears is explicitly non-load-bearing local
  convenience data, not something a confirmation dialog's extra friction is worth for.

**Known issues:** none new. The pre-existing ones (10k-cell hover-performance check,
component-only coverage of 400/422/500/network/cancel in E2E, the MapLibre "Worker failed to load"
sandbox-only console error) are unchanged by this phase and listed where they always were.

## Phase 8 — Hardening and documentation (status: ✅ done, with honest carve-outs)

**Done:**

- **Production Dockerfile** (`frontend/Dockerfile`): multistage — `node:22-alpine` installs with
  `pnpm install --frozen-lockfile` and runs `pnpm build` (every `VITE_*` value is a build arg,
  since Vite only reads `import.meta.env.VITE_*` at build time); `nginxinc/nginx-unprivileged:1.27-alpine`
  serves the result, already non-root by construction (uid 101, listens on 8080), with a
  `HEALTHCHECK` against `/` (the static shell nginx itself serves, independent of the backend's
  own state). `docker/nginx.conf.template` proxies `/api` and `/health` to `API_PROXY_TARGET`
  (a runtime env var, substituted at container start via `NGINX_ENVSUBST_FILTER` so nginx's own
  `$host`/`$remote_addr` variables in the same file are left alone), with a 190s proxy timeout for
  the genuinely-slow `/analyze` call, SPA fallback (`try_files $uri /index.html`), and immutable
  caching for hashed asset filenames. `frontend/.dockerignore` added (node_modules/dist/coverage/
  etc. excluded from the build context — there was none before this phase, so `COPY . .` would
  otherwise have copied the host's own `node_modules` over the container's, a real
  platform-mismatch risk, not just slow).
- **`docker-compose.frontend.yml`** (inside `frontend/`, Phase 8's own constraint: never edit the
  repo root's `docker-compose.yml`): adds a `frontend` service under the same Compose project name
  (`farmland`) so running it together with the root file (`docker compose -f docker-compose.yml -f
frontend/docker-compose.frontend.yml up --build`) merges into one project and one network —
  `frontend` reaches the backend's `api` service by that name. Same hardening as the backend's own
  `api` service (`read_only`, `cap_drop: [ALL]`, `no-new-privileges`, `init: true`).
- **`docs/DEPLOYMENT.md`** (new): the CORS reasoning for why a reverse proxy is needed at all (the
  backend has none, `BACKEND_REQUESTS.md` #3), build-time (`VITE_*`, as Docker build args) vs.
  runtime (`API_PROXY_TARGET`, a container env var) configuration — genuinely easy to confuse and
  spelled out explicitly — how to run it with the backend, and how to adapt the nginx template for
  a different reverse proxy.
- **`docs/CONTRIBUTING.md`** (new): the ground rules restated, every script, Conventional Commits
  with real examples from this repo's own scopes, and step-by-step "how to add a metric" / "how to
  add a crop" (the latter stressing that the backend's own list is the source of truth, checked by
  `crops.drift.test.ts`, not something this file invents).
- **Final README** (`README.md`, replacing the Phase-1-era placeholder): what it is plus a real
  screenshot (`docs/screenshots/light-1280-results.png`), quick start for both the backend and the
  frontend, the env var table, every script, an architecture overview (with a pointer to
  `ARCHITECTURE.md`/`DESIGN.md` for the full detail), testing, deployment, known limitations linked
  to `BACKEND_REQUESTS.md`, and a roadmap built directly from the still-open Q1-Q5 below plus every
  carried finding in this file.
- **CI workflow example** (`.github-workflows-example.yml`, not `.github/workflows/`, per this
  phase's own instruction not to create `.github` at the repo root — a comment at its top explains
  why and how to actually enable it): `pnpm check`, Playwright (mocked backend, no credentials),
  and a bundle-size budget job that measures the real initial JS gzip size and fails above 250 kB
  (the map chunk excluded by filename, matching the spec's own "excluding the map chunk" wording) —
  written as a plain shell loop over `dist/assets/*.js` rather than a new `size-limit`-style
  devDependency, since adding one is outside this phase's permitted scope. Dry-run against the real
  build output in this session: 229,640 / 256,000 bytes.
- **`docs/ARCHITECTURE.md`**: updated rather than left stale — its header now says when it was
  last brought current, the "Other features" row (which claimed `field`/`analysis-setup`/`results`
  were "empty barrels") is corrected, a row for the new `history` feature is added, the "Planned
  (not built yet)" section (route guard, slots, session-expiry wiring, the analysis state union —
  all built since Gate A) is replaced with a note that everything it listed is done, the state-
  ownership table's three "planned" rows are corrected, and the bundle-size/testing sections carry
  this step's real numbers instead of Gate A's.
- **This file**: every phase above given an honest status (see the table at the top), the
  Finalize numbers table, and the open questions below re-confirmed rather than silently dropped.

**Verified:** see "Finalize numbers" near the top of this file — a full `pnpm install
--frozen-lockfile`, `tsc --noEmit`, `eslint . --max-warnings=0`, `vitest run --coverage`
(1335/1335), `vite build` (232.04 kB gzip initial) and `playwright test` (20 passed, 1 skipped) run
from a clean state, all passing. `docker compose -f docker-compose.yml -f
frontend/docker-compose.frontend.yml config` was run and confirms the two compose files merge into
one valid project with `frontend` resolving `api` by service name (no Docker daemon needed for
`config`); running the standalone `docker-compose.frontend.yml` alone was also tried and correctly
refused ("depends on undefined service api"), confirming the documented "always run it with the
root compose file" constraint is real, not just asserted.

**Known issues / not done, stated plainly:**

- **The Docker build itself was never actually run.** This session's sandbox has the Docker CLI
  (`docker --version` works) but no running daemon: `docker info` never came up, even after
  launching Docker Desktop and waiting several minutes. The Dockerfile and compose file were
  reviewed carefully (the `NGINX_ENVSUBST_FILTER` mechanism, the non-root base image, the two-stage
  build, `.dockerignore`) and the compose file's YAML was validated with `docker compose config`,
  but `docker build`/`docker run` — the only way to be sure the image actually boots and serves —
  is unverified. **First thing to do with a working Docker daemon.**
- A Lighthouse report for `/login` (spec: performance score ≥ 90 on desktop) was not added: it
  needs a `lighthouse`/`@lhci/cli` devDependency, and this phase's safety rules say not to add a
  dependency it doesn't own — list it under `openIssues`/here instead, exactly as the QA fix round
  before this one also did.
- The live-backend E2E (`happy-path.spec.ts`'s `E2E_LIVE=1` describe block) has still never been
  run: `.env` is still empty in this environment (ADR-002, Q1).
- The 10,000-cell hover-performance check (Phase 6's own exit criterion) is still not done.
- Coverage is above every threshold (94.69% statements / 91.74% branches / 92.39% functions / 96%
  lines, global 70% bar and `src/domain`'s 90% bar both comfortably met) but was never a literal
  "100%" target — the spec never asked for that, only the thresholds above.
- `docs/BENCHMARKS.md` has a small pre-existing Prettier formatting issue (table-column
  misalignment in sections this phase never touched) carried forward from before this step;
  `format:check` is not part of `pnpm check`, so it does not fail the gate.

---

## Gate A: cross-track notes

- All four tracks compiled together with no import-path or type conflicts, no `console.*` in `src` outside `lib/logger.ts`, no `any`, no non-null assertions, and no lint warnings. Integration changes were limited to the map type tightening and the Toast test deflake described above.
- Production build is one 562 kB chunk (175 kB gzip), inside the 250 kB gzip budget. It contains no MapLibre or Terra Draw code because nothing static-imports the map yet. The design-system track reported that the size was "mostly map code"; that is not what the build shows. Re-check when the map is wired in.
- `main.tsx` still renders `<App />` with placeholder slots. No feature is reachable in the running app yet.
- `package.json` and `pnpm-lock.yaml` were not changed at Gate A. `@turf/bbox` and `@turf/boolean-valid` are installed but unused (bbox is computed by hand in `domain/geo.ts`); consider removing or using them.
- Test files that are helpers and count toward coverage: `src/domain/fixtures.ts`, `src/features/auth/api-hooks/test-wrapper.tsx`.
- Vitest creates one jsdom per test file (about 120 s of CPU in total, 20 s wall clock). Timing-sensitive tests can flake under load; two have been loosened so far (map `lazy.test.tsx` and `Toast.test.tsx`).

---

## Integrate — workspace composition (status: ✅ done)

Wired the real `auth`, `field`, `analysis-setup`, `map` and `results` features (all built by prior
phases, mostly in isolation from each other) into one running app behind `AppShell`'s slots, plus
the E2E happy path. Full detail is folded into each phase's own section above (search "Integrate
update"); this section is the cross-cutting summary and the honest numbers.

**Done:**

- `src/app/workspace/` (new): `WorkspaceContext.tsx` (the shared `farm`, `useAnalysisFlow`, cell
  `selection`, active map `layer`, hover info and `mapActions`, one provider for the whole app),
  `SetupSlot.tsx`, `MapSlot.tsx`, `InspectorSlot.tsx`, `ShortcutsDialog.tsx`, `layer-display.ts`
  (+ its test file — the only genuinely new domain-shaped logic this step added, built TDD: a
  failing `tsc`/import-not-found run, then the implementation, then green).
- `src/main.tsx`: wires `slots={{ login, user, setup, map, inspector }}` to the real components,
  replacing the placeholder-only render from Gate A.
- `src/app/router.tsx`: `/` is now behind `RouteGuard`.
- `src/app/ApiHealthIndicator.tsx`: "API healthy" → **"API reachable"** (BACKEND_REQUESTS.md #11).
- `src/features/results/ResultsPanel.tsx`: one new optional prop (`selection`) so the map and the
  inspector can share a selection; no existing behaviour changed when the prop is omitted.
- `tests/e2e/happy-path.spec.ts` (new) and `tests/e2e/fixtures/mock-api.ts` (new): the required E2E
  happy path (sign in → load the sample field → pick Wheat → last 30 days → analyze → select a
  cell → export CSV, with the CSV's actual downloaded content checked), plus an `E2E_LIVE=1`-gated
  live-backend variant that is skipped by default (`test.skip(process.env.E2E_LIVE !== '1', ...)`).
- `tests/e2e/smoke.spec.ts` and `tests/e2e/a11y-ui.spec.ts`: updated to sign in before reaching `/`,
  since it is now actually gated (previously these predated `RouteGuard` being wired in at all).
- `playwright.config.ts`: the dev server it starts gets `VITE_ENABLE_DEV_TOKEN_LOGIN=true` so sign-in
  works without a committed `.env`.
- `src/app/App.test.tsx`: added an unauthenticated-redirect test; every other `/`-route test now
  signs in first.

**Verified (all run in `frontend/`, see "Integrate numbers" near the top of this file for the
table):**

- `npx tsc --noEmit`: exit 0, whole project.
- `npx eslint . --max-warnings=0`: exit 0, whole project.
- `npx prettier --check .`: 3 new files needed formatting; fixed, then clean.
- `npx vitest run --coverage`: **111 files, 1271 tests, 1271 passed, 0 failed.** 93.95% statements,
  90.17% branches, 92.5% functions, 95.16% lines (global thresholds met). This is every test in the
  repo, from every phase and track, run together.
- `npx vite build`: exit 0. Initial JS 734.96 kB (**230.39 kB gzip**) + 28.21 kB CSS (6.37 kB gzip),
  under the spec's 250 kB gzip budget. The map is now a real, separate chunk — `MapView-*.js`
  291.19 kB gzip, `DrawControl-*.js` 35.95 kB gzip, `MapView-*.css` 10.25 kB gzip — confirming
  ARCHITECTURE.md §5's "re-check when the map is wired in" note: it does land in its own chunk.
- `npx playwright test` (Chromium, against a freshly started `pnpm dev`, not a reused server — see
  below): **18 passed, 1 skipped.** The skip is the live-backend variant, by design.

**Deviations / decisions:**

- The three slot components (`SetupSlot`/`MapSlot`/`InspectorSlot`) read shared state through a
  `WorkspaceContext` provider wrapping the whole app, rather than through props passed down from
  `AppShell` (which renders the three slots in separate parts of the page, not as a single
  component tree it controls) or by duplicating state in each slot. This matches the "one owner per
  kind of state" rule in ARCHITECTURE.md §3 while keeping `AppShell`/`WorkspacePage`'s existing,
  already-tested `slots` contract unchanged.
- `WorkspaceProvider` wraps the entire app (including `/login` and `/dev/ui`), not just the
  authenticated workspace, because `slots.setup`/`map`/`inspector` are built once in `main.tsx`
  alongside `slots.login`. This means `useAnalysisFlow`'s Ctrl/Cmd+Enter listener and the new `L`/`?`
  listeners are technically live (though inert — there is nothing to analyze or no layer to cycle)
  on the login and `/dev/ui` pages too. Harmless, but a cleaner split (scoping the provider to only
  the `/` route's subtree) is a reasonable follow-up if it ever causes an actual bug.
- `ResultsPanel` got an **additive, optional** prop rather than a rewrite, specifically so every
  test the results track wrote keeps passing unmodified — verified by running that file's test
  suite after the change (10/10 still pass).
- `MapActionsBridge` (a one-line component rendered only to call `useMapActions()` and push it into
  `WorkspaceContext`) is the chosen fix for "`ExportControls`' PNG button lives in a sibling slot to
  the map and cannot reach its context", which both the map and results tracks flagged as the
  integrator's job. An alternative (lifting the whole map controller out of `MapView` into
  `WorkspaceContext` instead) would have been a much larger change to an already-tested feature.
- The "select a cell" E2E step uses **"View as table"** and clicks a table row, not a pixel click on
  the MapLibre WebGL canvas. A canvas-coordinate click is inherently less reliable across machines
  and CI runners (it depends on tile load timing, exact projection and zoom), while the table row is
  a real DOM element reading the exact same selection state. This still exercises the real
  `ResultsPanel`/`WorkspaceContext` selection wiring, just not the `GridOverlay` click handler
  itself specifically (which has its own unit tests in `features/map`).
- An orphan `pnpm dev` left running on port 5173 from an earlier phase (PID 5748, matching the PID
  Gate A's own notes recorded) was stopped (`taskkill`) before running Playwright, rather than
  reused, because it predated the `VITE_ENABLE_DEV_TOKEN_LOGIN=true` env var this step needs for
  sign-in to work. Playwright's own `webServer` then started (and, per its config, stopped) a fresh
  one for every local run in this session; no server was left running by this step.

**Known issues / what's still open:**

- The individual `WorkspaceContext`/`SetupSlot`/`MapSlot`/`InspectorSlot` React components have no
  dedicated component tests of their own (only `layer-display.ts`'s pure functions do, 7 tests).
  They are exercised end to end by `happy-path.spec.ts` in a real browser, and everything they
  compose already has its own thorough test suite, but an isolated test of the composition layer
  itself (e.g. "changing the farm in the setup slot updates the map's `fieldBounds`" with the map
  feature mocked out) was not written, given the time this integration pass had. Flagged honestly
  rather than claimed as covered.
- The MapLibre "Worker failed to load" console error noted under Phase 4 above.
- The E2E happy path covers only the success path; 400/422/500/network/cancel are covered at the
  component level (by the analysis-setup and field tracks) but not in Playwright.
- The 10,000-cell hover-performance check (Phase 6's exit criterion) is still not done.
- `.env` is still empty (ADR-002): nothing in this step touched real credentials, called the real
  backend, or called real PropelAuth, per this task's own safety rules. The `E2E_LIVE=1` variant
  exists for whoever does have a backend and credentials to run it.

**Next:** Phase 7's remaining item (session history), Phase 8 in full (CI, Lighthouse, Docker, the
live-backend E2E once credentials exist), and the two open items above (composition-level tests,
the hover-performance check).
