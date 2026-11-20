# Farmland Insights

Grid-level crop intelligence for a farm boundary: satellite indices (Sentinel-1 SAR, Sentinel-2 Optical, Landsat LST) + weather telemetry → Crop Performance Index (CPI) scores, stress diagnostics, and agronomic advisories.

Built with a **FastAPI** Python backend and a **React + Vite + TypeScript** frontend.

---

## Architecture & Layout

| Path | Description |
|---|---|
| `app/` | FastAPI backend (`/api/v1/analyze`, auth, satellite STAC/GEE, and weather services) |
| `frontend/` | React 19 + Vite + TypeScript + Tailwind CSS + MapLibre GL user interface |
| `tests/` | Backend test suite (pytest) |
| `scripts/` | Development servers, satellite check utilities, and launchers |
| `geojson_polygon_data/` | Sample farm boundary GeoJSON files for testing |
| `docs/` | Requirements, architecture notes, and design specifications |
| `legacy/` | Standalone prototype pipeline (`farmland_insights.py`) kept for reference |

---

## Prerequisites

Before running the application, make sure the following are installed on your system:

- **Python**: Version `3.12.x` (`>=3.12, <3.13`)
- **uv**: Fast Python package installer and runner ([uv installation guide](https://docs.astral.sh/uv/))
- **Node.js**: Version `20+` or `22+` LTS ([Node.js downloads](https://nodejs.org/))
- **pnpm**: Fast, disk space efficient package manager (`npm install -g pnpm` or via Corepack)
- **Windows curl**: Included by default in Windows 10/11

---

## Installation & Getting Started

### Option A: One-Click Launch (Windows - Recommended)

1. **First-time setup:** Double-click `INSTALL-AND-RUN.bat`.
   * Automatically verifies and installs missing prerequisites (`uv`, `Node.js`, `pnpm` via `winget`/`npm`).
   * Installs all Python virtual environment dependencies and frontend npm packages.
   * Clears conflicting environment variables and launches both the API and UI.
   * Opens your browser automatically at `http://localhost:5173`.
2. **Subsequent launches:** Double-click `start-app.bat`.
   * Starts the FastAPI dev server (`http://127.0.0.1:8010`) and frontend Vite dev server (`http://localhost:5173`).
   * Runs local development mode with live STAC satellite data (Microsoft Planetary Computer) and dummy authentication (no API keys or accounts required).
   * To stop the application, simply close the two open terminal windows ("Farmland API" and "Farmland UI").

---

### Option B: Manual Setup (Windows, macOS, Linux)

#### 1. Backend Setup

From the repository root:

```bash
# 1. Create .env from template (optional for local STAC dev)
cp .env.example .env

# 2. Sync and install Python dependencies into .venv
uv sync

# 3. Start the dev server (fake auth + live STAC satellite data)
uv run uvicorn scripts.dev_server:app --host 127.0.0.1 --port 8010
```

#### 2. Frontend Setup

In a separate terminal window:

```bash
cd frontend

# 1. Create frontend .env from template
cp .env.example .env

# 2. Install dependencies
pnpm install

# 3. Start the Vite development server
pnpm dev --port 5173
```

Open `http://localhost:5173` in your browser. You can sign in using any email and password in local development mode.

---

## Configuration (`.env`)

### Satellite Data Provider

Set `SATELLITE_PROVIDER` in your root `.env`:

- `stac` (default for dev): Microsoft Planetary Computer. Completely free, open-access, and requires **no credentials or API keys**. Fetches Sentinel-2 (L2A), Landsat (C2-L2 thermal LST), and Sentinel-1 (RTC/SAR).
- `gee`: Google Earth Engine. Requires a Google Cloud project and Service Account credentials (`GOOGLE_APPLICATION_CREDENTIALS` / `EE_PROJECT_ID`).

### Environment Templates

- **Backend**: `.env.example` → `.env`
- **Frontend**: `frontend/.env.example` → `frontend/.env` (sets `VITE_API_PROXY_TARGET=http://127.0.0.1:8010` and `VITE_ENABLE_DEV_TOKEN_LOGIN=true`).

---

## Troubleshooting & Important Notes

### 1. Windows PROJ / GDAL Environment Variable Conflict
If PostgreSQL with PostGIS is installed on Windows, the installer often creates global system environment variables `PROJ_LIB` and `GDAL_DATA` pointing to PostGIS's older `proj.db`. This causes Python's `rasterio` coordinate transformation to fail with `stac_scene_failed`.

* `start-app.bat` automatically unsets these variables during launch.
* If running manually in PowerShell, clear them in your session before launching:
  ```powershell
  $env:PROJ_LIB = ""; $env:GDAL_DATA = ""; $env:PROJ_DATA = ""
  uv run uvicorn scripts.dev_server:app --host 127.0.0.1 --port 8010
  ```
* In Command Prompt (`cmd`):
  ```cmd
  set PROJ_LIB=
  set GDAL_DATA=
  set PROJ_DATA=
  uv run uvicorn scripts.dev_server:app --host 127.0.0.1 --port 8010
  ```

### 2. GeoJSON Field Boundaries & Coordinate Reference System (CRS)
All uploaded field boundaries must strictly adhere to the GeoJSON RFC 7946 standard:
- **CRS**: Coordinates must be in **WGS 84 (EPSG:4326)** decimal degrees (`[longitude, latitude]`).
- **QGIS / ArcGIS Exports**: When exporting layers from GIS software, ensure the export CRS is set to **`EPSG:4326 - WGS 84`** (do **not** export in projected UTM meters such as `EPSG:32643`, or coordinates will be flagged as out-of-bounds).
- **Topology**: Ensure polygon boundary edges do not cross themselves (avoid consecutive duplicate points at the same vertex).

### 3. Open-Meteo Rate Limiting (HTTP 429)
The weather service uses Open-Meteo's free tier. If you run multiple heavy analyses in rapid succession and encounter an `HTTP 429 Too Many Requests` error, wait approximately 1 minute for the rate limit window to reset before submitting a new query.

---

## Testing

```bash
# Run backend tests (pytest)
uv run pytest

# Run frontend tests and linter
cd frontend
pnpm test
pnpm lint
pnpm typecheck
```

---

## License

Private repository. All rights reserved.
