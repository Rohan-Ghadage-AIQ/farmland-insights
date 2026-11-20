# API contract (verified from backend code)

**Status:** verified by reading the code. The backend was **not run**, because `.env` is empty (no PropelAuth or Earth Engine settings).
The OpenAPI schema in [`../openapi.json`](../openapi.json) was generated from the FastAPI app object (`app.openapi()`), not fetched from a live server.
Anything marked **UNVERIFIED** needs a live backend.

Files read: `app/main.py`, `app/auth.py`, `app/config.py`, `app/exceptions.py`, `app/api/endpoints/{analysis,auth}.py`,
`app/models/{requests,responses,auth}.py`, `app/services/{geometry,weather,analytics}_service.py`, `app/services/gee_service.py` (units/bands),
`app/utils/{payloads,analytics_constants}.py`, `app/data/advisory_thresholds.json` (scales), `docs/requirements.md`, `legacy/farmland_insights_documentation.md`.

Base URL (dev): `http://127.0.0.1:8000`. Every route is under `/api/v1`, except `/health`.

## 1. Endpoints

| Method | Path                    | Auth   | Request                | Response                                                     |
| ------ | ----------------------- | ------ | ---------------------- | ------------------------------------------------------------ |
| GET    | `/health`               | none   | none                   | `{"status":"ok"}` (liveness only, with no dependency checks) |
| POST   | `/api/v1/auth/register` | none   | `RegisterUserRequest`  | `AuthTokenResponse`                                          |
| POST   | `/api/v1/auth/token`    | none   | `GenerateTokenRequest` | `AuthTokenResponse`                                          |
| GET    | `/api/v1/auth/whoami`   | Bearer | none                   | `WhoAmIResponse`                                             |
| POST   | `/api/v1/analyze`       | Bearer | `FarmAnalysisRequest`  | `FarmAnalysisResponse`                                       |

The OpenAPI document lists only 200 and 422 responses. The 400, 401, 403, 404, 429 and 500 shapes below come from the code and are not in the schema.

### Auth models (`extra="forbid"`)

