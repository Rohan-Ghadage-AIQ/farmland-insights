"""
Drop-in replacement for gee_service that fetches satellite imagery from open
STAC catalogues (Microsoft Planetary Computer) and ASF instead of Google
Earth Engine.

Public API
----------
fetch_stac_zonal_metrics   – same signature and return types as
                             gee_service.fetch_gee_zonal_metrics

The rest of the analysis pipeline (weather, CPI scoring, advisories) is
unchanged.

Data sources
~~~~~~~~~~~~
* Sentinel-2 L2A (optical):  Planetary Computer earth-search  →  COG bands on S3
* Landsat 8/9 C2-L2 (LST):   Planetary Computer earth-search  →  COG bands on S3
* Sentinel-1 GRD (SAR):       Planetary Computer earth-search  →  COG bands on S3
                               (falls back to ASF search if STAC has no data)

No credentials are needed – all data is free & open on AWS.
"""

from __future__ import annotations

import asyncio
import math
import os
import socket
import sys
import warnings
from collections.abc import Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
from shapely.geometry import box, mapping

from app.config import get_settings
from app.dataclasses import GridMetrics, SarFetchResult
from app.exceptions import DomainError
from app.logging import get_logger
from app.services.imagery import SatelliteAcquisitions, merge_optical_cloud

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"

SENTINEL2_COLLECTION = "sentinel-2-l2a"
LANDSAT_C2_L2_COLLECTION = "landsat-c2-l2"
SENTINEL1_RTC_COLLECTION = "sentinel-1-rtc"
ENABLE_STAC_SAR = True

DEFAULT_CLOUD_COVER_MAX = 30
DEFAULT_ROLLBACK_DAYS = 3
SENTINEL1_FIRST_ACQUISITION = date(2014, 10, 3)

OPTICAL_INDEX_BANDS: tuple[str, ...] = (
    "ndvi", "evi", "savi", "gndvi", "ndre", "ndmi", "ndwi", "ndwi_farmonaut",
)
SAR_INDEX_BANDS: tuple[str, ...] = ("rvi", "dprvi", "dpsvi", "rfdi", "csi")
LANDSAT_LST_BANDS: tuple[str, ...] = ("lst",)
# Sentinel-2 Scene Classification classes that are not a clear view of the ground: cloud shadow,
# medium and high probability cloud, thin cirrus (same as gee_service).
SENTINEL2_CLOUD_SCL_CLASSES: tuple[int, ...] = (3, 8, 9, 10)

# Rasterio / STAC imports are deferred so this module can be imported
# even when the geo-stack is not fully installed (e.g. in unit tests).


def _use_bundled_proj_data() -> None:
    """
    Let rasterio use the PROJ database shipped inside its wheel.

    A machine-wide ``PROJ_LIB`` / ``PROJ_DATA`` (PostGIS and QGIS installers set one) otherwise
    wins, and an older ``proj.db`` there makes every reprojection fail with "EPSG code is
    unknown": every scene is skipped and the analysis silently has no satellite data. Variables
    pointing inside this Python environment are left alone.
    """
    prefix = Path(sys.prefix).resolve()
    for name in ("PROJ_DATA", "PROJ_LIB"):
        value = os.environ.get(name)
        if value and prefix not in Path(value).resolve().parents:
            logger.info("stac_ignoring_external_proj_data", extra={"variable": name, "path": value})
            # Optical and radar scenes are read in parallel threads that both get here; the one that
            # comes second must not fail because the first already removed the variable.
            os.environ.pop(name, None)


def _lazy_import_rasterio():
    try:
        _use_bundled_proj_data()
        import rasterio  # type: ignore[import-untyped]
        from rasterio.features import rasterize  # noqa: F401

        return rasterio
    except ImportError as exc:
        raise DomainError(
            "rasterio is required for STAC-based satellite data fetching.",
            details={"error": str(exc)},
        ) from exc


def _lazy_import_pystac_client():
    try:
        from pystac_client import Client  # type: ignore[import-untyped]
        return Client
    except ImportError as exc:
        raise DomainError(
            "pystac-client is required for STAC-based satellite data fetching.",
            details={"error": str(exc)},
        ) from exc


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _grid_bbox(grid_geo_df: gpd.GeoDataFrame) -> list[float]:
    """Return [west, south, east, north] from a grid GeoDataFrame."""
    gdf = grid_geo_df.to_crs(epsg=4326)
    return list(gdf.total_bounds)


