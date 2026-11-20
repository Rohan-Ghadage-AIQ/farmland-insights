# Backend requests

The frontend does **not** modify the backend. This is the list of backend changes the frontend needs or recommends,
ordered by priority. Each item gives the reason and a proposed change. Evidence is in [API_CONTRACT.md](API_CONTRACT.md).

| #   | Priority                    | Item                                                                     |
| --- | --------------------------- | ------------------------------------------------------------------------ |
| 1   | **High (security)**         | `/auth/token` has no password                                            |
| 2   | **High (security)**         | Open registration and unbounded token lifetime                           |
| 3   | **High (needed to deploy)** | No CORS                                                                  |
| 4   | **High (correctness)**      | `precip`, `et_actual` and `gdd` are on the wrong scale                   |
| 5   | Medium                      | No endpoint for the crop list                                            |
| 6   | Medium                      | Can't tell "no data" from a CPI of 0.0                                   |
| 7   | Medium                      | Advisory condition and units are missing from the response               |
| 8   | Medium                      | Data-source status is hidden (a 200 can have no satellite data)          |
| 9   | Medium                      | No cap on grid size or cell count, and blocking work in an `async` route |
| 10  | Low                         | Advisories for metrics without values                                    |
| 11  | Low                         | Health endpoint is liveness only                                         |
| 12  | Low                         | OpenAPI is missing the error responses                                   |
| 13  | Low                         | Docs and code disagree on the metric list                                |

---

## 1. `/auth/token` issues a token for any email, with no password (High, security)

**Evidence:** `app/api/endpoints/auth.py:54`. `generate_token` looks the user up by email and mints an access token. There is no credential check, and the endpoint is unauthenticated.
**Impact:** anyone who knows or guesses a registered email can act as that user for up to `duration_in_minutes`.
**Request:** remove it, or restrict it to a dev environment flag, or require a password or PropelAuth login (hosted login page / OAuth) instead.
**Frontend handling:** the "Sign in" tab uses it only when `VITE_ENABLE_DEV_TOKEN_LOGIN=true`. It is labelled as a dev token flow and is off by default in production builds.

## 2. Open registration and unbounded token lifetime (High, security)

**Evidence:** `register_user` creates the user with `email_confirmed=True` and `send_email_to_confirm_email_address=False`, then returns a token. `duration_in_minutes` is `> 0` with no maximum (`app/models/auth.py`).
**Impact:** anyone can create an account without verifying their email, and request a token that lives for years. There is no rate limit of our own.
**Request:** require email confirmation, cap `duration_in_minutes` (for example 60–480), and add rate limiting.
**Frontend handling:** sends `VITE_TOKEN_TTL_MINUTES` (default 480) and treats the token as short-lived.

## 3. No CORS (High, needed to deploy)