- `RegisterUserRequest`: `email` (EmailStr), `password` (min length 1), `duration_in_minutes` (strict int > 0).
- `GenerateTokenRequest`: `email`, `duration_in_minutes` (strict int > 0).
- `AuthTokenResponse`: `user_id`, `email`, `access_token`, `token_type` (default `"bearer"`), `expires_in_minutes`.
- `WhoAmIResponse`: `user_id`, `email` (nullable), `active_org_id` (nullable).
- There is **no maximum** on `duration_in_minutes` (see BACKEND_REQUESTS #2).

### `FarmAnalysisRequest` (`extra="forbid"` on every nested model)

```
farm_geojson: FeatureCollection            // features: min 1
  Feature { type:"Feature", id?: string|int|null, geometry: Polygon|MultiPolygon, properties: object }
start_date: date, end_date: date            // start <= end; end <= today + 16 days (server date)
crop_category: CropCategory                 // 12-value enum; names are resolved before validation
grid_size: int                              // strict int > 0; default 50; no upper bound
```

- Positions are `[lng, lat]` or `[lng, lat, alt]` (floats). Rings need **≥ 4 positions** and the first must equal the last.
- Server-side checks that the schema can't express, all returning **400** `DomainError`:
  - `invalid polygon geometry`: self-intersecting or otherwise invalid rings.
  - Coordinates outside WGS84 bounds.
  - Empty geometries.
  - No grid cells produced.
- `crop_category` accepts a category key **or** an English or desi name (case-insensitive, `_` treated as space). The OpenAPI schema only shows the 12-value enum. Send the **category key**.
- `start_date` has **no lower bound**. The `end_date` limit uses the _server's_ `date.today()`.

### `FarmAnalysisResponse`

`FeatureCollection` of `GridAnalysisFeature` (min 1). Each has:

- `id`: the grid id (int, starting at 1).
- `geometry`: `Polygon` or `MultiPolygon`. Cells are clipped to the farm outline, so edge cells can be irregular or multi-part.
- `properties.grid_id`
- `properties.raw_metrics`: `dict[str, float]`
- `properties.cpi_scores`: five floats in 0..1, always all present
- `properties.advisories`: `dict[str, str]` (metric to action text)

## 2. Error shapes

| Status  | Origin                            | Body                                                   | Notes                                                                                                                                               |
| ------- | --------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400     | `DomainError` handler (`main.py`) | `{error:"bad_request", detail:string, details:object}` | `details` is always an object (`{}` if empty). It can contain upstream URLs and response text (Open-Meteo). Show it only under "Technical details". |
| 400     | auth endpoints                    | `{detail: string \| object}`                           | `object` is PropelAuth `field_to_errors`.                                                                                                           |
| 401/403 | PropelAuth `require_user`         | `{detail: ...}`                                        | **UNVERIFIED** exact bodies and which of 401/403 is used. Treat both as session-invalid.                                                            |
| 404     | `/auth/token`                     | `{detail:"User not found."}`                           |                                                                                                                                                     |
| 422     | FastAPI                           | `{detail:[{loc,msg,type,...}]}`                        | `loc` starts with `"body"`.                                                                                                                         |
| 429     | auth endpoints                    | `{detail: string}`                                     | PropelAuth rate limit.                                                                                                                              |
| 500     | unhandled-exception handler       | `{error:"internal_server_error", detail}`              | Also raised for **non-`DomainError`** Earth Engine failures (see 3).                                                                                |
| 500     | auth endpoints                    | `{detail: string}`                                     | `ValueError` from the token helpers.                                                                                                                |

## 3. Failure semantics of `/analyze` (what "success" can hide)

| Source                             | On failure                                                          | Visible to client? |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------ |
| Open-Meteo hourly weather          | `DomainError` is raised, so the **whole request returns 400**       | yes                |
| Open-Meteo climatology             | **swallowed** (logged). `spi`, `spei` and `rwi` are simply missing. | **no**             |
| Earth Engine (`DomainError`)       | **swallowed**. No satellite metrics at all.                         | **no**             |
| Earth Engine (any other exception) | **500** for the whole request                                       | yes                |
| SAR window                         | may be rolled back to an earlier start date (logged only)           | **no**             |

So a **200 response can have zero satellite data**: every cell then has only weather and derived-from-weather metrics, and the Structural and Chlorophyll CPI are `0.0`.

## 4. Interpreting the response (differences from / additions to the build prompt §2.4)

1. **`raw_metrics` contains derived indices too**, not only measured ones. The code merges derived values into it: `swdi, cmi, ai_dm, vci, tci, vhi, spi, spei, gdd, crti, rwi, payout` (and `nddi`, which is **never produced** today because no `ndwi` is ever fetched). The frontend must not assume that every key is a measurement.
2. **Missing CPI inputs give `0.0`**, never `null` (`calculate_grid_cpi_scores`). A cluster counts as **No data** when the cell has no `raw_metrics` keys for that cluster.
   - Use cluster membership from `CLUSTER_PARAMS`, as in `app/utils/analytics_constants.py`.
   - A cluster also counts as no data if the cell has metrics but none have a threshold rule. The frontend can't tell this case, so `0.0` is ambiguous (BACKEND_REQUESTS #6).
   - A genuine score can be `0.0` (every normalized value clipped to its minimum).
3. **Advisories are emitted for metrics that have no value.** `evaluate_parameter_advisories` iterates all threshold parameters. A missing value is classified `"Unknown"` and gets the rule's **`critical_action`** text. So `advisories[m]` can exist while `raw_metrics[m]` doesn't. Treat those as "no data" advisories and do not show them as recommendations.
4. **Weather is farm-level, not per cell.** Open-Meteo is fetched once at the farm centroid and broadcast to every cell. These are **identical across cells**: `t2m, rh, precip, soil_moist, soil_temp, et_actual`, and everything derived from them (`swdi, cmi, ai_dm, spi, spei, gdd, rwi, payout, crti`). Only satellite metrics vary per cell: `ndvi, evi, savi, gndvi, ndre, ndmi, rvi, dprvi, dpsvi, rfdi, csi, lst`.
   - `vci, tci, vhi` vary by cell but are **relative to the farm's own min/max** (0–100, 50 when flat).
   - `crti` is the **sum of precip over all cells**, so it scales with cell count and is not meaningful per cell.
5. **Advisory text has no condition label.** The server computes Low, Moderate, High or Unknown but returns only the action string.
6. The `grid_id` in `properties` can be an int or a string. Treat it as `string | number`.

## 5. Metric dictionary

Cluster keys and membership are the code's `CLUSTER_PARAMS`. Note: the docs say "30 parameters" and omit `lst`, but the code has **31**, with `lst` in `Environmental`.

| Cluster key     | Label (UI)       | Metrics (code)                                               |
| --------------- | ---------------- | ------------------------------------------------------------ |
| `Structural`    | Canopy structure | ndvi, evi, savi, rvi, dprvi, dpsvi, csi                      |
| `Chlorophyll`   | Chlorophyll      | gndvi, ndre                                                  |
| `Water_Drought` | Water & drought  | ndmi, swdi, cmi, ai_dm, vci, tci, vhi, nddi, spi, spei, rfdi |
| `Environmental` | Environment      | t2m, lst, rh, soil_moist, soil_temp                          |
| `Agro_Meteo`    | Agro-meteorology | crti, gdd, rwi, payout, precip, et_actual                    |

### Units: what the code actually does

| Metric                               | Source                                      | Unit by code       | Confidence / caveat                                                                                                               |
| ------------------------------------ | ------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `t2m`                                | Open-Meteo hourly, **mean**                 | °C                 | confirmed (default unit, none overridden)                                                                                         |
| `rh`                                 | Open-Meteo hourly, mean                     | %                  | confirmed                                                                                                                         |
| `soil_temp`                          | Open-Meteo hourly, mean                     | °C                 | confirmed                                                                                                                         |
| `soil_moist`                         | Open-Meteo hourly, mean                     | m³/m³              | confirmed                                                                                                                         |
| `lst`                                | Landsat 8/9 band 10, K to °C (`−273.15`)    | °C                 | confirmed in `gee_service.py`                                                                                                     |
| `precip`                             | Open-Meteo hourly, **mean** (`fmean`)       | mm/h (hourly mean) | **Scale mismatch.** Thresholds are 300–700 (a season total). A mean of hourly mm is ~0.0–1. So it will almost always score "Low". |
| `et_actual`                          | Open-Meteo hourly, **mean**                 | mm/h (hourly mean) | **Scale mismatch.** Thresholds are 1.5–7.5 (mm/day).                                                                              |
| `gdd`                                | sum over hourly `max(0, T − Tbase)`         | °C·hours           | **Scale mismatch.** The docstring says "divide by 24" but the code doesn't. Thresholds are 0–500, so the value will saturate.     |
| `ndvi, evi, savi, gndvi, ndre, ndmi` | Sentinel-2                                  | unitless index     | confirmed                                                                                                                         |
| `rvi, dprvi, dpsvi, csi, rfdi`       | Sentinel-1 (linear)                         | unitless index     | confirmed                                                                                                                         |
| `swdi`                               | `1 − soil_moist/0.5` clipped 0..1           | unitless           | assumes field capacity 0.5                                                                                                        |
| `cmi`                                | `(P−ET)/max(                                | ET                 | ,0.1)` clipped −3..3                                                                                                              | unitless |     |
| `ai_dm`                              | `precip/(t2m+10)`                           | ratio              |                                                                                                                                   |
| `vci, tci, vhi`                      | relative within farm                        | 0–100              | not absolute                                                                                                                      |
| `spi, spei, rwi`                     | z-score vs 10–30 yr climatology, clipped ±2 | σ                  | missing if climatology unavailable                                                                                                |
| `crti`                               | sum of precip across all cells              | mm/h·cells         | not meaningful (see 4)                                                                                                            |
| `payout`                             | `precip < min or t2m > max`                 | 0 or 1             |                                                                                                                                   |

## 6. Differences from the build prompt (§2) and how they are handled

| #   | Prompt said                                             | Code says                                                                                     | Handling                                                                                                    |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D1  | `raw_metrics` = measured Open-Meteo and GEE metrics     | also contains derived indices (§4.1)                                                          | UI labels each metric as measured or derived.                                                               |
| D2  | `precip`, `et_actual`, `gdd` units "mm", "mm", "°C·day" | hourly mean mm/h, hourly mean mm/h, °C·hours, and the thresholds expect different scales (§5) | Show the code's unit with a "per backend, unverified scale" note. Raised as BACKEND_REQUESTS #4.            |
| D3  | advisories are metric to action text                    | also present for metrics with no value (critical text) (§4.3)                                 | Detect a missing `raw_metrics[m]` and show it as "No data".                                                 |
| D4  | cluster "No data" = all-zero                            | zero can also be a real score. The reliable signal is "no raw metrics from that cluster".     | `hasClusterData()` uses metric presence, not the score.                                                     |
| D5  | (not mentioned)                                         | weather metrics are uniform across cells (§4.4)                                               | Raw-metric layers for farm-level metrics get a "same for every cell" note instead of a misleading gradient. |
| D6  | cluster list came from the docs                         | the code has `lst` in `Environmental` (31 metrics)                                            | Follow the code.                                                                                            |
| D7  | "every API error shape" in the OpenAPI schema           | schema documents only 200 and 422                                                             | Error mapping is hand-written from code (§2).                                                               |

## 7. Still to verify against a live backend

- Exact 401 and 403 bodies from `propelauth_fastapi.require_user`.
- Real response time of `/analyze`, for timeout and progress UX.
- Whether very large `grid_size` / tiny-cell requests are rejected, slow or crash (no cap in code).
- CORS behaviour (there is none today).
