# Build Prompt — Farmland Insights Web App (Frontend)

> Paste everything below the line into a coding agent (Claude Code or similar), run from the root of this repository.
> The agent builds the frontend in `frontend/`, one phase at a time, and reports its progress in `frontend/docs/PROGRESS.md`.

---

## 0. Role and mission

You are a senior frontend engineer and product designer. Build a **minimal, interactive, desktop-first web app** for the **Farmland Insights API**, the FastAPI backend in this repository (`app/`).

What the app does, in one sentence: **a user outlines a farm on a map, picks a crop and a date range, runs the analysis, and sees a grid of cells showing crop health (CPI scores), raw metrics and recommended actions.**

Keep it focused on that. Every screen and control must serve that flow. Leave out anything that doesn't.

### Ground rules

1. **The backend code is the source of truth.** The contract in §2 was taken from the code, but you must re-verify it in Phase 0 by reading `app/models/*.py`, `app/api/endpoints/*.py`, `app/main.py`, `app/auth.py` and the live `/openapi.json`. If the code and this prompt disagree, follow the code and record the difference in `docs/DECISIONS.md`.
2. **Do not modify the backend** (`app/`, `tests/`, `pyproject.toml`, `Dockerfile`, `docker-compose.yml`). If the frontend needs a backend change, write it up in `docs/BACKEND_REQUESTS.md` with the reason and a proposed diff, and work around it.
3. **Work in phases (§6).** Finish each phase before starting the next. At the end of every phase, pass every quality gate (§5.6), update `docs/PROGRESS.md`, and give a short summary of what was done, what was verified and what comes next.
4. **Don't make up data or meaning.** If the API doesn't provide something (for example, a severity level for an advisory), don't show it as if it did. Derive it only when the rule is clear, and label it as derived.
5. **Report honestly.** If a test fails or a step is skipped, say so in `PROGRESS.md` and in your phase summary.

---

## 1. Tech stack (required)

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (`strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`) | No `any`. Use `unknown` and narrow it at boundaries. |
| Build | **Vite** + **React 18+** | SPA. Use the current stable versions, pinned by the lockfile. |
| Package manager | **pnpm** | Commit `pnpm-lock.yaml`. Set `packageManager` in `package.json`. |
| Routing | **React Router** (data router) | Routes: `/login`, `/` (workspace). Keep the route list this small. |
| Server state | **TanStack Query** | Use mutations for `/analyze` and auth. No hand-rolled fetch state. |
| Client state | React state/context; **Zustand** only if prop drilling becomes painful | Keep global state minimal. |
| Runtime validation | **Zod** | Parse every API response at the boundary. |
| API types | **openapi-typescript**, generated from the backend's `/openapi.json` | Commit the generated file and add a `pnpm gen:api` script. |
| Map | **MapLibre GL JS** + **Terra Draw** (polygon drawing/editing) | Use WebGL layers for the grid, never one DOM node per cell. |
| Geo utilities | **@turf/turf** (only the modules you need) | Area, bbox, cell-count estimate, validity checks. |
| Styling | **Tailwind CSS** with design tokens as CSS variables | Build components on **Radix UI** primitives for accessibility. |
| Charts | Small inline SVG components, or **visx** if really needed | No heavy chart library for bar and bullet charts. |
| Forms | **React Hook Form** + Zod resolver | |
| Testing | **Vitest** + **Testing Library**; **MSW** for API mocks; **Playwright** for E2E | |
| Quality | **ESLint** (typescript-eslint `strict-type-checked` + `stylistic-type-checked`, react-hooks, jsx-a11y), **Prettier**, **Husky** + **lint-staged** | |

---

## 2. Backend contract (check it in Phase 0)

Base URL in development: `http://127.0.0.1:8000`. Start the backend with `uv run uvicorn app.main:app --reload`. It needs `.env` with `PROPELAUTH_AUTH_URL`, `PROPELAUTH_API_KEY`, and Earth Engine credentials or project settings.

### 2.1 CORS: the backend has none

