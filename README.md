# Farmland Insights

Grid-level crop intelligence for a farm boundary: satellite indices (Sentinel-1, Sentinel-2,
Landsat) + weather -> CPI scores and advisories. FastAPI backend, React frontend.

## Layout

| Path | What it is |
|---|---|
| `app/` | FastAPI backend (`/api/v1/analyze`, auth, satellite + weather services) |
| `tests/` | Backend tests (pytest) |
| `frontend/` | React + Vite + TypeScript UI (has its own README) |
| `scripts/` | Launchers and dev tools (see below) |
| `docs/` | Requirements and the frontend build spec |
| `legacy/` | The original standalone pipeline (`farmland_insights.py`) and its docs, kept for reference |

## Satellite data source

Set `SATELLITE_PROVIDER` in `.env`:

- `gee` (default): Google Earth Engine, needs service-account credentials.
- `stac`: Microsoft Planetary Computer, free and no credentials. Implemented in
  `app/services/stac_service.py`.

## Run it (Windows)

| Script | Purpose |
|---|---|
| `start-app.bat` (repo root) | Starts the backend and the UI, waits until both are ready and opens the browser. Real satellite and weather data, fake sign-in. |
| `scripts/run-satellite-check.bat` | Prompts for an area and dates, prints scenes found and all indices. No UI. |
| `scripts/run-dev.bat` | Real backend (needs PropelAuth settings in `.env`) + UI. |
| `scripts/run-demo.bat` | UI against a mock API with synthetic numbers. |

`scripts/dev_server.py` is local development only and must never be deployed.

## Using the app

- **Period:** separate Start date and End date fields (type or use the calendar), plus quick buttons
  from "Last 7 days" up to "Last 12 months". A period can be up to 366 days (a year); the end date
  cannot be more than 16 days ahead. For long periods the satellite values are the median of up to
  12 scenes spread across the period (about one per 6 days, fewer for short periods), and a full year
  takes roughly 15 to 30 seconds.
- **Layers panel** (bottom-left of the map): turn the basemap, grid cells and farm boundary on or
  off, switch between Streets, Satellite and Hybrid, and fade the grid.
- **Go to coordinates** (top-left of the map): type a latitude and longitude, for example
  `23.6025, 72.4025`, `23.6025N 72.4025E` or `23°36'9"N 72°24'9"E`.
- **Saved locations** (top of the Setup panel): save the field, crop, dates, grid size and results
  under a name and reopen them in one click. They are kept in your browser on this device.
- **Last session:** the app remembers your current field and settings and restores them when you
  reopen it.
- **Reports:** "Export HTML report" in the Results panel makes a self-contained report with the map,
  scores, every parameter and every cell.

## Tests

```bash
scripts/run_tests.sh            # backend (needs bash, e.g. Git Bash)
pnpm --dir frontend test        # frontend
```

## Configuration

Copy `.env.example` to `.env` (backend) and `frontend/.env.example` to `frontend/.env` (frontend).