def _grid_to_4326(grid_geo_df: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    return grid_geo_df.to_crs(epsg=4326)


# ---------------------------------------------------------------------------
# STAC search helpers
# ---------------------------------------------------------------------------

_network_configured = False


def _configure_network() -> None:
    """
    Make Python's HTTP stack use IPv4 only, once per process (unless STAC_PREFER_IPV4 is false).

    Some networks advertise an IPv6 address for a host but cannot route it. urllib3 then waits out
    the whole connect timeout (about 21 s) on every new connection before trying IPv4, which made
    each analysis spend over a minute just connecting. This only affects `requests`/urllib3, which
    `pystac-client` and `planetary-computer` use; GDAL (curl) already falls back quickly.
    """
    global _network_configured
    if _network_configured:
        return
    _network_configured = True
    if not get_settings().stac_prefer_ipv4:
        return
    from urllib3.util import connection  # type: ignore[import-untyped]

    connection.allowed_gai_family = lambda: socket.AF_INET


@lru_cache(maxsize=1)
def _catalog() -> Any:
    """
    The signed STAC client, opened once and reused. Opening it and fetching the first signing token
    each cost a network round trip, and the token is cached by `planetary-computer` afterwards.
    """
    _configure_network()
    Client = _lazy_import_pystac_client()
    try:
        import planetary_computer  # type: ignore[import-untyped]
    except ImportError as exc:
        raise DomainError(
            "planetary-computer is required for STAC-based satellite data fetching.",
            details={"error": str(exc)},
        ) from exc
    return Client.open(STAC_API_URL, modifier=planetary_computer.sign_inplace)


def _stac_search(
    collection: str,
    bbox: list[float],
    start_date: date,
    end_date: date,
    max_cloud_cover: int | None = None,
    max_items: int = 500,
) -> list[Any]:
    """Search a STAC collection and return a list of pystac Items."""
    query_params: dict[str, Any] = {}
    if max_cloud_cover is not None:
        query_params["eo:cloud_cover"] = {"lt": max_cloud_cover}

    search = _catalog().search(
        collections=[collection],
        bbox=bbox,
        # Explicit times: a bare end date would be read as its first instant and drop that day.
        datetime=f"{start_date.isoformat()}T00:00:00Z/{end_date.isoformat()}T23:59:59Z",
        query=query_params if query_params else None,
        max_items=max_items,
        limit=100,  # page size; the search follows pages up to max_items
    )
    return list(search.items())


# ---------------------------------------------------------------------------
# Raster reading + zonal stats
# ---------------------------------------------------------------------------

def _read_band_clipped(
    href: str,
    aoi_bounds: tuple[float, float, float, float],
    target_shape: tuple[int, int] | None = None,
    *,
    categorical: bool = False,
):
    """
    Read one COG band windowed to the AOI. ``categorical`` bands (class codes such as SCL) are
    resampled with nearest neighbour so no invented in-between class appears.

    *aoi_bounds* are lon/lat (EPSG:4326) and are transformed into the raster's
    own CRS before windowing. Returns ``(array, transform, crs)`` where the
    transform matches the returned array (including any resampling to
    *target_shape*). The array is empty if the AOI misses the raster.
    """
    rasterio = _lazy_import_rasterio()
    from affine import Affine  # type: ignore[import-untyped]
    from rasterio.warp import transform_bounds  # type: ignore[import-untyped]
    from rasterio.windows import Window, from_bounds, transform as window_transform  # type: ignore[import-untyped]

    with rasterio.Env(**_GDAL_OPTIONS), rasterio.open(href) as src:
        left, bottom, right, top = transform_bounds("EPSG:4326", src.crs, *aoi_bounds)
        window = from_bounds(left, bottom, right, top, transform=src.transform)
        window = window.round_offsets().round_lengths()
        try:
            window = window.intersection(Window(0, 0, src.width, src.height))
        except Exception:
            return np.array([], dtype=np.float32), src.transform, src.crs
        if window.width < 1 or window.height < 1:
            return np.array([], dtype=np.float32), src.transform, src.crs

        tf = window_transform(window, src.transform)
        if target_shape is not None:
            data = src.read(
                1,
                window=window,
                out_shape=target_shape,
                resampling=(
                    rasterio.enums.Resampling.nearest
                    if categorical
                    else rasterio.enums.Resampling.bilinear
                ),
            )
            tf = tf * Affine.scale(window.width / target_shape[1], window.height / target_shape[0])
        else:
            data = src.read(1, window=window)

        return data.astype(np.float32), tf, src.crs


# Remote COG reads are dominated by network round trips, so trim the avoidable ones.
_GDAL_OPTIONS = {
    # Do not list the sibling files of every COG just to open it.
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    # Fetch neighbouring byte ranges in one request, and share one connection.
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "VSI_CACHE": "TRUE",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "1",
}


def _read_bands(
    hrefs: Mapping[str, str],
    aoi_bounds: tuple[float, float, float, float],
    *,
    native: Sequence[str],
    resampled: Sequence[str] = (),
):
    """
    Read several bands of one scene at the same time (it is the network wait that is slow).

    ``native`` bands share one grid, the first one listed is the reference. ``resampled`` bands come
    at a coarser resolution and are read in a second parallel step, resampled onto the reference grid.
    Returns ``(arrays_by_name, transform, crs, shape)``, or None when the AOI misses the scene.
    """
    reference = native[0]
    workers = len(native) + len(resampled)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        first = {name: pool.submit(_read_band_clipped, hrefs[name], aoi_bounds) for name in native}
        results = {name: future.result() for name, future in first.items()}
        ref_array, transform, crs = results[reference]
        if ref_array.size == 0:
            return None
        shape = ref_array.shape

        arrays: dict[str, np.ndarray] = {}
        redo = list(resampled)
        for name, (array, _, _) in results.items():
            if array.shape == shape:
                arrays[name] = array
            else:
                redo.append(name)
        second = {
            name: pool.submit(_read_band_clipped, hrefs[name], aoi_bounds, shape) for name in redo
        }
        for name, future in second.items():
            arrays[name] = future.result()[0]
    return arrays, transform, crs, shape


def _rasterize_grid(grid_4326: gpd.GeoDataFrame, transform: Any, crs: Any, shape: tuple[int, int]) -> np.ndarray:
    """
    Burn grid_id values into a raster of *shape*, in the raster's own CRS.

    Returns an int32 array holding the grid_id of the cell each pixel falls in,
    or 0 outside any cell.
    """
    _lazy_import_rasterio()
    from rasterio.features import rasterize  # type: ignore[import-untyped]

    projected = grid_4326.to_crs(crs)
    shapes = [(row.geometry, int(row.grid_id)) for row in projected.itertuples(index=False)]
    if not shapes:
        return np.zeros(shape, dtype=np.int32)
    return rasterize(shapes, out_shape=shape, transform=transform, fill=0, dtype=np.int32)


def _zonal_means(
    bands: dict[str, np.ndarray],
    grid_raster: np.ndarray,
    grid_ids: list[int],
) -> GridMetrics:
    """
    Compute per-grid-cell mean for each named band array.

    *grid_raster* is an int32 raster of grid_ids (0 = outside all cells).
    Returns GridMetrics: {grid_id: {band_name: mean_value}}.
    """
    metrics: GridMetrics = {}
    for gid in grid_ids:
        mask = grid_raster == gid
        if not mask.any():
            continue
        values: dict[str, float] = {}
        for band_name, arr in bands.items():
            if arr.size == 0:
                continue
            # Shapes must match; skip if resampling produced a mismatch
            if arr.shape != grid_raster.shape:
                continue
            cell_values = arr[mask]
            # Filter NaN and zero (nodata)
            valid = cell_values[np.isfinite(cell_values) & (cell_values != 0)]
            if valid.size > 0:
                values[band_name] = round(float(np.mean(valid)), 6)
        if values:
            metrics[gid] = values
    return metrics


# ---------------------------------------------------------------------------
# Sentinel-2 optical indices
# ---------------------------------------------------------------------------

# Which Sentinel-2 L2A asset feeds each colour, with the label and centre wavelength (µm) ESA gives
# that band. The labels are checked against each image's own metadata before any index is computed.
SENTINEL2_BAND_MAP = {
    "nir": "B08", "red": "B04", "green": "B03",
    "blue": "B02", "rededge1": "B05", "swir16": "B11", "swir22": "B12",
}
SENTINEL2_BAND_LABELS = {
    "B02": ("blue", 0.490), "B03": ("green", 0.560), "B04": ("red", 0.665),
    "B05": ("rededge", 0.705), "B08": ("nir", 0.842), "B11": ("swir16", 1.610),
    "B12": ("swir22", 2.190),
}


class BandMappingError(ValueError):
    """An image's band metadata does not match the band the code reads for that colour."""


def check_sentinel2_band_labels(item: Any) -> None:
    """
    Fail if a Sentinel-2 asset is not the band we think it is.

    Checks the asset's ``eo:bands`` label and centre wavelength, and that the file name carries the
    band code (``..._B04_10m.tif``). Assets without metadata are only checked by file name.
    """
    for band in SENTINEL2_BAND_MAP.values():
        asset = item.assets[band]
        expected_name, expected_wavelength = SENTINEL2_BAND_LABELS[band]
        file_name = asset.href.split("?", 1)[0].rsplit("/", 1)[-1]
        if f"_{band}_" not in file_name:
            raise BandMappingError(f"{band} asset points at {file_name}, not a {band} file")
        for info in (getattr(asset, "extra_fields", None) or {}).get("eo:bands") or []:
            name = info.get("name")
            common = info.get("common_name")
            wavelength = info.get("center_wavelength")
            if name not in (None, band):
                raise BandMappingError(f"{band} asset is labelled {name}")
            if common not in (None, expected_name):
                raise BandMappingError(f"{band} should be {expected_name} but is labelled {common}")
            if wavelength is not None and abs(float(wavelength) - expected_wavelength) > 0.02:
                raise BandMappingError(
                    f"{band} should be at {expected_wavelength} µm but is at {wavelength} µm"
                )

def _compute_optical_indices_numpy(
    nir: np.ndarray,
    red: np.ndarray,
    green: np.ndarray,
    blue: np.ndarray,
    red_edge: np.ndarray,
    swir: np.ndarray,
    swir22: np.ndarray,
) -> dict[str, np.ndarray]:
    """
    Compute the same 8 optical indices as gee_service._compute_optical_indices.

    All inputs are float32 arrays of the same shape (surface reflectance
    scaled 0–10 000 or 0–1 depending on the product).
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)

        # Avoid division by zero
        eps = 1e-10

        ndvi = (nir - red) / (nir + red + eps)
        evi = 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1.0 + eps)
        savi = 1.5 * (nir - red) / (nir + red + 0.5 + eps)
        gndvi = (nir - green) / (nir + green + eps)
        ndre = (nir - red_edge) / (nir + red_edge + eps)
        ndmi = (nir - swir) / (nir + swir + eps)
        ndwi = (green - nir) / (green + nir + eps)  # McFeeters: open / standing water
        # The NDWI Farmonaut reports: water held in the crop, from NIR and the 2.2 µm SWIR band.
        ndwi_farmonaut = (nir - swir22) / (nir + swir22 + eps)

    return {
        "ndvi": ndvi, "evi": evi, "savi": savi,
        "gndvi": gndvi, "ndre": ndre, "ndmi": ndmi, "ndwi": ndwi,
        "ndwi_farmonaut": ndwi_farmonaut,
    }


# ---------------------------------------------------------------------------
# Choosing and combining scenes
# ---------------------------------------------------------------------------
#
# One satellite picture says little about a long period: a year of crop growth is not one day. So
# the period is split into equal time slices, the clearest scene of each slice is used, and the
# per-cell values are combined with the median (as the Earth Engine version's median composite did).
# Short periods simply yield fewer scenes, so they behave as before.

MIN_SCENES = 3
MAX_SCENES = 12
DAYS_PER_SCENE = 6
SCENE_WORKERS = 3


def scene_budget(start_date: date, end_date: date) -> int:
    """How many scenes to use for a period: about one per 6 days, between 3 and 12."""
    days = (end_date - start_date).days + 1
    return max(MIN_SCENES, min(MAX_SCENES, math.ceil(days / DAYS_PER_SCENE)))


def _item_date(item: Any) -> date | None:
    when = getattr(item, "datetime", None)
    if when is not None:
        return when.date()
    raw = item.properties.get("datetime")
    if isinstance(raw, str):
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None
    return None


def _cloud_cover(item: Any) -> float:
    return float(item.properties.get("eo:cloud_cover", 100))


def select_scenes(
    items: Sequence[Any],
    start_date: date,
    end_date: date,
    count: int,
    *,
    key: Any,
) -> list[Any]:
    """
    Up to ``count`` scenes spread evenly over the period, in time order.

    With no more scenes than ``count`` all are kept. Otherwise the period is cut into ``count`` equal
    time slices and the best scene (lowest ``key``) of each slice that has any is kept, so a clear
    spell in one month cannot crowd out the rest of the year.
    """
    dated = [(when, item) for item in items if (when := _item_date(item)) is not None]
    if count <= 0 or not dated:
        return []
    dated.sort(key=lambda pair: pair[0])
    if len(dated) <= count:
        return [item for _, item in dated]

    span = (end_date - start_date).days + 1
    slices: dict[int, list[Any]] = {}
    for when, item in dated:
        index = min(count - 1, max(0, (when - start_date).days * count // span))
        slices.setdefault(index, []).append(item)
    return [min(group, key=key) for _, group in sorted(slices.items())]


def median_combine(per_scene: Sequence[GridMetrics]) -> GridMetrics:
    """The median of each band in each grid cell across scenes (a scene missing a value is skipped)."""
    collected: dict[int, dict[str, list[float]]] = {}
    for metrics in per_scene:
        for grid_id, bands in metrics.items():
            for band, value in bands.items():
                collected.setdefault(grid_id, {}).setdefault(band, []).append(value)
    return {
        grid_id: {band: round(float(np.median(values)), 6) for band, values in bands.items()}
        for grid_id, bands in collected.items()
    }


def _map_scenes(per_scene: Any, items: Sequence[Any]) -> list[GridMetrics]:
    """
    Run ``per_scene(item)`` for every scene, a few at a time. A scene that fails is logged and
    skipped so one bad file cannot lose the whole period; if every scene fails the first error is
    raised, so the source is reported as failed instead of silently empty.
    """
    if not items:
        return []
    results: list[GridMetrics] = []
    errors: list[Exception] = []
    with ThreadPoolExecutor(max_workers=min(SCENE_WORKERS, len(items))) as pool:
        futures = [(item, pool.submit(per_scene, item)) for item in items]
        for item, future in futures:
            try:
                results.append(future.result())
            except Exception as exc:  # noqa: BLE001 - one scene must not sink the rest
                errors.append(exc)
                logger.warning(
                    "stac_scene_failed", extra={"scene_id": getattr(item, "id", None), "error": str(exc)}
                )
    if not results and errors:
        raise errors[0]
    return results


def _optical_scene_metrics(
    item: Any,
    aoi_bounds: tuple[float, float, float, float],
    grid_4326: gpd.GeoDataFrame,
    grid_ids: list[int],
) -> GridMetrics:
    """Sentinel-2 indices for one scene, reduced to per-grid-cell means."""
    assets = item.assets
    check_sentinel2_band_labels(item)

    # B08, B04, B03, B02 are 10 m; B05, B11 and B12 are 20 m and get resampled onto the 10 m grid.
    hrefs = {name: assets[band].href for name, band in SENTINEL2_BAND_MAP.items()}
    read = _read_bands(
        hrefs, aoi_bounds, native=["nir", "red", "green", "blue"], resampled=["rededge1", "swir16", "swir22"]
    )
    if read is None:
        return {}
    arrays, ref_tf, ref_crs, target_shape = read
    nir, red, green, blue = arrays["nir"], arrays["red"], arrays["green"], arrays["blue"]
    red_edge, swir, swir22 = arrays["rededge1"], arrays["swir16"], arrays["swir22"]

    # Baseline >= 04.00 adds a -1000 DN offset to surface reflectance.
    baseline = str(item.properties.get("s2:processing_baseline", "0"))
    try:
        dn_offset = -1000.0 if float(baseline) >= 4.0 else 0.0
    except ValueError:
        dn_offset = 0.0
    nir, red, green, blue, red_edge, swir, swir22 = (
        (arr + dn_offset) / 10000.0 for arr in (nir, red, green, blue, red_edge, swir, swir22)
    )

    index_arrays = _compute_optical_indices_numpy(nir, red, green, blue, red_edge, swir, swir22)

    # Drop cloud, cirrus and cloud-shadow pixels, as the Earth Engine path does. A report is built
    # from one chosen pass, so an unmasked cloud would read as a field of failing crop.
    if "SCL" in assets:
        scl = _read_band_clipped(assets["SCL"].href, aoi_bounds, target_shape, categorical=True)[0]
        if scl.shape == target_shape:
            cloudy = np.isin(scl, SENTINEL2_CLOUD_SCL_CLASSES)
            index_arrays = {
                name: np.where(cloudy, np.nan, values) for name, values in index_arrays.items()
            }

    grid_raster = _rasterize_grid(grid_4326, ref_tf, ref_crs, target_shape)
    return _zonal_means(index_arrays, grid_raster, grid_ids)


def _fetch_optical_indices_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
) -> GridMetrics:
    """
    Fetch Sentinel-2 optical indices via STAC/COG.

    Searches Planetary Computer for S2 L2A imagery, uses the clearest scene from each slice of the
    period (see ``select_scenes``), and takes the per-cell median of their indices.
    """
    bbox = _grid_bbox(grid_geo_df)
    grid_4326 = _grid_to_4326(grid_geo_df)
    grid_ids = [int(row.grid_id) for row in grid_4326.itertuples(index=False)]
    aoi_bounds = tuple(bbox)

    items = _stac_search(
        SENTINEL2_COLLECTION, bbox, start_date, end_date,
        max_cloud_cover=max_cloud_cover,
    )
    if not items:
        logger.info("stac_optical_no_scenes", extra={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        })
        return {}

    chosen = select_scenes(
        items, start_date, end_date, scene_budget(start_date, end_date), key=_cloud_cover
    )
    logger.info("stac_optical_scenes_selected", extra={
        "found": len(items),
        "used": len(chosen),
        "scene_ids": [item.id for item in chosen],
    })
    return median_combine(
        _map_scenes(lambda item: _optical_scene_metrics(item, aoi_bounds, grid_4326, grid_ids), chosen)
    )


# ---------------------------------------------------------------------------
# Landsat LST
# ---------------------------------------------------------------------------

def _compute_landsat_lst_numpy(
    thermal_b10: np.ndarray,
    red: np.ndarray,
    nir: np.ndarray,
    scale_factor: float = 0.00341802,
    add_offset: float = 149.0,
) -> dict[str, np.ndarray]:
    """
    Compute Land Surface Temperature in °C from Landsat C2 L2 bands.

    Landsat C2 Level-2 ST_B10 is already surface temperature stored as
    scaled int (K = DN * scale + offset).  We convert to Celsius directly.

    If only Level-1 is available (B10 raw), we fall back to the same
    mono-window LST formula used in gee_service.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)

        # C2 Level-2 surface temperature product: direct conversion
        # ST_B10 scale: 0.00341802, offset: 149.0 → Kelvin
        lst_kelvin = thermal_b10 * scale_factor + add_offset

        # Mask unreasonable temperatures
        max_temp_k = 273.15 + 56.7
        lst_kelvin = np.where(
            (lst_kelvin > 200) & (lst_kelvin <= max_temp_k),
            lst_kelvin,
            np.nan,
        )
        lst_celsius = lst_kelvin - 273.15

    return {"lst": lst_celsius}