The backend has **no CORS middleware**, so the browser can't call it from another origin.
- **Dev:** use a Vite `server.proxy` to forward `/api` and `/health` to `VITE_API_PROXY_TARGET` (default `http://127.0.0.1:8000`). The app always calls relative URLs (`/api/v1/...`).
- **Prod:** document a same-origin reverse proxy (an nginx example in `docs/DEPLOYMENT.md`), and file a CORS request in `docs/BACKEND_REQUESTS.md`.

### 2.2 Endpoints

| Method | Path | Auth | Request | Success response |
|---|---|---|---|---|
| GET | `/health` | none | — | `{ "status": "ok" }` |
| POST | `/api/v1/auth/register` | none | `{ email, password (min 1), duration_in_minutes (int > 0) }` | `AuthTokenResponse` |
| POST | `/api/v1/auth/token` | none | `{ email, duration_in_minutes (int > 0) }` | `AuthTokenResponse` |
| GET | `/api/v1/auth/whoami` | Bearer | — | `{ user_id, email \| null, active_org_id \| null }` |
| POST | `/api/v1/analyze` | Bearer | `FarmAnalysisRequest` | `FarmAnalysisResponse` (GeoJSON FeatureCollection) |

`AuthTokenResponse = { user_id: string, email: string, access_token: string, token_type: "bearer", expires_in_minutes: number }`

> ⚠️ **Security note to document (not something to build on):** `/auth/token` issues a token for an email address **without a password**. Treat it as a dev/testing convenience. In the UI, label it "Get token" (dev mode only, behind `VITE_ENABLE_DEV_TOKEN_LOGIN`), not as a real sign-in. Record the issue in `docs/BACKEND_REQUESTS.md` as high priority.

### 2.3 `FarmAnalysisRequest` (all models use `extra="forbid"`; unknown keys cause a 422)

```jsonc
{
  "farm_geojson": {
    "type": "FeatureCollection",
    "features": [            // at least 1
      {
        "type": "Feature",
        "id": "farm-1",      // string | int | null, optional
        "geometry": { "type": "Polygon" | "MultiPolygon", "coordinates": [...] },
        "properties": {}     // any object
      }
    ]
  },
  "start_date": "YYYY-MM-DD",
  "end_date":   "YYYY-MM-DD",   // start <= end, and end <= today + 16 days (forecast horizon)
  "crop_category": "cereals_c3_temperate", // category key, OR an English/desi crop name ("Wheat", "Gehu")
  "grid_size": 50               // JSON integer > 0 (strict: "50" as a string is rejected), metres, default 50
}
```

Geometry rules (check these on the client before sending):
- Only `Polygon` and `MultiPolygon` are allowed. No Point, LineString or GeometryCollection.
- Every linear ring needs **4 or more positions** and must be **closed** (first position equals last).
- **Strip any extra keys** from uploaded GeoJSON (`bbox`, `crs`, `name`, foreign members), because they would be rejected. Keep only `type`, `features[].{type,id,geometry,properties}`.
- Coordinates are `[lng, lat]` (optionally with altitude).

**Crop categories (12):** `cereals_c3_temperate`, `cereals_c4_tropical`, `fruits_orchard`, `fruits_tropical`, `legumes_cool_season`, `legumes_warm_season`, `oilseeds_cool`, `oilseeds_warm`, `tubers_temperate`, `tubers_tropical`, `vegetables_cool`, `vegetables_warm`.

**Supported crops (~80, each with an English name, desi/Hindi name and category)** are defined in `SUPPORTED_CROPS` in `app/models/requests.py`. No API endpoint returns them, so **mirror them in `src/domain/crops.ts`** as a typed `as const` array. Add a unit test that parses the Python file and fails if the lists drift apart.

### 2.4 `FarmAnalysisResponse`

