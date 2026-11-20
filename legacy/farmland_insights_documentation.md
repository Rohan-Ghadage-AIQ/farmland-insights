# farmland_insights.py — Farm-Weather Analysis & Insights Pipeline

> **Author:** Auto-generated pipeline  
> **Last Updated:** 2026-03-10  

---

## Table of Contents

1. [Purpose](#purpose)
2. [Usage](#usage)
3. [Pipeline Architecture](#pipeline-architecture)
4. [Module Reference](#module-reference)
   - [Module 1 — Argument Parsing & Configuration](#module-1--argument-parsing--configuration)
   - [Module 2 — Farm Boundary & Grid Generation](#module-2--farm-boundary--grid-generation)
   - [Module 3 — Remote Sensing (Google Earth Engine)](#module-3--remote-sensing-google-earth-engine)
   - [Module 4 — Weather Data (Open-Meteo)](#module-4--weather-data-open-meteo)
   - [Module 5 — Zonal Statistics](#module-5--zonal-statistics)
   - [Module 6 — Decision Matrix](#module-6--decision-matrix)
   - [Module 6b — Derived Indices](#module-6b--derived-indices)
   - [Module 7 — MCDA / Composite Performance Index (CPI)](#module-7--mcda--composite-performance-index-cpi)
   - [Module 8 — Classification & Advisory Lookup](#module-8--classification--advisory-lookup)
   - [Module 8b — GeoJSON Enrichment](#module-8b--geojson-enrichment)
   - [Module 9 — Outputs](#module-9--outputs)
5. [Analytical Clusters](#analytical-clusters)
6. [Parameter Reference](#parameter-reference)
7. [Advisory Thresholds](#advisory-thresholds)
8. [Supported Crop Categories](#supported-crop-categories)
9. [Dependencies](#dependencies)
10. [Output File Structure](#output-file-structure)

---

## Purpose

End-to-end geospatial pipeline that:

1. Reads a farm boundary from **PostGIS** or a **Shapefile/GeoJSON** file upload
2. Divides it into **50 m × 50 m grid cells** (configurable)
3. Fetches **remote-sensing indices** from Google Earth Engine (Optical & Microwave/SAR)
4. Fetches **weather parameters** from the Open-Meteo API (historical archive + forecast)
5. Computes **zonal statistics** per grid cell
6. Runs **Multi-Criteria Decision Analysis (MCDA / CPI)** across five expert-defined analytical clusters
7. Classifies every parameter as **Low / Moderate / High** and looks up crop-specific advisories
8. Outputs an **advisory report CSV**, a **CPI summary CSV**, **enriched GeoJSON**, and **weather line graphs**

---

## Usage

### Command Line

```bash
python farmland_insights.py \
    --db_url "postgresql://postgres:postgres@localhost:5432/postgres" \
    --farm_table farms.farm_boundaries \
    --grid_size 50 \
    --ee_project geospatial-analysis-487803
```

### Interactive Prompts

When the script starts, it will interactively ask for:

| Prompt | Description |
|--------|-------------|
| **Crop Selection** | Displays a 3-column alphabetical grid of 76+ supported crops with unique aliases. Enter the alias to select. |
| **Boundary source** | `file` (Shapefile/GeoJSON upload) or `db` (PostGIS database) |
| **File path** *(if file)* | Full path to the Shapefile or GeoJSON |
| **Farm IDs** *(if db)* | Comma-separated list, or Enter for ALL |
| **Start Date** | `YYYY-MM-DD` format |
| **End Date** | `YYYY-MM-DD` format (max 16 days into the future for forecast) |
| **Output Directory** | Default: `C:\GIS_Data\agriculture\agri_tech_outputs` |

### CLI Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--db_url` | No | `None` | PostgreSQL connection string (required if using `db` source) |
| `--farm_table` | No | `farm.farm_boundaries` | PostGIS table containing farm polygons |
| `--crop_category` | No | `cereals_c3_temperate` | Default crop category fallback for the interactive crop selection prompt |
| `--grid_size` | No | `50` | Grid cell size in metres |
| `--ee_project` | No | `None` | Google Cloud Project ID for Earth Engine |

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────────┐      │
│  │ Module 1     │────▶│ Module 2     │────▶│ Module 3           │      │
│  │ Parse Args & │     │ Fetch Farm   │     │ GEE Remote Sensing │      │
│  │ User Config  │     │ Boundary +   │     │ (Optical + SAR)    │      │
│  └──────────────┘     │ Create Grid  │     └─────────┬──────────┘      │
│                       └──────────────┘               │                  │
│                              │           ┌───────────▼──────────┐      │
│                              │           │ Module 4             │      │
│                              │           │ Weather Data         │      │
│                              │           │ (Open-Meteo API)     │      │
│                              │           └───────────┬──────────┘      │
│                              │                       │                  │
│                       ┌──────▼───────────────────────▼──────────┐      │
│                       │ Module 5 — Zonal Statistics             │      │
│                       └──────────────────┬──────────────────────┘      │
│                                          │                              │
│                       ┌──────────────────▼──────────────────────┐      │
│                       │ Module 6 — Build Decision Matrix        │      │
│                       └──────────────────┬──────────────────────┘      │
│                                          │                              │
│                       ┌──────────────────▼──────────────────────┐      │
│                       │ Module 6b — Compute Derived Indices     │      │
│                       │ (NDDI, SWDI, CMI, VCI, TCI, VHI,       │      │
│                       │  SPI, SPEI, GDD, CRTI, RWI, Payout)    │      │
│                       └──────────────────┬──────────────────────┘      │
│                                          │                              │
│                       ┌──────────────────▼──────────────────────┐      │
│                       │ Module 7 — MCDA / CPI Scoring           │      │
│                       └──────────────────┬──────────────────────┘      │
│                                          │                              │
│                       ┌──────────────────▼──────────────────────┐      │
│                       │ Module 8 — Classification & Advisory    │      │
│                       └──────────────────┬──────────────────────┘      │
│                                          │                              │
│                ┌─────────────────────────┼─────────────────────┐       │
│                │                         │                     │       │
│  ┌─────────────▼─────┐  ┌───────────────▼────┐  ┌────────────▼────┐  │
│  │ Module 8b         │  │ Module 9           │  │ Comparison      │  │
│  │ GeoJSON Enrichment│  │ CSVs + Graphs      │  │ Charts          │  │
│  └───────────────────┘  └────────────────────┘  └─────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Module Reference

### Module 1 — Argument Parsing & Configuration

**Functions:**

| Function | Description |
|----------|-------------|
| `parse_args()` | Parses CLI arguments (`--db_url`, `--farm_table`, `--crop_category`, `--grid_size`, `--ee_project`) |
| `get_user_crop_category()` | Interactively displays all crops and resolves the user's alias selection into a base category |
| `get_user_output_dir()` | Prompts user for the base output directory |
| `get_output_folder_name()` | Prompts for an output folder name (auto-appends timestamp) |
| `get_user_date_input()` | Interactive date entry with validation (max 16 days forecast) |
| `get_user_farm_ids()` | Interactive Farm ID entry (comma-separated or ALL) |

---

### Module 2 — Farm Boundary & Grid Generation

**Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `fetch_farm_boundaries()` | `(db_url, table, farm_ids)` → `GeoDataFrame` | Connects to PostGIS and retrieves the farm geometry. Raises an error if the connection fails. |
| `_estimate_utm_crs()` | `(gdf)` → `CRS` | Returns the best UTM CRS for the centroid of the GeoDataFrame |
| `create_grid()` | `(farm_gdf, cell_size=50)` → `GeoDataFrame` | Tiles the farm polygon into square cells of `cell_size` metres. Returns `[grid_id, geometry]` in UTM CRS. |

**File upload path:** When the user chooses `file` as the boundary source, the script reads the Shapefile or GeoJSON via `geopandas.read_file()`, auto-assigns EPSG:4326 if no CRS is detected, and generates sequential IDs if no `id` column exists.

---

### Module 3 — Remote Sensing (Google Earth Engine)

Fetches satellite imagery from two Sentinel missions:

#### Optical Indices (Sentinel-2 SR Harmonized)

| Index | Full Name | Formula |
|-------|-----------|---------|
| `ndvi` | Normalized Difference Vegetation Index | (NIR − Red) / (NIR + Red) |
| `evi` | Enhanced Vegetation Index | 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1) |
| `savi` | Soil Adjusted Vegetation Index | 1.5 × (NIR − Red) / (NIR + Red + 0.5) |
| `gndvi` | Green NDVI | (NIR − Green) / (NIR + Green) |
| `ndre` | Normalized Difference Red Edge | (NIR_narrow − RE1) / (NIR_narrow + RE1) |
| `ndmi` | Normalized Difference Moisture Index | (NIR − SWIR1) / (NIR + SWIR1) |

- **Cloud filter:** `CLOUDY_PIXEL_PERCENTAGE < 30`
- **Composite:** Median over the date range
- **Resolution:** 10 m native

#### SAR Indices (Sentinel-1 GRD IW dual-pol)

| Index | Full Name | Formula |
|-------|-----------|---------|
| `rvi` | Radar Vegetation Index | 4 × VH / (VV + VH) |
| `dprvi` | Dual-Pol Radar Vegetation Index | 1 − (VV / (VV + VH)) |
| `dpsvi` | Dual-Pol SAR Vegetation Index | (VV − VH) × VH |
| `rfdi` | Radar Forest Degradation Index | (VV − VH) / (VV + VH) |
| `csi` | Cross-pol Scattering Index | VH / VV |

- **Polarisation:** VV + VH (converted from dB to linear power)
- **Mode:** Interferometric Wide Swath (IW)
- **Resolution:** 10 m native
- **Rolling start:** If no Sentinel-1 imagery exists for the requested window, the start date is rolled back in 3-day increments until imagery is found (or the earliest S1 date of 2014-10-03 is reached).

**Key Functions:**

| Function | Description |
|----------|-------------|
| `_init_gee(ee_project)` | Initialises Earth Engine; returns `True` on success |
| `_farm_ee_geometry(grid_gdf)` | Converts grid extent to `ee.Geometry.Rectangle` in EPSG:4326 |
| `fetch_optical_indices(aoi, start, end)` | Returns a clipped Sentinel-2 median composite with optical bands |
| `fetch_sar_indices(aoi, start, end)` | Returns a clipped Sentinel-1 median composite with SAR bands |
| `fetch_sar_with_rolling_start(aoi, start, end)` | Wraps `fetch_sar_indices` with automatic date rolling |
| `fetch_all_rasters(grid_gdf, start, end, ee_project)` | Orchestrates all GEE fetches; returns `{"optical": ..., "sar": ...}` |

---

### Module 4 — Weather Data (Open-Meteo)

Fetches hourly weather data by splitting the date range between the **Archive API** (historical) and the **Forecast API** (future up to 16 days).

#### API Endpoints

| API | URL | Date Coverage |
|-----|-----|---------------|
| Archive | `https://archive-api.open-meteo.com/v1/archive` | Historical (before today) |
| Forecast | `https://api.open-meteo.com/v1/forecast` | Today + up to 16 days |

#### Weather Variables

| Short Name | Archive API Variable | Forecast API Variable | Unit |
|------------|---------------------|----------------------|------|
| `rh` | `relative_humidity_2m` | `relative_humidity_2m` | % |
| `t2m` | `temperature_2m` | `temperature_2m` | °C |
| `precip` | `precipitation` | `precipitation` | mm |
| `soil_moist` | `soil_moisture_0_to_7cm` | `soil_moisture_0_to_1cm` | m³/m³ |
| `soil_temp` | `soil_temperature_0_to_7cm` | `soil_temperature_0cm` | °C |
| `et` → `et_actual` | `et0_fao_evapotranspiration` | `et0_fao_evapotranspiration` | mm |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `clean_weather_data(values, var_name)` | Sanitises raw API values (handles NaN, strings, etc.) |
| `fetch_weather_from_api(api_url, api_type, lat, lon, start, end)` | Low-level HTTP request to a specific endpoint |
| `fetch_and_process_weather_data(lat, lon, start, end)` | Orchestrates archive + forecast fetching, deduplication, and formatting |
| `fetch_weather(lat, lon, start, end)` | Alias for `fetch_and_process_weather_data` |

---

### Module 5 — Zonal Statistics

Computes **mean** and **median** of every raster index for each grid cell via `ee.Image.reduceRegions`.

Each data source (optical, SAR) is processed independently using its native pixel resolution so that one missing source does not block the others.

**Key Functions:**

| Function | Description |
|----------|-------------|
| `_grid_to_ee_fc(grid_gdf)` | Converts grid GeoDataFrame to `ee.FeatureCollection` (EPSG:4326) |
| `_reduce_single_band(image, band_name, fc, scale)` | Runs mean + median `reduceRegions` for a single band |
| `_nan_rows_for_bands(band_names, grid_gdf)` | Generates mock placeholder rows when a data source was unavailable |
| `compute_zonal_stats(rasters, grid_gdf)` | Returns DataFrame `[grid_id, parameter, mean, median]` |

---

### Module 6 — Decision Matrix

Pivots zonal stats to a wide table (rows = `grid_id`, columns = parameter) and broadcasts weather parameter means across all grids, using the **mean** value as the representative statistic.

**Function:** `build_decision_matrix(zonal_df, weather_df)` → `DataFrame`

---

### Module 6b — Derived Indices

Computes 13 derived agro-meteorological and drought indices from existing remote-sensing and weather columns.

| # | Index | Full Name | Cluster | Formula / Logic |
|---|-------|-----------|---------|----------------|
| 1 | `nddi` | Normalized Difference Drought Index | Water_Drought | (NDVI − NDMI) / (NDVI + NDMI), clipped [0, 1] |
| 2 | `swdi` | Soil Water Deficit Index | Water_Drought | 1 − (soil_moist / 0.5), clipped [0, 1]; crop-specific trigger > p |
| 3 | `cmi` | Crop Moisture Index | Water_Drought | (precip − ET) / max(\|ET\|, 0.1), clipped [−3, 3] |
| 4 | `ai_dm` | Aridity Index (De Martonne) | Water_Drought | precip / (t2m + 10) |
| 5 | `vci` | Vegetation Condition Index | Water_Drought | 100 × (NDVI − NDVI_min) / (NDVI_max − NDVI_min) |
| 6 | `tci` | Temperature Condition Index | Water_Drought | 100 × (LSTmax − LST) / (LSTmax − LSTmin) |
| 7 | `vhi` | Vegetation Health Index | Water_Drought | 0.5 × VCI + 0.5 × TCI |
| 8 | `spi` | Standardized Precipitation Index | Water_Drought | (precip - historical_precip_mean) / historical_precip_sd, clipped [-2, 2] |
| 9 | `spei` | Standardized Precipitation Evapotranspiration Index | Water_Drought | ((precip - ET) - historical_water_balance_mean) / historical_water_balance_sd, clipped [-2, 2] |
| 10 | `gdd` | Growing Degree Days | Agro_Meteo | Σ max(0, T_hourly − T_base) / 24 |
| 11 | `crti` | Cumulative Rainfall-Temperature Index | Agro_Meteo | sum(precip across all grids), missing/non-numeric precip counts as 0 |
| 12 | `rwi` | Relative Weather Index | Agro_Meteo | (t2m - historical_t2m_mean) / historical_t2m_sd, clipped [-2, 2] |
| 13 | `payout` | Index Insurance Payout Trigger | Agro_Meteo | 1 if drought or heat stress, else 0 |

SPI, SPEI, and RWI are standardized with sample standard deviation from Open-Meteo historical daily archive data for the same calendar window as the analysis request. The baseline is computed dynamically from previous years, up to 30 years when available, with at least 10 valid yearly samples required.

#### GDD Base Temperatures by Crop Group

| Crop Group Prefix | T_base (°C) |
|-------------------|-------------|
| `cereals_c3` | 5.0 |
| `cereals_c4` | 10.0 |
| `legumes` | 5.0 |
| `tubers` | 7.0 |
| `oilseeds` | 5.0 |
| `fruits` | 10.0 |
| `vegetables` | 5.0 |

---

### Module 7 — MCDA / Composite Performance Index (CPI)

Computes the Composite Performance Index for each grid cell within each cluster:

1. **Normalise** each parameter to [0, 1] using min/max from the advisory thresholds
2. **Equal-weight average** across parameters in each cluster

**Function:** `compute_cpi(decision_matrix, crop_category)` → `DataFrame [grid_id, cluster, cpi_score]`

---

### Module 8 — Classification & Advisory Lookup

For every grid × parameter combination:

1. **Classifies** as `Low`, `Moderate`, or `High` using threshold range strings
2. **Looks up** the corresponding crop-specific advisory action

**Range parsing logic:**

| Format | Meaning |
|--------|---------|
| `<0.4` | Value below 0.4 |
| `0.4-0.8` | Value between 0.4 and 0.8 |
| `>0.8` | Value above 0.8 |

**Condition → Action mapping:**

| Condition | Action column used |
|-----------|--------------------|
| Low | `low_action` |
| Moderate | `moderate_action` |
| High | `high_action` |
| Unknown | `critical_action` |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `classify_and_advise(dm, crop_category)` | Returns `[grid_id, cluster, parameter, value, condition, recommended_action]` |
| `generate_concise_cluster_summary(advisory_df, cpi_df)` | Aggregates to 5 cluster-level summaries |
| `generate_farm_wide_advice(cluster_summary_df)` | Synthesizes a single concise action string |

---

### Module 8b — GeoJSON Enrichment

Enriches the grid GeoJSON with parameter values and conditions from the advisory report.

Each grid feature will carry:
- `<param>` — numeric value
- `<param>_condition` — Low / Moderate / High

**Function:** `merge_advisory_into_grid_geojson(advisory_df, grid_gdf, output_dir, farm_id, date_tag)` → path to `.geojson`

---

### Module 9 — Outputs

#### Files Generated Per Farm

| File | Description |
|------|-------------|
| `insights_summary_farm<ID>_<date_tag>.csv` | Wide-format merged CPI + advisory pivot per grid |
| `advisory_report_raw_farm<ID>_<date_tag>.csv` | Raw long-format advisory (grid × parameter) |
| `cpi_summary_farm<ID>_<date_tag>.csv` | CPI scores per grid × cluster |
| `concise_advisory_farm<ID>_<date_tag>.csv` | 5-row cluster-level summary |
| `farm_action_plan_farm<ID>_<date_tag>.txt` | Single-line farm-wide action advice |
| `hourly_weather_farm<ID>_<date_tag>.csv` | Hourly weather time series |
| `farm_weather_summary_farm<ID>_<date_tag>.csv` | Aggregated weather summary (means/sums) |
| `grid_farm<ID>_<date_tag>.geojson` | Enriched grid GeoJSON (30 params × 2 attrs) |
| `<param>_farm<ID>_<start>_<end>.png` | Individual weather line graphs per parameter |

#### Aggregate Files (Root Output Folder)

| File | Description |
|------|-------------|
| `all_farms_daily_summary.csv` | Daily weather stats per farm per date |
| `all_farms_<param>_comparison.png` | Cross-farm comparison chart per parameter |
| `param_comparison_farm<ID>.csv` | Parameter values compared across grid sizes |

#### Weather Graph Style

- **Hourly values:** Blue line with small circle markers (`α=0.5`)
- **Daily mean/total:** Red solid line with square markers
- Precipitation uses **daily total**; all other parameters use **daily mean**

---

## Analytical Clusters

The pipeline groups all 30 parameters into 5 expert-defined analytical clusters:

| Cluster | Parameters |
|---------|------------|
| **Structural** | `ndvi`, `evi`, `savi`, `rvi`, `dprvi`, `dpsvi`, `csi` |
| **Chlorophyll** | `gndvi`, `ndre` |
| **Water_Drought** | `ndmi`, `swdi`, `cmi`, `ai_dm`, `vci`, `tci`, `vhi`, `nddi`, `spi`, `spei`, `rfdi` |
| **Environmental** | `t2m`, `rh`, `soil_moist`, `soil_temp` |
| **Agro_Meteo** | `crti`, `gdd`, `rwi`, `payout`, `precip`, `et_actual` |

---

## Parameter Reference

### Full Names (Abbreviation Lookup)

| Abbreviation | Full Name |
|-------------|-----------|
| `t2m` | Air temperature at 2 meters height |
| `rh` | Relative humidity |
| `soil_moist` | Volumetric soil moisture content |
| `soil_temp` | Soil temperature (2-4 inch depth) |
| `precip` | Total cumulative precipitation |
| `et_actual` | Actual Evapotranspiration (water loss from soil and plant) |
| `ndvi` | Normalized Difference Vegetation Index |
| `evi` | Enhanced Vegetation Index |
| `savi` | Soil Adjusted Vegetation Index |
| `gndvi` | Green Normalized Difference Vegetation Index |
| `ndre` | Normalized Difference Red Edge Index |
| `ndmi` | Normalized Difference Moisture Index |
| `rvi` | Radar Vegetation Index (SAR) |
| `dprvi` | Dual-Pol Radar Vegetation Index (SAR) |
| `dpsvi` | Dual-Pol SAR Vegetation Index |
| `rfdi` | Radar Forest Degradation Index (SAR) |
| `csi` | Cross-pol Scattering Index (SAR) |
| `swdi` | Soil Water Deficit Index |
| `cmi` | Crop Moisture Index |
| `ai_dm` | Aridity Index (De Martonne) |
| `vci` | Vegetation Condition Index |
| `tci` | Temperature Condition Index |
| `vhi` | Vegetation Health Index |
| `nddi` | Normalized Difference Drought Index |
| `spi` | Standardized Precipitation Index |
| `spei` | Standardized Precipitation Evapotranspiration Index |
| `crti` | Cumulative Rainfall-Temperature Index |
| `gdd` | Growing Degree Days |
| `rwi` | Relative Weather Index |
| `payout` | Index Insurance Payout Trigger |

---

## Advisory Thresholds

### SAR Index Thresholds (Same for All Crop Categories)

| Parameter | Min | Max | Optimal | Low Range | Moderate Range | High Range |
|-----------|-----|-----|---------|-----------|----------------|------------|
| `rvi` | 0.0 | 1.3 | 0.5–1.0 | <0.3 | 0.3–0.8 | >0.8 |
| `dprvi` | 0.0 | 0.7 | 0.25–0.5 | <0.15 | 0.15–0.45 | >0.45 |
| `dpsvi` | 0.0 | 0.5 | 0.05–0.25 | <0.03 | 0.03–0.2 | >0.2 |
| `rfdi` | 0.0 | 1.0 | 0.3–0.6 | <0.2 | 0.2–0.6 | >0.6 |
| `csi` | 0.0 | 0.5 | 0.1–0.3 | <0.05 | 0.05–0.25 | >0.25 |

### Derived Index Thresholds

| Parameter | Min | Max | Optimal | Low Range | Moderate Range | High Range |
|-----------|-----|-----|---------|-----------|----------------|------------|
| `savi` | 0.0 | 1.5 | 0.5–0.8 | <0.3 | 0.3–0.7 | >0.7 |
| `cmi` | −3.0 | 3.0 | 0–1 | <−1 | −1 to 1 | >1 |
| `ai_dm` | 0.0 | 60.0 | 15–30 | <10 | 10–30 | >30 |
| `crti` | 0.0 | 2000.0 | 300–800 | <200 | 200–800 | >800 |

#### SWDI Crop-Specific Triggers

| Crop Category | Crop Reference | p | High Trigger |
|---|---|---:|---|
| `cereals_c3_temperate` | Wheat / Barley | 0.55 | `>0.55` |
| `cereals_c4_tropical` | Maize | 0.55 | `>0.55` |
| `legumes_cool_season` | Peas | 0.35 | `>0.35` |
| `legumes_warm_season` | Soybeans | 0.50 | `>0.50` |
| `tubers_temperate` | Potato | 0.35 | `>0.35` |
| `tubers_tropical` | Cassava year 1 default | 0.35 | `>0.35` |
| `oilseeds_warm` | Sunflower | 0.45 | `>0.45` |
| `oilseeds_cool` | Canola / Rapeseed | 0.60 | `>0.60` |
| `fruits_orchard` | Apples / Pears | 0.50 | `>0.50` |
| `fruits_tropical` | Mango default | 0.45 | `>0.45` |
| `vegetables_warm` | Tomato | 0.40 | `>0.40` |
| `vegetables_cool` | Lettuce | 0.30 | `>0.30` |
| `gdd` | 0.0 | 500.0 | 50–250 | <50 | 50–250 | >250 |
| `rwi` | −2.0 | 2.0 | −0.5 to 0.5 | <−0.5 | −0.5 to 0.5 | >0.5 |
| `payout` | 0.0 | 1.0 | 0 | <0.5 | 0.5 | >0.5 |

### Per-Crop Thresholds

Base thresholds for optical indices and weather parameters vary by crop category. See [Supported Crop Categories](#supported-crop-categories) for the full list. Each category defines thresholds and actionable advisories for:

`t2m`, `rh`, `soil_moist`, `ndvi`, `ndmi`, `evi`, `ndre`, `gndvi`, `vci`, `tci`, `vhi`, `nddi`, `spi`, `spei`, `soil_temp`, `precip`, `et_actual`

---

## Supported Crop Categories

**Note:** The pipeline natively supports 76+ specific crops hardcoded within the script. The interactive start menu will dynamically display all crops (e.g., Wheat, Walnut, Tomato) and generate a unique alias for easy selection. The chosen crop is then automatically linked to one of the following base categories to determine the appropriate thresholds:

| Key | Description |
|-----|-------------|
| `cereals_c3_temperate` | C3 cereals in temperate climates (wheat, barley, oats) |
| `cereals_c4_tropical` | C4 cereals in tropical climates (maize, sorghum, millet) |
| `legumes_cool_season` | Cool-season legumes (peas, lentils, chickpeas) |
| `legumes_warm_season` | Warm-season legumes (soybeans, groundnuts) |
| `tubers_temperate` | Temperate tubers (potatoes) |
| `tubers_tropical` | Tropical tubers (cassava, taro, yams) |
| `oilseeds_warm` | Warm-season oilseeds (sunflower, soybeans) |
| `oilseeds_cool` | Cool-season oilseeds (canola, rapeseed) |
| `fruits_orchard` | Orchard fruits (apples, pears, stone fruits) |
| `fruits_tropical` | Tropical fruits (mangoes, bananas, papayas) |
| `vegetables_warm` | Warm-season vegetables (tomatoes, peppers, eggplant) |
| `vegetables_cool` | Cool-season vegetables (lettuce, spinach, broccoli) |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `numpy` | Numerical operations |
| `pandas` | Data manipulation and CSV I/O |
| `geopandas` | Geospatial DataFrames |
| `matplotlib` | Weather graph generation |
| `requests` | Open-Meteo API calls |
| `shapely` | Geometry operations (grid tiling) |
| `pyproj` | CRS estimation (UTM zone) |
| `sqlalchemy` | PostGIS database connectivity |
| `earthengine-api` (`ee`) | Google Earth Engine access |
| `table_logger` | Console parameter logging |

> **Note:** The script patches deprecated NumPy aliases (`np.float`, `np.int`, etc.) at import time for compatibility with `table_logger` and older libraries.

---

## Output File Structure

```
<base_output>/
└── <date_tag>_<timestamp>/
    ├── farm<ID>_<date_tag>/
    │   ├── insights_summary_farm<ID>_<date_tag>.csv
    │   ├── advisory_report_raw_farm<ID>_<date_tag>.csv
    │   ├── cpi_summary_farm<ID>_<date_tag>.csv
    │   ├── concise_advisory_farm<ID>_<date_tag>.csv
    │   ├── farm_action_plan_farm<ID>_<date_tag>.txt
    │   ├── hourly_weather_farm<ID>_<date_tag>.csv
    │   ├── farm_weather_summary_farm<ID>_<date_tag>.csv
    │   ├── grid_farm<ID>_<date_tag>.geojson
    │   ├── t2m_farm<ID>_<start>_<end>.png
    │   ├── rh_farm<ID>_<start>_<end>.png
    │   ├── precip_farm<ID>_<start>_<end>.png
    │   ├── soil_moist_farm<ID>_<start>_<end>.png
    │   ├── soil_temp_farm<ID>_<start>_<end>.png
    │   └── et_farm<ID>_<start>_<end>.png
    ├── all_farms_daily_summary.csv
    ├── all_farms_t2m_comparison.png
    ├── all_farms_rh_comparison.png
    ├── all_farms_precip_comparison.png
    ├── all_farms_soil_moist_comparison.png
    ├── all_farms_soil_temp_comparison.png
    └── all_farms_et_comparison.png
```