def _landsat_scene_metrics(
    item: Any,
    aoi_bounds: tuple[float, float, float, float],
    grid_4326: gpd.GeoDataFrame,
    grid_ids: list[int],
) -> GridMetrics:
    """Land surface temperature for one Landsat scene, reduced to per-grid-cell means."""
    assets = item.assets

    # Landsat C2 L2 band names on Planetary Computer
    # lwir11 = ST_B10 (surface temperature), red = B4 (SR), nir08 = B5 (SR)
    thermal_key = "lwir11" if "lwir11" in assets else "ST_B10"
    red_key = "red" if "red" in assets else "SR_B4"
    nir_key = "nir08" if "nir08" in assets else "SR_B5"

    if thermal_key not in assets:
        logger.warning("stac_landsat_no_thermal_band", extra={"assets": list(assets.keys())})
        return {}

    wanted = [key for key in (thermal_key, red_key, nir_key) if key in assets]
    read = _read_bands({key: assets[key].href for key in wanted}, aoi_bounds, native=wanted)
    if read is None:
        return {}
    arrays, ref_tf, ref_crs, target_shape = read
    thermal = arrays[thermal_key]
    red = arrays.get(red_key, np.zeros(target_shape, dtype=np.float32))
    nir = arrays.get(nir_key, np.zeros(target_shape, dtype=np.float32))

    index_arrays = _compute_landsat_lst_numpy(thermal, red, nir)
    grid_raster = _rasterize_grid(grid_4326, ref_tf, ref_crs, target_shape)
    return _zonal_means(index_arrays, grid_raster, grid_ids)