```jsonc
{
  "type": "FeatureCollection",
  "features": [   // at least 1, one per grid cell
    {
      "type": "Feature",
      "id": 1,
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "grid_id": 1,                        // string | int
        "raw_metrics": { "ndvi": 0.64, "t2m": 24.8, ... },   // keys vary per run; any key may be missing
        "cpi_scores": { "Structural": 0.71, "Chlorophyll": 0.64, "Water_Drought": 0.58, "Environmental": 0.69, "Agro_Meteo": 0.61 }, // each 0..1
        "advisories": { "ndvi": "Routine scout for pests", ... } // metric -> action text
      }
    }
  ]
}
```

Rules for interpreting the data:
- The backend **fills missing CPI scores with `0.0`**. Data sources can also fail silently: Earth Engine and climatology failures are logged and skipped. So a cluster where **every cell is 0.0, or the cell has no `raw_metrics` from that cluster**, should be shown as **"No data"**, not as "0 — critical". Write this rule as one pure, unit-tested function.
- Advisories contain **only the text**. The Low/Moderate/High condition isn't returned, so don't color-code advisories by severity. Group them by cluster instead (see §3.4).
- `raw_metrics` can be empty for a cell. Handle that.

### 2.5 Metric metadata (encode in `src/domain/metrics.ts`)

Clusters (from `app/utils/analytics_constants.py`):

| Cluster (API key) | Display label | Metrics |
|---|---|---|
| `Structural` | Canopy structure | ndvi, evi, savi, rvi, dprvi, dpsvi, csi |
| `Chlorophyll` | Chlorophyll | gndvi, ndre |
| `Water_Drought` | Water & drought | ndmi, swdi, cmi, ai_dm, vci, tci, vhi, nddi, spi, spei, rfdi |
| `Environmental` | Environment | t2m, lst, rh, soil_moist, soil_temp |
| `Agro_Meteo` | Agro-meteorology | crti, gdd, rwi, payout, precip, et_actual |

Get each metric's full name from `legacy/farmland_insights_documentation.md` ("Parameter Reference"). Known units: `t2m` °C, `lst` °C, `soil_temp` °C, `rh` %, `precip` mm, `et_actual` mm, `soil_moist` m³/m³, `gdd` °C·day. Indices have no unit. **Check the units in `app/services/weather_service.py` and `gee_service.py`.** If you can't confirm a unit, show none rather than guess.

### 2.6 Error shapes (handle every one)

| Status | Source | Shape | UX |
|---|---|---|---|
| 400 | `DomainError` | `{ error: "bad_request", detail: string, details: object \| null }` | Inline banner showing `detail`. Put `details` in an expandable "Technical details" section. |
| 400 | auth errors | `{ detail: string \| object }` | Inline form error. |
| 401 / 403 | PropelAuth | `{ detail }` | Clear the session and redirect to `/login?next=…` with the message "Your session expired." |
| 404 | `/auth/token` | `{ detail: "User not found." }` | Field error on email. |
| 422 | FastAPI validation | `{ detail: [{ loc: string[], msg: string, type: string }] }` | Map `loc` to form fields where possible, otherwise show a list. |
| 429 | rate limit | `{ detail }` | "Too many requests — try again in a moment." |
| 500 | unhandled | `{ error: "internal_server_error", detail }` | Friendly message, a Retry button, and a copyable request summary. |
| network / abort | — | — | "Can't reach the server." / "Analysis cancelled." |

Write **one** `ApiError` class (a discriminated union by `kind`) and **one** `parseApiError(response)` function. Components never read raw response bodies.

---

## 3. Product and UX specification

### 3.1 Users and the main job
Agronomists, farm managers and analysts working on a desktop or laptop (1280–1920 px wide). Their job: *"For this field and period, where is the crop struggling, why, and what should I do?"* The time from opening the app to seeing results should be under a minute.

