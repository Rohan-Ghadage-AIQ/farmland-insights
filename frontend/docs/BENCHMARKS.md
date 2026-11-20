# Performance benchmarks

**Role:** this is an independent, read-only performance review. It does not fix anything in
`src/`. Everything below is either a command you can re-run yourself, or a specific `file:line`
this review read to reach a conclusion. Numbers came from one Windows machine, one run (or a
handful of runs where noted); treat single-sample timings as indicative, not a certified SLA.

Environment: Node v24.21.0, pnpm 12.4.2, Vite 8.3.5, Vitest 5.0.5, Playwright 1.64.1, Windows 11,
Chromium (Playwright-bundled). All commands below are run from `frontend/`.

## Summary

| # | Target (from the spec)                                     | Result                                                                             | Status |
| - | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| 1 | Initial JS gzip < ~250 kB, excluding the map chunk            | **230.60 kB gzip** (735.79 kB raw); map is a separate, lazily-loaded chunk          | PASS |
| 2 | Hover/selection at 10k cells must not recompute per-cell stats | Confirmed by code + measurement: cached lookup is sub-millisecond                   | PASS |
| 3 | Lighthouse desktop Performance ≥ 90 on `/login`               | **Could not run** (see "Lighthouse" below); alternative proxy recorded instead      | NOT VERIFIED |
| 4 | Time-to-interactive of the workspace                          | Measured, but dominated by test-harness/sandbox overhead — see caveats             | MEASURED, CAVEATED |
| 5 | No listener/layer leak across 10 re-runs                      | Code inspection: re-runs are idempotent by design. Measured: heap +0.61 MB / 9 runs | PASS (no leak found) |

