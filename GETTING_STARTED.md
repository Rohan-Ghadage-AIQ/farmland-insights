# Farmland Insights - Getting Started (read this first)

Farmland Insights analyses a farm field from real satellite and weather data. You draw (or upload)
a field on a map, choose a crop and a period, and get vegetation, moisture, temperature, radar and
weather indicators, scores, advice, and a downloadable HTML report.

- **Backend:** Python / FastAPI (`app/`)
- **Frontend:** React + Vite + TypeScript (`frontend/`)
- **Satellite data:** Sentinel-2, Landsat and Sentinel-1 from the free Microsoft Planetary Computer.
  **No Google Earth Engine account or any API key is needed.**
- **Weather:** Open-Meteo (free, no key).

---

## 1. Install and run (one double-click)

1. Unzip the folder anywhere (a short path such as `C:armland` is best).
2. Double-click **`INSTALL-AND-RUN.bat`**.

It checks for **uv** (runs the Python backend), **Node.js** and **pnpm**, installs whatever is
missing (using Windows' built-in `winget`), installs all Python and frontend packages, starts the
backend and the frontend, and opens your browser at **http://localhost:5173**.

- The **first run takes several minutes** (downloads packages). Later runs take seconds; use
  **`start-app.bat`** then.
- If it says a tool is still missing, close the window and double-click the file again (Windows
  sometimes needs a fresh window to see newly installed tools).
- If `winget` is unavailable, install manually: uv https://docs.astral.sh/uv/ , Node.js 20+
  https://nodejs.org , then `npm i -g pnpm`.
- An internet connection is required (satellite and weather data are downloaded live).
- Two console windows ("Farmland API" and "Farmland UI") stay open; **close them to stop the app**.
- Ports used: API **8010**, UI **5173**. Close anything else using them.

## 2. Next times

Double-click **`start-app.bat`**.

## 3. Using the app

1. **Draw your field** with the polygon tool on the map, or upload a boundary file.
2. **Go to coordinates** (top-left of map): type e.g. `23.6025, 72.4025` or `23°36'9"N 72°24'9"E`.
3. Open **Setup** and choose the crop, grid size, and the **Start date / End date**
   (or quick buttons: Last 7/30/90 days, Last 12 months, Next 16 days, Season to date).
   A period can be up to **366 days**. Long periods take a minute or two.
4. Click **Analyze**. Results, scores and advice appear in the right-hand panels.
5. **Layers panel** (bottom-left): switch basemap (Streets / Satellite / Hybrid), and turn the
   satellite image, grid cells and farm boundary on or off.
6. **Click a grid cell** to see its values.
7. **Saved locations** (top of Setup): save the field, crop, dates and results under a name and
   reopen them later. The app also restores your last session. These are stored in *your browser on
   your computer*, so they are not shared between team members.
8. **Export HTML report** (Results panel): a single self-contained file with the map, scores and
   every parameter. It can be emailed or opened offline.

## 4. Sign-in note (important)

`start-app.bat` runs `scripts/dev_server.py`, a **local development server with sign-in switched
off**, so everyone can try the app with no account. **Never deploy this to a shared or public
server.** The real application (`app/main.py`) requires PropelAuth sign-in; configure it in `.env`
(see `.env.example`) if you deploy it.

## 5. Running pieces manually (if you prefer)

From the project folder, in two terminals:

```
uv run uvicorn scripts.dev_server:app --host 127.0.0.1 --port 8010
```
```
cd frontend
pnpm install
pnpm dev
```

Other helpers in `scripts/`:
- `run-satellite-check.bat` - checks that Sentinel-1/2 and Landsat data can be fetched and indices
  calculated for a test field.
- `run-dev.bat`, `run-demo.bat` - older launchers.

## 6. Tests

```
uv run pytest            # backend
cd frontend
pnpm test                # frontend unit tests
pnpm lint
pnpm build
```
Two older backend analytics tests (`test_gdd_uses_full_day_hourly_temperatures`,
`test_calculate_derived_indices_covers_core_formulas`) fail; they are known and unrelated to the
satellite or UI work.

## 7. Settings (`.env`)

Copy `.env.example` to `.env` only if you need to change something. For local use nothing is needed.
- `SATELLITE_PROVIDER` - `stac` (free, used by `start-app.bat`) or `gee` (Google Earth Engine, needs
  credentials; default for the production app).
- `STAC_PREFER_IPV4` - `true` by default; fixes ~20 s stalls on networks with broken IPv6.
**Do not share real `.env` files or keys.** This zip contains none.

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| "uv / pnpm was not found" | Install it (section 1), open a **new** window, run again. |
| First start is very slow | Normal: it is installing packages. Later starts take seconds. |
| Blank map / no satellite image | Check internet; try Streets in the Layers panel. Satellite imagery is only available up to zoom 18; closer than that the last image is stretched. |
| "Taking too long" or weather error | Weather service may be rate-limiting; wait a minute and retry, or use a shorter period. |
| Port already in use | Close the old "Farmland API" / frontend windows, or the program using 8010 / 5173. |
| Landsat temperature missing for some cells | Normal: Landsat may have no clear scene for that spot and period. |
| Year-long results look generic | Advice thresholds are tuned for a crop season; use a single season for more specific advice. |

## 9. Folder map

```
INSTALL-AND-RUN.bat  first-time installer + launcher
start-app.bat   launcher (backend + frontend + browser)
app/            FastAPI backend (satellite, weather, analytics)
frontend/       React/TypeScript user interface
scripts/        dev server, satellite check, helper launchers
tests/          backend tests
docs/           background notes and plans
legacy/         original prototype script and notes
README.md       developer overview
```