### 3.2 Layout (desktop-first, minimum width 1280 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◧ Farmland Insights                      [API ● healthy]   user@x.com  ⏻   │  56px top bar
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ SETUP / RUN   │                                              │ INSPECTOR     │
│ (360px)       │                 MAP (fluid)                  │ (380px,       │
│               │                                              │ collapsible)  │
│ 1 Field    ✓  │   farm outline + grid choropleth             │ Farm summary  │
│ 2 Crop     ✓  │                                              │  or           │
│ 3 Period   ✓  │   ┌ Layer: [CPI ▾ Water & drought ▾] ┐       │ Selected cell │
│ 4 Grid        │   └ Legend ───────────────────────────┘       │ details       │
│               │                                              │               │
│ [ Analyze ▶ ] │                               [＋][－][⌖]    │               │
└───────────────┴──────────────────────────────────────────────┴───────────────┘
```

- Below 1280 px, show a polite notice ("Best on a desktop screen") but keep the app usable: the inspector turns into an overlay drawer.
- The map always stays visible. Panels never cover the drawn field.

### 3.3 Flow: setup panel (left), progressive disclosure
A single vertical stepper. Each step shows a one-line summary once it's complete and can be expanded again to edit. **There is exactly one primary button: "Analyze".**

1. **Field.** Three ways to give the farm boundary, in this order: **Draw on map** (default; Terra Draw polygon mode, with vertex editing and undo/redo), **Upload GeoJSON** (drag-and-drop or file picker, `.geojson`/`.json`), **Paste GeoJSON** (a text area that validates as you type). Then:
   - Validate with the rules in §2.3. Show errors in plain language ("The boundary isn't closed — the last point must match the first").
   - Show the **area** (ha and acres) and the vertex count. Zoom the map to the field.
   - Offer "Load sample field", which uses the sample from `app/utils/payloads.py`.
2. **Crop.** A searchable combobox over all supported crops. Match English and desi names, case-insensitive, ignoring accents. Each option shows `Wheat · Gehu` with the category as secondary text ("Cereals — C3 temperate"). Recent picks appear first. Send the **category key** to the API.
3. **Period.** A date-range picker with presets: *Last 7 days*, *Last 30 days*, *Next 16 days (forecast)*, *Season to date*. Disable dates after today + 16 and say why in a tooltip. Show the length in days.
4. **Grid size.** A slider plus a numeric input (whole metres; presets 10 / 20 / 50 / 100; default 50). Show a **live cell-count estimate** (field area ÷ grid_size², computed with turf), for example "≈ 240 cells". Warn above 2,000 cells ("This may take several minutes") and ask for confirmation above 10,000.

**Analyze button:** disabled until the form is valid. A tooltip lists what's missing.

### 3.4 Running and results
- **Running:** analyses can take tens of seconds (Earth Engine plus weather data), so:
  - Show a non-blocking progress state over the map: an indeterminate bar, elapsed time, and the honest message "Fetching satellite & weather data…". **Don't show a fake percentage.**
  - Provide a **Cancel** button (`AbortController`).
  - The setup panel locks while running.
- **Results on the map:** a grid choropleth on a MapLibre `fill` layer, a cell outline on a `line` layer, and hover and selection highlights through `feature-state`.
  - **Layer switcher:** *CPI* (pick a cluster) or *Raw metric* (pick a metric, grouped by cluster).
  - **Legend:** a continuous scale with min/max labels and units. CPI uses a fixed 0–1 domain. Raw metrics use the observed domain, with outliers clipped to the 2nd–98th percentile and a note saying so.
  - Show "No data" cells with a neutral hatch pattern, and include them in the legend.
  - **Hover tooltip:** grid id, the current layer's value, and the cluster score.
  - **Click** a cell to open it in the inspector.
- **Inspector (right panel):**
  - **Farm summary** (default, no cell selected):
    - Five CPI cluster scores as horizontal bars, showing the mean across cells, with a min–max whisker.
    - "Cells needing attention": the count of cells where any cluster is below 0.4. Label this threshold as an app heuristic and make it a constant.
    - **Top recommended actions:** the advisory texts grouped and de-duplicated across cells, each with "applies to N of M cells". Click one to highlight those cells on the map.
  - **Cell detail:**
    - The five CPI bars, with the farm mean as a reference tick.
    - Raw metrics grouped by cluster, each showing full name, value and unit. Abbreviations get a tooltip.
    - Advisories grouped by cluster.
    - Previous/next cell buttons, keyboard `[` and `]`.
- **Export:** download the response as `.geojson`, a flattened `.csv` (one row per cell; columns grid_id, the CPI scores, the metrics, the advisories), and a PNG of the map (`map.getCanvas().toDataURL()` with `preserveDrawingBuffer`).
- **Re-run:** changing any input marks the results as **stale** with a subtle badge ("Inputs changed — re-run to update"). Never silently mix old results with new inputs.
- **Session history (Phase 7, optional):** keep the last 10 runs (inputs, response and timestamp) in IndexedDB so they can be reopened. Store them locally only and offer a "Clear history" action.

### 3.5 Authentication screens
- `/login` is one centered card with two tabs: **Sign in** and **Create account**.
  - "Create account" calls `/auth/register` with email and password.
  - "Sign in" is the dev token flow (§2.2 warning), shown only when `VITE_ENABLE_DEV_TOKEN_LOGIN=true`. Otherwise show a note that production sign-in is pending backend support.
  - Token lifetime: a hidden default of 480 minutes, configurable through `VITE_TOKEN_TTL_MINUTES`.
- **Token handling:**
  - Store it in `sessionStorage`, never `localStorage`, together with the computed `expiresAt`.
  - Attach `Authorization: Bearer` in the API client.
  - Check `/auth/whoami` on app load.
  - Show a "session expires in 5 min" toast with a "Stay signed in" button that re-issues a token.
  - Sign out on 401.
- Never log tokens or passwords. Never put them in URLs.

### 3.6 Design principles (non-negotiable)
- **Minimal, quiet interface.** Chrome is neutral; color is reserved for data and the single primary action. No decorative gradients, illustrations or shadows beyond one elevation level.
- **Visual hierarchy.** A clear sense of what to look at first, second and third on every screen. The map and its data come first.
- **Design tokens** (CSS variables, mapped into Tailwind):
  - **Spacing:** a 4 px base scale (4/8/12/16/24/32/48).
  - **Radius:** 6 px for controls, 10 px for panels.
  - **Type:** Inter, or the system UI stack, at 12/13/14/16/20/24. Use `font-variant-numeric: tabular-nums` for all numbers.
  - **Colors:** neutral grays, one accent color, and semantic success/warning/danger colors used only for system status.
- **Data color:**
  - CPI scores use a perceptually uniform, **colorblind-safe** sequential scale (viridis/cividis family, or one hue going light to dark). **Don't use red-to-green.**
  - Raw metrics use sequential scales. Use a diverging scale only where a meaningful midpoint exists, and document it.
  - Check every scale against deuteranopia and protanopia simulation, and record the result in `docs/DESIGN.md`.
- **Light theme first,** with a dark theme through tokens and `prefers-color-scheme` plus a manual toggle. The basemap switches with the theme.
- **Basemap:**
  - Default to an OSM-based raster/vector style with correct attribution.
  - Add an optional **satellite** style, enabled when `VITE_MAP_STYLE_SATELLITE_URL` (and a key, if needed) is set.
  - A basemap toggle sits in the map's corner.
- **Accessibility (WCAG 2.2 AA):**
  - Text contrast of at least 4.5:1, and at least 3:1 for UI and data marks.
  - Every action can be done from the keyboard, with a visible focus ring.
  - Proper landmarks and labels.
  - Use `aria-live` for analysis status and errors.
  - Respect `prefers-reduced-motion`.
  - Make the map grid keyboard-navigable (arrow keys move the selected cell), and add a **"View as table"** alternative listing the cells.
- **Microcopy:**
  - Plain, specific and action-oriented, in sentence case.
  - Errors say what happened and what to do next.
  - Show units everywhere. Format numbers with `Intl.NumberFormat` (2 decimals for indices, 1 for physical units).
- **Feedback:**
  - Every action responds within 100 ms (pressed state, spinner or optimistic UI).
  - Skeletons for loading panels.
  - Toasts only for background or async events, never for validation.
- **Keyboard shortcuts:** `D` draw, `Esc` cancel drawing or deselect, `⌘/Ctrl+Enter` analyze, `[` and `]` previous/next cell, `L` cycle layers, `?` shortcut sheet.
- **Empty, loading, error and stale states** are designed for every panel. None of them is just a blank area.

---

## 4. Architecture and code organization

```
frontend/
├─ README.md
├─ docs/
│  ├─ PROGRESS.md          # phase checklist: Done / In progress / Next / Blocked (kept up to date)
│  ├─ ARCHITECTURE.md      # layers, data flow diagram, state ownership
│  ├─ API_CONTRACT.md      # verified contract + error mapping (from Phase 0)
│  ├─ DESIGN.md            # tokens, color scales, components, a11y checks
│  ├─ DECISIONS.md         # ADR-style log: context → decision → consequences
│  ├─ BACKEND_REQUESTS.md  # CORS, password login, crops endpoint, severity in advisories, etc.
│  ├─ DEPLOYMENT.md        # build, env vars, reverse proxy example, Docker
│  └─ CONTRIBUTING.md      # scripts, conventions, commit style, how to add a metric/crop
├─ src/
│  ├─ app/                 # providers, router, layout shell, error boundary
│  ├─ api/                 # http client, ApiError, endpoints, zod schemas, generated/openapi.d.ts
│  ├─ domain/              # pure TS: crops, metrics, clusters, geo validation, cpi stats, csv export
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ field/            # draw / upload / paste + validation UI
│  │  ├─ analysis-setup/   # crop, period, grid steps
│  │  ├─ map/              # MapLibre wrapper, layers, legend, tooltip
│  │  └─ results/          # inspector, summary, advisories, export, table view
│  ├─ components/ui/       # design-system primitives (Button, Field, Combobox, Slider, Tabs, Tooltip…)
│  ├─ hooks/
│  ├─ lib/                 # format, storage (safe wrappers), env (zod-validated import.meta.env)
│  └─ styles/              # tokens.css, globals
├─ tests/e2e/              # Playwright
└─ .env.example
```

**Conventions:**
- **Layering:** the `domain/` layer is pure and framework-free, and holds most of the logic and unit tests. Feature folders don't import from each other except through their `index.ts`.
- **Naming and exports:** named exports only. Components use PascalCase file names; everything else uses kebab-case.
- **Size limits:** keep components small (about 150 lines). Move logic into hooks or `domain/`.
- **API layer:** an `api/client.ts` wrapper around `fetch` handles the base URL, auth header, timeout and abort, JSON parsing, Zod validation and `ApiError` mapping. TanStack Query hooks sit on top (`useAnalyzeMutation`, `useWhoAmI`).
- **Environment:** read env vars only through `lib/env.ts`, which validates them with Zod at startup and fails loudly with a clear message.
- **Map integration:**
  - Wrap MapLibre in one `MapView` component that owns the map instance. Expose imperative actions through a typed context.
  - Update the grid with `setData` and `setFeatureState`, never by re-creating layers.
  - Memoize derived data, and don't recompute per-cell stats on hover.
- **Performance:**
  - Target 10k cells with smooth hover.
  - Code-split the map bundle and keep the initial JS under about 250 kB gzipped (excluding the map chunk).
  - Run Lighthouse with a performance score of at least 90 on desktop for `/login`.
- **Error boundaries:** one at the app level and one per feature panel.
- **Comments and docs:** comments explain *why*, not *what*. Add TSDoc on exported domain functions.

---

## 5. Engineering standards

### 5.1 TypeScript
- Use `strict` plus the flags in §1. No `any`, no `as` casts except at proven boundaries (and each one gets a comment), and no non-null `!` assertions.
- Model states with discriminated unions, for example `type AnalysisState = { status: 'idle' } | { status: 'running'; startedAt: number } | { status: 'success'; data: FarmAnalysis; inputsHash: string } | { status: 'error'; error: ApiError }`.
- Use branded types where mixing values is a real risk (`GridId`, `CropCategoryKey`, `IsoDate`).
- Generated OpenAPI types are the contract. Add a compile-time test that the Zod-inferred types are assignable to them, so drift breaks the build.

### 5.2 Testing
- **Unit tests (Vitest)** for all of `domain/`: geo validation, GeoJSON sanitization, cell-count estimate, the CPI "No data" rule, advisory grouping, CSV export, date-range rules (including today + 16), crop search (English and desi), and the crop-list drift check.
- **Component tests (Testing Library + MSW):**
  - The login flows.
  - Each setup step's validation.
  - Analyze success, every error shape in §2.6, and cancel.
  - Inspector rendering, including empty `raw_metrics`.
- **E2E (Playwright, with MSW or a recorded fixture):** sign in → load sample field → pick "Wheat" → last 30 days → analyze → select a cell → export CSV. Add one run against the real backend, behind `E2E_LIVE=1`.
- **Coverage:** at least 90% on `domain/` and at least 70% overall. Test behavior, not implementation details.
- **Accessibility:** automated checks with `@axe-core/playwright` on login, the empty workspace and the results state, with zero serious or critical violations.

### 5.3 Git and commits
- Use Conventional Commits, one commit per logical change (`feat(map): grid choropleth with feature-state hover`).
- Never commit `.env` files, tokens or service-account JSON.

### 5.4 Scripts (`package.json`)
- `dev` / `build` / `preview` for the Vite app.
- `typecheck` runs `tsc --noEmit`.
- `lint`, `lint:fix` and `format` run ESLint and Prettier.
- `test`, `test:watch` and `test:coverage` run Vitest; `e2e` runs Playwright.
- `gen:api` regenerates the OpenAPI types.
- `check` runs typecheck, lint, test and build together.

### 5.5 Configuration (`.env.example`)
```
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
VITE_ENABLE_DEV_TOKEN_LOGIN=true
VITE_TOKEN_TTL_MINUTES=480
VITE_MAP_STYLE_URL=            # optional custom vector style
VITE_MAP_STYLE_SATELLITE_URL=  # optional satellite style/tiles
VITE_MAP_API_KEY=              # optional, if the style requires it
```

### 5.6 Quality gates (must pass at the end of every phase)
`pnpm check` is green, there are no TypeScript or ESLint warnings, there are no `console.*` calls left in `src/` (use a small `logger` that's a no-op in production), `PROGRESS.md` is updated, and the README is accurate for what exists so far.

---

## 6. Implementation phases

Each phase lists its **deliverables** and its **exit criteria**. Don't start a phase until the previous one meets its exit criteria. At every phase boundary, update `docs/PROGRESS.md` using this template:

```md
## Phase N — <name>  (status: ✅ done | 🟡 in progress | ⛔ blocked)
**Done:** bullet list of what was built (with file paths)
**Verified:** commands run + results (tests passed/failed counts, build size)
**Deviations / decisions:** link to DECISIONS.md entries
**Known issues:** …
**Next:** the concrete first tasks of the next phase
```

### Phase 0: Discovery and contract
- Read the backend files listed in §0.1. Run the backend if `.env` exists. If it doesn't, work from the code and record that.
- Fetch `/openapi.json` (or save it from the code) to `frontend/openapi.json`. Write `docs/API_CONTRACT.md` and flag every difference from §2.
- Write `docs/BACKEND_REQUESTS.md`. It should include at least:
  - CORS
  - password-less `/auth/token`
  - a `GET /api/v1/crops` endpoint
  - returning the advisory condition (Low/Moderate/High) and metric units
  - a way to tell "no data" apart from a 0.0 CPI
  - returning which data sources succeeded
- **Exit:** the contract doc exists and the list of open questions is in `PROGRESS.md`. No app code yet.

### Phase 1: Scaffold and tooling
- Set up Vite + React + TS in `frontend/`, along with the strict tsconfig, ESLint, Prettier, Husky, Vitest, Playwright, Tailwind, the env validation in `lib/env.ts`, the Vite proxy, `pnpm gen:api` and generated types, and the README skeleton.
- **Exit:** `pnpm check` is green, `pnpm dev` serves a placeholder, and the proxied `/health` call works (or is documented as pending a running backend).

### Phase 2: Design system and app shell
- Build the tokens (light and dark), the UI primitives (Button, IconButton, TextField, NumberField, Combobox, DateRangePicker, Slider, Tabs, Tooltip, Toast, Dialog, Drawer, Badge, Skeleton, EmptyState, ErrorBanner), the three-panel layout, the top bar with API health status, the error boundaries, and the theme toggle.
- **Exit:** a `/dev/ui` route (dev builds only) shows every primitive in every state, and the axe check is clean.

### Phase 3: API client and authentication
- Build `api/client.ts`, `ApiError`, the Zod schemas, the auth endpoints and hooks, session storage with an expiry timer, a route guard, the login page (both tabs), sign-out, and 401 handling.
- **Exit:** component tests pass for every auth path and every error shape in §2.6. A manual check against the real backend is recorded (or explicitly marked pending).

### Phase 4: Field input and map
- Build the MapLibre `MapView`, the basemap toggle, Terra Draw polygon draw/edit with undo/redo, GeoJSON upload/paste with sanitization and validation, the sample field, area and vertex stats, and fit-to-bounds.
- **Exit:** domain tests for geo validation and sanitization pass. Drawing, uploading and pasting all produce the same normalized `FarmFeatureCollection`.

### Phase 5: Analysis setup and run
- Build the crop combobox (English and desi search, recents), the date range with presets and the +16-day rule, the grid size with live cell estimate and warnings, the form state with React Hook Form + Zod, the Analyze button with "what's missing" tooltip, and the mutation with cancel, elapsed-time progress and error rendering.
- **Exit:** an MSW-mocked analyze run works end to end in component tests, including 400, 422, 500, network failure and cancel.

### Phase 6: Results visualization
- Build:
  - the grid choropleth, layer switcher and legend
  - hover tooltip and selection
  - the inspector: farm summary, CPI bars with whiskers, grouped advisories with "applies to N of M" and highlight on map, and cell detail with metrics by cluster and units
  - keyboard navigation and the table view
  - "No data" handling and stale-results detection
- **Exit:** a performance check shows smooth hover with a 10k-cell fixture. The color scales are checked for color blindness and documented. The E2E happy path passes.

### Phase 7: Export, history and polish
- Build CSV, GeoJSON and PNG export, the shortcut sheet (`?`), session history (IndexedDB), the session-expiry toast, microcopy review, empty states, and a reduced-motion pass.
- **Exit:** all of §3.6 is reviewed against a checklist in `docs/DESIGN.md`, with any gaps listed.

### Phase 8: Hardening and documentation
- Raise test coverage to the targets, run the E2E axe checks, optionally run the live-backend E2E, add a Lighthouse report, a bundle-size budget in CI, and a production Dockerfile (nginx serving `dist/` and proxying `/api` to the backend). Optionally add a `docker-compose.frontend.yml` that doesn't change the backend's compose file.
- Finish the README with:
  - what it is
  - a screenshot
  - quick start (backend plus frontend)
  - env vars
  - scripts
  - architecture overview
  - testing
  - deployment
  - known limitations (linked to `BACKEND_REQUESTS.md`)
  - a roadmap
- **Exit:** a fresh clone gets to a working app by following only the README. `PROGRESS.md` shows every phase as ✅, or lists exactly what's left and why.

---

## 7. Definition of done
- [ ] The full flow works: sign in → field → crop → period → grid → analyze → explore → export.
- [ ] Every API error shape gives a clear, actionable message. No raw JSON or stack traces reach the user (except under "Technical details").
- [ ] TypeScript strict, zero lint warnings, all tests green, coverage targets met.
- [ ] WCAG 2.2 AA checks pass, the app is keyboard-complete, and the color scales are colorblind-safe.
- [ ] The README and every file in `docs/` are accurate, and `PROGRESS.md` reflects reality.
- [ ] No backend files changed. Every backend need is documented in `BACKEND_REQUESTS.md`.

**Start with Phase 0 now.** When it's done, post the phase summary and continue to Phase 1, unless an open question in `PROGRESS.md` blocks progress. If one does, stop and ask.