**Evidence:** `app/main.py` has no `CORSMiddleware`.
**Impact:** a browser app on a different origin can't call the API.
**Frontend handling:** dev uses the Vite proxy; production uses a same-origin reverse proxy ([DEPLOYMENT.md](DEPLOYMENT.md), Phase 8).
**Request:** add `CORSMiddleware` with an explicit origin allow-list from settings, `Authorization` and `Content-Type` headers, and `allow_credentials=False` (Bearer tokens don't need credentials).
**Gotcha:** the catch-all `@app.exception_handler(Exception)` produces its 500 response outside the CORS middleware, so 500s would not carry CORS headers. Handle that when adding CORS.

## 4. `precip`, `et_actual` and `gdd` are on the wrong scale (High, correctness)

**Evidence:**

- `calculate_weather_means` (`weather_service.py`) takes `fmean` of **hourly** values, so `precip` and `et_actual` are _hourly means_ (mm/h, typically 0.0–1).
- The thresholds in `advisory_thresholds.json` expect much larger values: `precip` 300–700 (a seasonal total) and `et_actual` 1.5–7.5 (mm/day).
- `_calculate_gdd` (`analytics_service.py`) returns `sum(max(0, T − Tbase))` over **hourly** temperatures. Its docstring example divides by 24, but the code doesn't. The thresholds for `gdd` are 0–500.
  **Impact:** `precip` and `et_actual` will almost always classify "Low" and score near 0. `gdd` will saturate at the maximum. So the Agro_Meteo CPI and several advisories are wrong, and the same wrong numbers drive the crop advice.
  **Request:** decide the intended meaning (window total vs. daily mean), aggregate accordingly (`sum` for precipitation over the window, daily sums for ET, divide GDD by 24), and align thresholds and units. Confirm the intent before the frontend shows units for these metrics.
  **Frontend handling:** shows the code's real unit (mm/h hourly mean, °C·hours) with an "unverified scale" note. The note goes away once this is fixed.

## 5. No endpoint for the crop list (Medium)

**Evidence:** `SUPPORTED_CROPS` (about 80 crops with English and desi names) lives only in `app/models/requests.py`.
**Request:** `GET /api/v1/crops` returning `[{ name, desi_name, category }]` plus the category list (with display labels).
**Frontend handling:** mirrors the list in `src/domain/crops.ts`, with a test that fails if the Python and TypeScript lists drift.

## 6. Can't tell "no data" from a CPI of 0.0 (Medium)

**Evidence:** `calculate_grid_cpi_scores` returns `0.0` when no value was normalizable, and `build_cpi_scores` also fills missing scores with `0.0`.
**Impact:** a failed Earth Engine call is shown as "worst possible score". Genuine zeros can't be told apart from missing data.
**Request:** make `cpi_scores` values nullable (`null` = no data), or add `cpi_coverage: { cluster: { used: n, expected: m } }`.
**Frontend handling:** treats a cluster as "no data" when the cell has no `raw_metrics` from that cluster (heuristic, see D4).

## 7. Advisory condition and metric units are missing (Medium)

**Evidence:** the server computes `Low | Moderate | High | Unknown` (`_classify_value`) but returns only `recommended_action`. Units appear nowhere in the API.
**Request:** return `advisories: { metric: { condition, action, value } }` (or add a parallel object, to stay backward-compatible), and add a `GET /api/v1/metrics` metadata endpoint (key, label, unit, cluster, measured/derived, threshold bounds).
**Frontend handling:** doesn't colour advisories by severity. Metric metadata is mirrored in `src/domain/metrics.ts`.

## 8. Data-source status is hidden (Medium)

**Evidence:** `analysis.py` swallows Earth Engine `DomainError`s and climatology failures. The SAR start date may roll back (`sar_rolled_back_days`). None of this reaches the response.
**Impact:** a 200 can mean "weather only". The user can't tell, and the numbers look complete.
**Request:** add a `meta` object to the response, for example `{ sources: { weather: "ok", climatology: "missing", gee_optical: "ok|missing", gee_sar: "ok|rolled_back", gee_thermal: "..." }, sar_effective_start_date, sar_rolled_back_days }`. Since the response model uses `extra="forbid"`, add a top-level `meta` field to `FarmAnalysisResponse`.
**Frontend handling:** infers missing satellite data from absent metrics. Shows a "Satellite data unavailable" banner when no cell has any Sentinel or Landsat metric.

## 9. No cap on grid size or cell count (Medium)

**Evidence:** `grid_size` is `> 0` with no maximum, there is no cell-count limit, and `create_grid` loops in pure Python inside an `async def` route, which blocks the event loop.
**Impact:** a large farm with `grid_size=1` can exhaust memory or stall every other request.
**Request:** cap cells (for example 5,000–10,000) and return a clear 400 or 413. Move CPU-bound work off the event loop (`run_in_threadpool`). Consider a job-style API (`POST` then poll) for long analyses, because requests can take tens of seconds.
**Frontend handling:** warns above 2,000 estimated cells and asks for confirmation above 10,000. It can't enforce server limits.

## 10. Advisories for metrics without values (Low)

**Evidence:** see API_CONTRACT §4.3. Missing values produce `"Unknown"`, which returns the rule's `critical_action` (for example "Initiate N-rescue for leached soil").
**Request:** omit advisories for metrics with no value, or return the condition so clients can filter. Showing a _critical_ action because data is missing is misleading.
**Frontend handling:** detects "no raw value" and shows these as "No data", not as advice.

## 11. Health is liveness only (Low)

**Evidence:** `/health` always returns `{"status":"ok"}`. Earth Engine is initialized lazily and PropelAuth at startup.
**Request:** add a readiness check (`/ready`) that reports PropelAuth and Earth Engine status.
**Frontend handling:** the top bar says "API reachable", not "all services healthy".

## 12. OpenAPI is missing the error responses (Low)

**Request:** declare 400, 401, 403 and 500 response models on the routes (`responses={...}`) so generated client types include them.

## 13. Docs and code disagree on the metric list (Low)

`legacy/farmland_insights_documentation.md` and `docs/requirements.md` say 30 parameters and put `lst` in or out inconsistently. The code has 31 (`lst` in `Environmental`).
Also: `nddi` can never be computed, because no `ndwi` band is fetched (`OPTICAL_INDEX_BANDS` has no `ndwi`).