def _fetch_landsat_lst_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
) -> GridMetrics:
    """Fetch Landsat LST via Planetary Computer STAC/COG, as the median of scenes across the period."""
    bbox = _grid_bbox(grid_geo_df)
    grid_4326 = _grid_to_4326(grid_geo_df)
    grid_ids = [int(row.grid_id) for row in grid_4326.itertuples(index=False)]
    aoi_bounds = tuple(bbox)

    items = _stac_search(
        LANDSAT_C2_L2_COLLECTION, bbox, start_date, end_date,
        max_cloud_cover=max_cloud_cover,
    )
    if not items:
        logger.info("stac_landsat_no_scenes", extra={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        })
        return {}

    chosen = select_scenes(
        items, start_date, end_date, scene_budget(start_date, end_date), key=_cloud_cover
    )
    logger.info("stac_landsat_scenes_selected", extra={
        "found": len(items),
        "used": len(chosen),
        "scene_ids": [item.id for item in chosen],
    })
    return median_combine(
        _map_scenes(lambda item: _landsat_scene_metrics(item, aoi_bounds, grid_4326, grid_ids), chosen)
    )


# ---------------------------------------------------------------------------
# Sentinel-1 SAR indices
# ---------------------------------------------------------------------------

def _compute_sar_indices_numpy(vv_linear: np.ndarray, vh_linear: np.ndarray) -> dict[str, np.ndarray]:
    """
    Compute the same 5 SAR indices as gee_service._compute_sar_indices.

    Expects VV and VH in **linear** power scale (not dB).
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        eps = 1e-10
        denominator = vv_linear + vh_linear + eps

        rvi = 4.0 * vh_linear / denominator
        dprvi = 1.0 - vv_linear / denominator
        dpsvi = (vv_linear - vh_linear) * vh_linear
        rfdi = (vv_linear - vh_linear) / denominator
        csi = vh_linear / (vv_linear + eps)

    return {"rvi": rvi, "dprvi": dprvi, "dpsvi": dpsvi, "rfdi": rfdi, "csi": csi}


def _db_to_linear(arr: np.ndarray) -> np.ndarray:
    """Convert decibel backscatter to linear power."""
    return np.power(10.0, arr / 10.0)


def _sar_scene_metrics(
    item: Any,
    aoi_bounds: tuple[float, float, float, float],
    grid_4326: gpd.GeoDataFrame,
    grid_ids: list[int],
) -> GridMetrics:
    """SAR indices for one Sentinel-1 scene, reduced to per-grid-cell means."""
    assets = item.assets

    # Planetary Computer S1-RTC asset keys: "vv" and "vh"
    vv_key = "vv" if "vv" in assets else "VV"
    vh_key = "vh" if "vh" in assets else "VH"
    if vv_key not in assets or vh_key not in assets:
        logger.warning("stac_sar_missing_polarizations", extra={"assets": list(assets.keys())})
        return {}

    read = _read_bands(
        {"vv": assets[vv_key].href, "vh": assets[vh_key].href},
        aoi_bounds,
        native=["vv", "vh"],
    )
    if read is None:
        return {}
    arrays, ref_tf, ref_crs, target_shape = read
    vv_raw, vh_raw = arrays["vv"], arrays["vh"]

    # Planetary Computer S1-RTC is in linear gamma0 power, but check if dB
    # (values < 1 in linear are common; values < -5 suggest dB)
    valid = vv_raw[vv_raw != 0]
    if valid.size > 0 and np.nanmedian(valid) < -5:
        vv_linear = _db_to_linear(vv_raw)
        vh_linear = _db_to_linear(vh_raw)
    else:
        vv_linear = vv_raw
        vh_linear = vh_raw

    index_arrays = _compute_sar_indices_numpy(vv_linear, vh_linear)
    grid_raster = _rasterize_grid(grid_4326, ref_tf, ref_crs, target_shape)
    return _zonal_means(index_arrays, grid_raster, grid_ids)


def _fetch_sar_indices_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    rollback_days: int,
) -> SarFetchResult:
    """
    Fetch Sentinel-1 SAR indices via STAC/COG, as the median of scenes across the period.

    Searches Planetary Computer for Sentinel-1 RTC imagery. If none is found (or none can be read),
    rolls start_date back by rollback_days and retries (same logic as gee_service).
    """
    # Disabled switch kept so SAR can be turned off without code changes.
    if not ENABLE_STAC_SAR:
        raise DomainError(
            "SAR via STAC is not available yet; no Sentinel-1 source has been configured.",
            details={"reason": "sentinel-1-grd is requester-pays and not terrain-corrected"},
        )

    bbox = _grid_bbox(grid_geo_df)
    grid_4326 = _grid_to_4326(grid_geo_df)
    grid_ids = [int(row.grid_id) for row in grid_4326.itertuples(index=False)]
    aoi_bounds = tuple(bbox)

    effective_start_date = start_date
    rolled_back_days = 0

    while effective_start_date >= SENTINEL1_FIRST_ACQUISITION:
        items = _stac_search(
            SENTINEL1_RTC_COLLECTION, bbox, effective_start_date, end_date,
            max_cloud_cover=None,  # SAR is cloud-penetrating
        )
        if items:
            # Radar sees through cloud, so within a slice just take the earliest scene.
            chosen = select_scenes(
                items,
                effective_start_date,
                end_date,
                scene_budget(effective_start_date, end_date),
                key=lambda item: str(item.datetime),
            )
            logger.info("stac_sar_scenes_selected", extra={
                "found": len(items),
                "used": len(chosen),
                "rolled_back_days": rolled_back_days,
            })
            metrics = median_combine(
                _map_scenes(
                    lambda item: _sar_scene_metrics(item, aoi_bounds, grid_4326, grid_ids), chosen
                )
            )
            if metrics:
                return SarFetchResult(
                    metrics_by_grid_id=metrics,
                    effective_start_date=effective_start_date,
                    rolled_back_days=rolled_back_days,
                )

        effective_start_date -= timedelta(days=rollback_days)
        rolled_back_days += rollback_days

    return SarFetchResult(
        metrics_by_grid_id={},
        effective_start_date=None,
        rolled_back_days=rolled_back_days,
    )


# ---------------------------------------------------------------------------
# Async wrappers
# ---------------------------------------------------------------------------

async def fetch_optical_indices(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = DEFAULT_CLOUD_COVER_MAX,
) -> GridMetrics:
    """Async wrapper for STAC-based Sentinel-2 optical index fetching."""
    return await asyncio.to_thread(
        _fetch_optical_indices_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        max_cloud_cover=max_cloud_cover,
    )


async def fetch_landsat_lst(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = DEFAULT_CLOUD_COVER_MAX,
) -> GridMetrics:
    """Async wrapper for STAC-based Landsat LST fetching."""
    return await asyncio.to_thread(
        _fetch_landsat_lst_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        max_cloud_cover=max_cloud_cover,
    )


async def fetch_sar_indices(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    rollback_days: int = DEFAULT_ROLLBACK_DAYS,
) -> SarFetchResult:
    """Async wrapper for STAC-based Sentinel-1 SAR index fetching."""
    return await asyncio.to_thread(
        _fetch_sar_indices_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        rollback_days=rollback_days,
    )


# ---------------------------------------------------------------------------
# Merge helper (identical to gee_service._merge_grid_metrics)
# ---------------------------------------------------------------------------

def _list_acquisitions_sync(
    *, grid_geo_df: gpd.GeoDataFrame, start_date: date, end_date: date
) -> SatelliteAcquisitions:
    """
    Days in the period with Sentinel-2 or Sentinel-1 imagery over the farm. The cloud figure is the
    whole scene's (``eo:cloud_cover``): measuring the farm alone would mean downloading every scene.
    """

    bbox = _grid_bbox(grid_geo_df)
    optical_pairs: list[tuple[date, float | None]] = []
    for item in _stac_search(SENTINEL2_COLLECTION, bbox, start_date, end_date, max_items=1000):
        day = _item_date(item)
        if day is None:
            continue
        cloud = item.properties.get("eo:cloud_cover")
        optical_pairs.append((day, float(cloud) if isinstance(cloud, (int, float)) else None))

    radar_days: set[date] = set()
    if ENABLE_STAC_SAR:
        for item in _stac_search(SENTINEL1_RTC_COLLECTION, bbox, start_date, end_date, max_items=1000):
            day = _item_date(item)
            if day is not None:
                radar_days.add(day)
    return SatelliteAcquisitions(
        optical=merge_optical_cloud(optical_pairs), radar=frozenset(radar_days)
    )


async def list_stac_acquisitions(
    *, grid_geo_df: gpd.GeoDataFrame, start_date: date, end_date: date, ee_project_id: str | None = None
) -> SatelliteAcquisitions:
    """Async wrapper for STAC acquisition listing (``ee_project_id`` is accepted for API parity)."""

    return await asyncio.to_thread(
        _list_acquisitions_sync, grid_geo_df=grid_geo_df, start_date=start_date, end_date=end_date
    )


def _merge_grid_metrics(*metric_maps: GridMetrics) -> GridMetrics:
    merged: GridMetrics = {}
    for metric_map in metric_maps:
        for grid_id, values in metric_map.items():
            merged.setdefault(grid_id, {}).update(values)
    return merged


def _source_failure_details(exc: Exception) -> dict[str, Any]:
    details: dict[str, Any] = {
        "type": type(exc).__name__,
        "error": str(exc),
    }
    if isinstance(exc, DomainError):
        details["details"] = exc.details
    return details


# ---------------------------------------------------------------------------
# Main public API — drop-in replacement for fetch_gee_zonal_metrics
# ---------------------------------------------------------------------------

async def fetch_stac_zonal_metrics(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = DEFAULT_CLOUD_COVER_MAX,
    sar_rollback_days: int = DEFAULT_ROLLBACK_DAYS,
    # These params exist for API compat with gee_service but are unused:
    scale_meters: int = 10,
    ee_project_id: str | None = None,
    optical_date: date | None = None,
    radar_date: date | None = None,
) -> tuple[GridMetrics, SarFetchResult]:
    """
    Fetch and merge optical, LST, and SAR zonal metrics via STAC/COG.

    Drop-in replacement for gee_service.fetch_gee_zonal_metrics.
    Same return type: (merged GridMetrics, SarFetchResult). ``optical_date`` / ``radar_date``
    narrow that sensor to one pass, as in the Earth Engine version. Radar soil moisture (``rsm``)
    needs a year of radar history per pixel and is only computed by the Earth Engine provider.
    """

    optical_start, optical_end, optical_cloud = (
        (optical_date, optical_date, 100) if optical_date else (start_date, end_date, max_cloud_cover)
    )
    sar_start, sar_end = (radar_date, radar_date) if radar_date else (start_date, end_date)

    optical_result, lst_result, sar_result_value = await asyncio.gather(
        fetch_optical_indices(
            grid_geo_df=grid_geo_df,
            start_date=optical_start,
            end_date=optical_end,
            max_cloud_cover=optical_cloud,
        ),
        fetch_landsat_lst(
            grid_geo_df=grid_geo_df,
            start_date=start_date,
            end_date=end_date,
            max_cloud_cover=max_cloud_cover,
        ),
        fetch_sar_indices(
            grid_geo_df=grid_geo_df,
            start_date=sar_start,
            end_date=sar_end,
            rollback_days=sar_rollback_days,
        ),
        return_exceptions=True,
    )

    failures: dict[str, dict[str, Any]] = {}
    optical_metrics: GridMetrics = {}
    lst_metrics: GridMetrics = {}
    sar_result = SarFetchResult(
        metrics_by_grid_id={},
        effective_start_date=None,
        rolled_back_days=0,
    )

    if isinstance(optical_result, Exception):
        failures["optical"] = _source_failure_details(optical_result)
    else:
        optical_metrics = optical_result

    if isinstance(lst_result, Exception):
        failures["landsat_lst"] = _source_failure_details(lst_result)
    else:
        lst_metrics = lst_result

    if isinstance(sar_result_value, Exception):
        failures["sar"] = _source_failure_details(sar_result_value)
    else:
        sar_result = sar_result_value

    if failures:
        logger.warning(
            "stac_source_metrics_unavailable",
            extra={
                "failed_sources": failures,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        )

    return (
        _merge_grid_metrics(optical_metrics, lst_metrics, sar_result.metrics_by_grid_id),
        sar_result,
    )