Three findings below (flattenToCsv cost at scale, Lighthouse not run, TTI number's reliability)
are flagged with severity in their own sections.

---

## 1. Production bundle size and map code-splitting

Command:

```
npx vite build
```

Output (this run, after this review's fixes to `src/components/ui/Slider.tsx`,
`src/components/ui/DateCalendar.tsx`, `src/features/results/ResultsPanel.tsx`,
`src/features/results/TableView.tsx` and `src/features/analysis-setup/StaleBadge.tsx`;
`docs/PROGRESS.md`'s own Integrate run recorded 230.39 kB gzip and this review's own prior run
230.41 kB gzip, so a few hundred bytes of movement run-to-run and fix-to-fix is expected and
still far under budget):

```
dist/index.html                          0.56 kB │ gzip:   0.34 kB
dist/assets/index-mIkqY1Rv.css          28.24 kB │ gzip:   6.37 kB
dist/assets/MapView-qvkd0SPb.css        71.33 kB │ gzip:  10.25 kB
dist/assets/DrawControl-f-_nNlmo.js    151.15 kB │ gzip:  35.95 kB
dist/assets/index-DBWlWEG8.js          735.79 kB │ gzip: 230.60 kB
dist/assets/MapView-Bo_zsEQN.js      1,069.91 kB │ gzip: 291.19 kB
```

- **Initial bundle** (what `/login` and the shell load before the map mounts): `index-*.js`
  230.60 kB gzip + `index-*.css` 6.37 kB gzip. **Under the ~250 kB budget.**
- **Map chunk** (`MapView-*.js`/`.css`, `DrawControl-*.js`): 291.19 + 10.25 + 35.95 = **337.39 kB
  gzip**, excluded from the budget per the spec's own wording, and genuinely a separate chunk —
  confirmed below, not just inferred from file names.
- Confirmed the map chunk is **not** loaded on `/login`: a Playwright run against this exact build
  (`tests/perf/workspace-tti.perf.spec.ts`, "login page" test) recorded the resources loaded by
  that point as only `index-DJR40YTp.js` (228,502 B transfer) and `index-mWswl0t8.css` (6,636 B
  transfer) — no `MapView-*`/`DrawControl-*` entry. `MapView-*.css` only starts loading once the
  authenticated workspace mounts (see the TTI section).

No finding here: this target is met and the split is real, not just file-name convention.

---

## 2. Pure-function cost at 10,000 cells (the hover/selection/export hot paths)

Vitest 5.0.5 **removed** the built-in `bench()` / `vitest bench` benchmarking mode — confirmed by
running it:

```
$ npx vitest bench --config tests/perf/vitest.perf.config.ts --run
TypeError: bench is not a function
```

So `tests/perf/pure-functions.bench.ts` uses `performance.now()` timing inside ordinary `it()`
blocks instead (still the real, compiled functions, just without tinybench's statistics layer).

Command:

```
npx vitest run --config tests/perf/vitest.perf.config.ts --reporter=verbose
```

Fixture: `tests/fixtures/large-analysis.ts`'s `makeLargeAnalysisResponse({ count: 10_000 })`
(the project's own 10k-cell perf fixture). Results (n = 20 unless noted; mean / median):

| Function                                                        | Where                                           | Mean    | Median  |
| ----------------------------------------------------------------- | -------------------------------------------------- | ------- | ------- |
| `buildGridLayerData` (metric layer, full 10k pass)                 | `src/features/map/grid-source.ts:75`                | 1.83 ms | 1.50 ms |
| `buildGridLayerData` (cpi layer, full 10k pass)                    | `src/features/map/grid-source.ts:75`                | 2.20 ms | 2.26 ms |
| `getGridLayerData` (memoised — what hover/selection actually pays) | `src/features/map/grid-source.ts:110` (n = 2000)    | **0.000 ms** | 0.000 ms |
| `farmClusterStats` (farm summary panel)                            | `src/domain/cpi.ts:51`                              | 6.10 ms | 5.50 ms |
| `groupAdvisories` (advisory grouping)                              | `src/domain/advisories.ts:79`                       | 5.25 ms | 5.55 ms |
| `flattenToCsv` (CSV export)                                        | `src/domain/export.ts:32`                           | 72.36 ms| 71.10 ms|

**Hover does not recompute per-cell stats — confirmed, not assumed.** `getGridLayerData`
(`grid-source.ts:110`) is memoised in a `WeakMap<AnalysisResponse, Map<layerKey, GridLayerData>>`
keyed by response identity and layer; `GridOverlay`'s pointer-event effect
(`src/features/map/GridOverlay.tsx:155-179`) only calls `actions.setFeatureState(...)` and a
`model.data.byId.get(...)` lookup on hover/mousemove — it never calls `buildGridLayerData` itself.
The 0.000 ms figure above is that cache hit (a `WeakMap.get` + `Map.get`), measured 2000 times; the
1.83–2.20 ms figures are the **uncached** cost, paid once per (response, layer) pair (a new
analysis, or switching to a layer not viewed yet), not once per hover.

**Finding — `flattenToCsv` is the one real outlier, severity low.** At 10,000 cells it takes
~71 ms median, roughly 30× the next-heaviest function, because it builds one row (an array) and
one CSV-escaped string per cell plus a `Set`/sort pass per distinct metric/advisory key
(`src/domain/export.ts:32-58`). This runs synchronously on the main thread when the user clicks
"Export CSV" (`ExportControls`), so it is a one-off ~70 ms frame drop on click, not a per-hover or
per-render cost — not a user-facing problem today. It would become one if the cell count grows
materially past 10k (farms this large are presumably rare, but nothing in the domain layer caps
it): the cost is linear in cell count, so a 50k-cell farm would be roughly 350 ms of main-thread
block on export. Suggested fix, if this is ever observed in practice: chunk the row-building loop
with `requestIdleCallback`/a `setTimeout(0)` yield, or move it to a Web Worker; not done here per
this review's scope (independent review, no source changes).

---

## 3. Lighthouse on `/login`

**Not run.** `lighthouse` is not an installed dependency, and this review's rules say to list a
missing dependency under open issues rather than install one (`package.json`/`pnpm-lock.yaml` are
owned by another track). Attempting `npx lighthouse` was also independently blocked by this
session's own sandbox policy ("dangerous" auto-mode classification on installing and running an
un-vetted package via `npx --yes`).

**Alternative measured proxy used instead** (Navigation Timing API, via Playwright, against the
real production build): see `tests/perf/workspace-tti.perf.spec.ts`, "login page" test, run with:

```
VITE_ENABLE_DEV_TOKEN_LOGIN=true npx vite build --outDir dist-perf
npx playwright test --config tests/perf/playwright.perf.prod.config.ts workspace-tti
```

(`VITE_ENABLE_DEV_TOKEN_LOGIN=true` only changes whether the dev-token sign-in tab renders —
confirmed it does not materially change bundle size: 230.42 kB gzip vs. 230.41 kB gzip above.)

Result on `/login` (production build, served by `vite preview`, loopback, two runs):

| Metric            | Run 1     | Run 2     |
| -------------------- | --------- | --------- |
| `domInteractive`     | 21.6 ms   | 20.4 ms   |
| `domContentLoaded`   | 128.2 ms  | 139.4 ms  |
| `loadEventEnd`       | 129.6 ms  | 140.7 ms  |
| Transfer size (doc)  | 867 B     | 867 B     |

**First Contentful Paint / Largest Contentful Paint could not be captured**: both
`performance.getEntriesByType('paint')` and a buffered `PerformanceObserver` for
`largest-contentful-paint` returned empty in this automation environment (Claude's Browser pane
and headless Playwright alike). This looks like a property of the sandboxed/headless Chromium used
here (paint events may not fire without a truly visible compositor), not a real "zero paint time";
it is reported as a gap, not a result.

**Finding — target #3 is unverified, severity medium.** The numbers above are real, but they are
unthrottled-loopback navigation timings, not a Lighthouse score: Lighthouse's desktop Performance
score additionally weighs FCP/LCP/TBT/CLS under a simulated-throttled network and CPU profile,
none of which this proxy reproduces. The sub-150 ms figures here should **not** be read as "the
app will score ≥ 90 in Lighthouse" — only as "the `/login` document and its one JS/CSS chunk are
small and fast to parse locally," which is consistent with (but does not prove) a good score.
Whoever owns CI/tooling should add a real `lighthouse`/`@lhci/cli` devDependency and run it against
`vite preview` to actually verify this target.

---

## 4. Time-to-interactive of the workspace

Measured with Playwright against a dedicated dev server and against the production preview build
(both with the backend mocked at the network layer via `tests/e2e/fixtures/mock-api.ts`'s own
`mockHealth`/`mockAuth`/`mockAnalyze`/`signIn` helpers — no real backend or PropelAuth call, per
this review's safety rules and ADR-002: `.env` is empty).

Commands:

```
npx playwright test --config tests/perf/playwright.perf.config.ts workspace-tti        # dev server
npx playwright test --config tests/perf/playwright.perf.prod.config.ts workspace-tti   # prod preview
```

"Interactive" = from clicking the sign-in action to the point where `FieldStep`'s
"Load sample field" button (`src/features/field/FieldStep.tsx:39`) is visible and enabled.

| Run                                     | Sign-in click → interactive | Analyze click → results rendered |
| ------------------------------------------ | ------------------------------ | ----------------------------------- |
| Dev server, cold                            | 2342 ms                        | —                                    |
| Dev server, warm                            | 672 ms                         | 924 ms                               |
| Production preview, run 1                   | 2558 ms                        | 936 ms                               |
| Production preview, run 2                   | 2622 ms                        | 946 ms                               |

**Finding — the "interactive" number is noisy and its 2.3–2.6 s runs are not well explained by
asset loading, severity informational.** Resource-timing captured at the interactive point in the
production run showed the main `index-*.js`/`.css` already loaded at ~14 ms, and `MapView-*.css`
only *starting* to load at ~2568 ms into the same timeline — i.e. almost the entire 2.5 s elapsed
**before** the map chunk's own network request even began, not while downloading/parsing it. That
points at time spent in the sign-in interaction itself (tab click, typed email, button click, the
mocked `/auth/token` + `/auth/whoami` round trip, then the route change into the workspace) rather
than bundle weight. A plausible contributor, not confirmed: this environment's MapLibre worker
fails to load in dev mode (`"Worker failed to load. Check that the worker URL is correct."`, seen
on every dev-server run here, matching the exact issue `docs/PROGRESS.md`'s Phase 4 notes already
flagged as sandbox-specific and unconfirmed in a real deployment) — if MapLibre retries or stalls
on that failure before the page is considered settled, it could inflate this number independent of
real bundle/network cost. **Recommendation:** re-measure TTI in a real (non-headless, non-sandboxed)
browser before trusting this number, and investigate the worker-load error in that environment
first, since it may be invalidating this specific measurement rather than reflecting real user cost.
The **Analyze → results** leg (924–946 ms, against a deliberate 500 ms mocked `/analyze` delay) is
more trustworthy: ~400–450 ms of real render/layer-build work on top of the mocked network delay,
consistent with section 2's ~2 ms `buildGridLayerData` cost plus React render and MapLibre
paint — not surprising, not flagged.

A true authenticated-workspace TTI against the **real backend** was not attempted: `.env` is empty
(ADR-002) and this review's rules forbid calling real PropelAuth or the real API.

---

## 5. Memory growth across 10 analyze re-runs (listener/layer leak check)

### Code inspection first

Read before measuring, as the task asked:

- `src/features/map/map-actions.ts:162-183` (`installOverlay`): adds a source/image/layer only
  `if (map.getSource(id) === undefined)` / `getLayer(...) === undefined`, so calling it again after
  a re-analysis is a no-op for anything already installed — sources and layers are never
  duplicated.
- `src/features/map/GridOverlay.tsx:90-114` (effect 1, "install layers and push data"): on a new
  `AnalysisResponse`, it calls `actions.setData(GRID_SOURCE_ID, ...)` to replace the GeoJSON
  source's data in place; it does not remove/re-add the source or layer.
- `src/features/map/GridOverlay.tsx:155-179` (the pointer-event effect): depends only on
  `[actions]`, which is stable for the lifetime of one `MapView` mount (`map-controller.ts:35-92`
  creates it once per `attach()`). So `onLayerEvent` (`map-actions.ts:187-195`) is subscribed
  **once**, not once per analysis — re-running analyze 10 times does not add 10 sets of
  mousemove/mouseleave/click listeners.
- `src/features/map/layer-model.ts:68-88` / `grid-source.ts:103-123`: both caches are `WeakMap`s
  keyed by the `AnalysisResponse` object itself, so a superseded response's cached data becomes
  garbage as soon as nothing else references that response — no manual cache eviction needed, and
  none of the ten responses in the test below are kept reachable after the eleventh.

Conclusion from reading the code alone: **re-running analysis is designed to not leak** listeners
or duplicate map layers/sources. The only plausible per-run growth is ordinary React Query cache
entries, closures per render, and whatever MapLibre itself retains per `setData` call.

### Measurement

`tests/perf/memory-growth.perf.spec.ts`: signs in (mocked), loads the sample field, sets up a valid
Wheat/last-30-days/50 m run, then clicks Analyze 10 times in a row (the mocked `/analyze` always
returns the same 3-cell fixture; `AnalyzeButton` stays enabled after a success —
`src/features/analysis-setup/AnalyzeButton.tsx:29`). After each run it forces a GC via the Chrome
DevTools Protocol (`HeapProfiler.collectGarbage`, no `--expose-gc` flag needed) and reads
`Performance.getMetrics()`'s `JSHeapUsedSize`.

Command:

```
npx playwright test --config tests/perf/playwright.perf.prod.config.ts memory-growth
```

Result (JS heap, MB, after GC — baseline before run 1, then after each of 10 runs):

```
[10.21, 10.58, 11.13, 11.21, 10.90, 10.99, 11.01, 11.05, 11.10, 11.16, 11.19]
```

Growth from right after run 1 (10.58 MB) to right after run 10 (11.19 MB): **+0.61 MB over 9
re-runs** (~0.07 MB/run), and the series flattens out (runs 5–10 are within 0.2 MB of each other)
rather than climbing linearly — the shape of a small fixed per-run allocation (React Query cache
entries, closures, MapLibre internal bookkeeping) reaching a plateau, not an unbounded leak.

**Caveats, stated honestly:** this is one run, on a tiny 3-cell mocked response (not the 10k-cell
fixture — the real app workflow re-runs the *same kind* of operation regardless of cell count, and
the leak risk is about repeated mount/install cycles, not per-cell cost, so this is a reasonable
proxy, but a 10k-cell response was not substituted into this specific test for time reasons).
`Performance.getMetrics()`'s `JSHeapUsedSize` is the V8 JS heap only — it does **not** see
MapLibre's WebGL/GPU-side memory (textures, buffers), so a leak confined to GPU memory would be
invisible to this number; this review did not have a way to inspect GPU memory in this environment.

**No finding**: both the code reading and the measurement point the same way — no listener or
layer leak across repeated analysis runs.

---

## Files added by this review

- `frontend/tests/perf/vitest.perf.config.ts`, `pure-functions.bench.ts` — section 2.
- `frontend/tests/perf/playwright.perf.config.ts` (dev server, port 5190),
  `playwright.perf.prod.config.ts` (production preview, port 5191) — kept separate from the root
  `playwright.config.ts`/`vitest.config.ts` so this review does not touch files it does not own,
  and pointed at their own ports so they never contend with the shared dev server on 5173 that
  `docs/PROGRESS.md` already flags as an orphan process other agents may be relying on.
- `frontend/tests/perf/workspace-tti.perf.spec.ts` — sections 3 and 4.
- `frontend/tests/perf/memory-growth.perf.spec.ts` — section 5.
- This file.

No file outside `frontend/tests/perf/`, `frontend/scripts/bench/` (unused — everything fit as
Vitest/Playwright specs) and `frontend/docs/BENCHMARKS.md` was modified. A temporary
`VITE_ENABLE_DEV_TOKEN_LOGIN=true` build was made to `frontend/dist-perf/` to measure sections 3–5
against production output and was deleted after use; it is not part of this review's deliverables.
