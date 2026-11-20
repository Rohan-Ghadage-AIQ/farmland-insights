# Farmland Insights & Crop Analysis: Core Logic Requirements

**Purpose:** This document outlines the pure scientific formulas, data inputs, agronomic thresholds, and business logic required to build the Farmland Insights pipeline. It is entirely agnostic of the underlying codebase. Developers should use these specifications as the singular source of truth for writing isolated unit tests and implementing analytic logic.

---

## 1. System Inputs

The system must accept the following core inputs to begin an analysis:

- **Farm Boundary:** A standard spatial polygon (e.g., GeoJSON) defining the physical extent of the farm.
- **Start Date & End Date:** Date boundaries for historical data and near-future forecasting (max 16 days forward).
- **Crop Category:** A base biological category string (e.g., `cereals_c3_temperate`, `vegetables_warm`) to load the correct agronomic thresholds.
- **Grid Size:** The spatial resolution in physical meters (Default: **50m**) used to tile the farm boundary into manageable cells.

---

## 2. Telemetry Sources & Formulas

Data is aggregated per grid cell from two primary telemetry sources: **Weather APIs (Open-Meteo)** and **Satellite Imagery (Google Earth Engine)**.

### 2.1 Variables: Weather Data
Raw hourly weather values must be fetched, sanitized, and averaged for the given date range.
- `t2m`: Air temperature at 2 meters height (°C)
- `rh`: Relative humidity (%)
- `precip`: Total cumulative precipitation (mm)
- `soil_moist`: Volumetric soil moisture content (m³/m³)
- `soil_temp`: Soil temperature (°C)
- `et_actual`: Actual Evapotranspiration (mm)
- `lst`: Landsat-derived land surface temperature (°C)

### 2.2 Variables: Sentinel-2 (Optical Imagery)
*Resolution: 10m native. Cloud filter threshold must be < 30%.*
- **NDVI** (Normalized Difference Vegetation Index): `(NIR − Red) / (NIR + Red)`
- **EVI** (Enhanced Vegetation Index): `2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)`
- **SAVI** (Soil Adjusted Vegetation Index): `1.5 × (NIR − Red) / (NIR + Red + 0.5)`
- **GNDVI** (Green NDVI): `(NIR − Green) / (NIR + Green)`
- **NDRE** (Normalized Difference Red Edge): `(NIR_narrow − RE1) / (NIR_narrow + RE1)`
- **NDMI** (Normalized Difference Moisture Index): `(NIR − SWIR1) / (NIR + SWIR1)`

### 2.2.1 Variables: Landsat 8/9 Thermal Imagery
*Resolution: 30m resampled thermal output. Landsat 8 is used from 2013-02-11 until the Landsat 9 launch date; Landsat 9 is used from 2021-09-27 onward.*
- **LST** (Land Surface Temperature): derived from Band 10 thermal DN using scene radiance and thermal constants, with Bands 4/5 used for NDVI-based emissivity.

### 2.3 Variables: Sentinel-1 (Radar/Microwave Imagery)
*Resolution: 10m native. Aggregation: Median composite. If no imagery exists in the window, roll back dates dynamically until an image is found.*
- **RVI** (Radar Vegetation Index): `4 × VH / (VV + VH)`
- **DPRVI** (Dual-Pol Radar Vegetation Index): `1 − (VV / (VV + VH))`
- **DPSVI** (Dual-Pol SAR Vegetation Index): `(VV − VH) × VH`
- **RFDI** (Radar Forest Degradation Index): `(VV − VH) / (VV + VH)`
- **CSI** (Cross-pol Scattering Index): `VH / VV`

---

## 3. Derived Analytical Indices

Raw telemetry must be mathematically combined to form the following advanced indices for each grid cell:

| Index | Name | Formula / Logic |
|---|---|---|
| `nddi` | Normalized Difference Drought | `(NDVI − NDMI) / (NDVI + NDMI)`, clipped to [0, 1] |
| `swdi` | Soil Water Deficit Index | `1 − (soil_moist / 0.5)`, clipped to [0, 1] |
| `cmi` | Crop Moisture Index | `(precip − ET) / max(\|ET\|, 0.1)`, clipped to [−3, 3] |
| `ai_dm` | Aridity Index (De Martonne)| `precip / (t2m + 10)` |
| `vci` | Vegetation Condition Index | `100 × (NDVI − NDVI_min) / (NDVI_max − NDVI_min)` |
| `tci` | Temperature Condition Index| `100 × (LSTmax − LST) / (LSTmax − LSTmin)` |
| `vhi` | Vegetation Health Index | `0.5 × VCI + 0.5 × TCI` |
| `spi` | Standardized Precipitation | `(precip - historical_precip_mean) / historical_precip_sd`, clipped to [-2, 2] |
| `spei` | Standardized Precip-Evapo | `((precip - ET) - historical_water_balance_mean) / historical_water_balance_sd`, clipped to [-2, 2] |
| `gdd` | Growing Degree Days | `Σ max(0, T_hourly − T_base) / 24` |
| `crti` | Cumul. Rain-Temp Index | `sum(precip across all grids)`, missing/non-numeric precip counts as `0` |
| `rwi` | Relative Weather Index | `(t2m - historical_t2m_mean) / historical_t2m_sd`, clipped to [-2, 2] |
| `payout` | Insurance Payout Trigger | `1` if drought or heat stress, else `0` |

SPI, SPEI, and RWI use Open-Meteo historical daily archive data over the same calendar window as the analysis request. The baseline is calculated dynamically from previous years, up to 30 years when available, with at least 10 valid yearly samples required for a standard deviation.

#### SWDI Crop-Specific Triggers

SWDI uses crop-specific FAO-56 depletion fraction (`p`) triggers. Values above the trigger are classified as High.

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

#### GDD Thresholds (`T_base`)
- `cereals_c3_*`, `legumes_*`, `oilseeds_*`, `vegetables_*`: **5.0 °C**
- `tubers_*`: **7.0 °C**
- `cereals_c4_*`, `fruits_*`: **10.0 °C**

---

## 4. Multi-Criteria Decision Analysis (MCDA) & CPI

All 30 parameters above must be strictly grouped into **Five Analytical Clusters**:

1. **Structural:** `ndvi`, `evi`, `savi`, `rvi`, `dprvi`, `dpsvi`, `csi`
2. **Chlorophyll:** `gndvi`, `ndre`
3. **Water_Drought:** `ndmi`, `swdi`, `cmi`, `ai_dm`, `vci`, `tci`, `vhi`, `nddi`, `spi`, `spei`, `rfdi`
4. **Environmental:** `t2m`, `lst`, `rh`, `soil_moist`, `soil_temp`
5. **Agro_Meteo:** `crti`, `gdd`, `rwi`, `payout`, `precip`, `et_actual`

### CPI (Composite Performance Index) Calculation Rules:
For each grid cell, the system must generate a CPI score for each of the 5 clusters above:
1. Identify the min and max bounds for the specific crop category (from the Advisory matrix).
2. **Normalize** every variable in the cluster to a `0.0` to `1.0` scale.
3. Apply an **Equal-weight average** across the normalized parameters within that cluster.
4. Output a final float (e.g., `Cluster: Structural, CPI: 0.85`).

---

## 5. Decision Rules & Threshold Logic

In addition to the CPI score, every absolute metric must be evaluated against standard definitions to determine action advisories. 
The system must parse strings in the config matrix (`<0.4`, `0.4-0.8`, `>0.8`) and assign one of the following states:

- **Condition: `Low`** -> Return `low_action` text.
- **Condition: `Moderate`** -> Return `moderate_action` text.
- **Condition: `High`** -> Return `high_action` text.

*(Note: The full numerical values for Min, Max, Optimal, and action strings per crop category will be isolated into a static JSON configuration file or Database, accessible via the central threshold repository).*

---

## 6. Expected System Output

The system must output a structured JSON response (or GeoJSON) rather than relying on local file disk saves (No PDFs, PNGs, or raw CSVs saved to local system storage).

The final API payload must include:
1. `grid_id`: The spatial polygon geometry for the specific 50m cell.
2. `raw_metrics`: A dictionary of all computed averages (e.g., `{"ndvi": 0.54, "t2m": 22.1}`).
3. `cpi_scores`: A dictionary mapping the 5 clusters to their `0.0 - 1.0` aggregated index score.
4. `advisories`: A dictionary of triggered human-readable action strings based on threshold violations.
