from __future__ import annotations

import asyncio
import json
import os
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import geopandas as gpd
from shapely.geometry import mapping

from app.config import get_settings
from app.dataclasses import GridMetrics, SarFetchResult
from app.exceptions import DomainError
from app.logging import get_logger
from app.services.imagery import SatelliteAcquisitions, merge_optical_cloud

if TYPE_CHECKING:
    import ee

WGS84_EPSG = 4326
SENTINEL1_FIRST_ACQUISITION = date(2014, 10, 3)
LANDSAT8_LAUNCH_DATE = date(2013, 2, 11)
LANDSAT9_LAUNCH_DATE = date(2021, 9, 27)
LANDSAT8_COLLECTION = "LANDSAT/LC08/C02/T1"
LANDSAT9_COLLECTION = "LANDSAT/LC09/C02/T1"
DEFAULT_CLOUD_COVER_MAX = 30
DEFAULT_ROLLBACK_DAYS = 3
DEFAULT_REDUCE_SCALE_METERS = 10
DEFAULT_LANDSAT_REDUCE_SCALE_METERS = 30
PYLANDTEMP_THERMAL_WAVELENGTH_METERS = 0.0000115
PYLANDTEMP_PLANCK_RHO = 14380
PYLANDTEMP_MAX_EARTH_TEMP_KELVIN = 273.15 + 56.7

OPTICAL_INDEX_BANDS: tuple[str, ...] = (
    "ndvi", "evi", "savi", "gndvi", "ndre", "ndmi", "ndwi", "ndwi_farmonaut",
)
SAR_INDEX_BANDS: tuple[str, ...] = ("rvi", "dprvi", "dpsvi", "rfdi", "csi", "rsm")
SENTINEL2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
# Sentinel-2 L2A surface reflectance is stored as integers scaled by 10 000.
SENTINEL2_REFLECTANCE_SCALE = 10000
# Scene Classification (SCL) classes that are not a clear view of the ground:
# 3 cloud shadow, 8 cloud (medium probability), 9 cloud (high probability), 10 thin cirrus.
SENTINEL2_CLOUD_SCL_CLASSES: tuple[int, ...] = (3, 8, 9, 10)
SENTINEL2_SCL_SCALE_METERS = 20
# Radar soil moisture compares the pass with the field's own driest and wettest radar response over
# the year before it (change detection). Percentiles rather than min/max keep one odd pass out.
RSM_REFERENCE_DAYS = 365
RSM_DRY_PERCENTILE = 5
RSM_WET_PERCENTILE = 95
# Below this dry-to-wet spread (dB) the field never changed enough for the scale to mean anything.
RSM_MIN_RANGE_DB = 1.0
MAX_ACQUISITIONS = 1000
LANDSAT_LST_BANDS: tuple[str, ...] = ("lst",)

logger = get_logger(__name__)


def _load_ee_module():
    """
    Lazily import the earthengine-api module.

    Defers importing `ee` so this module can be imported in environments where
    earthengine-api is unavailable. GEE functionality fails only when invoked.

    Returns:
        The imported earthengine-api module.

    Raises:
        DomainError: If importing earthengine-api fails.
    """

    try:
        import ee  # type: ignore[import-not-found]

        return ee
    except Exception as exc:  # pragma: no cover - defensive import guard
        raise DomainError(
            "earthengine-api is not available in the current runtime.",
            details={"error": str(exc)},
        ) from exc


def _initialize_earth_engine(ee_module: Any, ee_project_id: str | None) -> None:
    """
    Initialize the Google Earth Engine session.

    Uses the explicitly supplied project ID if provided, otherwise falls back to
    get_settings().ee_project_id. If no project ID is available, initializes without
    a project argument. Wraps initialization failures as DomainError.
    """

    project_id = ee_project_id or get_settings().ee_project_id
    credentials = _load_google_application_credentials(ee_module)
    try:
        init_kwargs: dict[str, Any] = {}
        if credentials is not None:
            init_kwargs["credentials"] = credentials
        if project_id:
            init_kwargs["project"] = project_id
        ee_module.Initialize(**init_kwargs)
    except Exception as exc:
        raise DomainError(
            "Failed to initialize Google Earth Engine.",
            details={"ee_project_id": project_id, "error": str(exc)},
        ) from exc


def _load_google_application_credentials(ee_module: Any) -> Any | None:
    """
    Prepare credentials mounted through GOOGLE_APPLICATION_CREDENTIALS.

    Service-account JSON files are passed directly to Earth Engine. User
    credentials created by `earthengine authenticate` are copied into the SDK's
    expected persistent credential location, which is under /tmp in the Docker
    runtime because HOME is set to /tmp.
    """

    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not credentials_path:
        return None

    path = Path(credentials_path).expanduser()
    if not path.is_file():
        return None

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None

    if payload.get("type") == "service_account" and payload.get("client_email"):
        service_account_credentials = getattr(ee_module, "ServiceAccountCredentials", None)
        if service_account_credentials is not None:
            return service_account_credentials(payload["client_email"], str(path))

    if payload.get("refresh_token"):
        _install_persistent_earth_engine_credentials(path)

    return None


def _install_persistent_earth_engine_credentials(source_path: Path) -> None:
    try:
        import ee.oauth as ee_oauth  # type: ignore[import-not-found]

        target_path = Path(ee_oauth.get_credentials_path())
        if source_path.resolve() == target_path.resolve():
            return

        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, target_path)
        os.chmod(target_path, 0o600)
    except Exception as exc:  # pragma: no cover - defensive credential setup guard
        raise DomainError(
            "Failed to prepare Google Earth Engine credentials.",
            details={"credentials_path": str(source_path), "error": str(exc)},
        ) from exc


def _exclusive_end(end_date: date) -> str:
    """Earth Engine's filterDate excludes its end, so the day after makes ``end_date`` inclusive."""
    return (end_date + timedelta(days=1)).isoformat()


def _validate_date_range(start_date: date, end_date: date) -> None:
    """
    Asserts start_date is not after end_date, raising DomainError if violated.
    """
    if start_date > end_date:
        raise DomainError(
            "start_date must be before or equal to end_date.",
            details={"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        )


def _validate_max_cloud_cover(max_cloud_cover: int) -> None:
    """
    Asserts max_cloud_cover is within [0, 100], raising DomainError if violated.
    """
    if max_cloud_cover < 0 or max_cloud_cover > 100:
        raise DomainError(
            "max_cloud_cover must be between 0 and 100.",
            details={"max_cloud_cover": max_cloud_cover},
        )


def _validate_rollback_days(rollback_days: int) -> None:
    """
    Asserts rollback_days is strictly positive, raising DomainError if violated.
    """
    if rollback_days <= 0:
        raise DomainError(
            "rollback_days must be greater than zero.",
            details={"rollback_days": rollback_days},
        )


def _validate_scale(scale_meters: int) -> None:
    """
    Asserts scale_meters is strictly positive, raising DomainError if violated.
    """
    if scale_meters <= 0:
        raise DomainError(
            "scale_meters must be greater than zero.",
            details={"scale_meters": scale_meters},
        )


def _coerce_grid_id(raw_grid_id: Any) -> int | None:
    """
    Coerces a raw grid ID to int, returning None if absent or unconvertible.
    """
    if raw_grid_id is None:
        return None
    try:
        return int(raw_grid_id)
    except (TypeError, ValueError):
        return None


def _grid_to_ee_feature_collection(ee_module: Any, grid_geo_df: gpd.GeoDataFrame):
    """
    Convert a grid GeoDataFrame into a GEE FeatureCollection.

    Reprojects the grid to WGS84, then maps each row to an ee.Feature carrying its
    int-coercible grid_id as a property. Raises DomainError if the GeoDataFrame is
    empty, missing the grid_id column, or contains any grid_id that cannot be
    coerced to int.
    """

    if grid_geo_df.empty:
        raise DomainError("Cannot build GEE FeatureCollection from an empty grid.")
    if "grid_id" not in grid_geo_df.columns:
        raise DomainError("grid GeoDataFrame must include a grid_id column.")

    grid_4326 = grid_geo_df.to_crs(epsg=WGS84_EPSG)
    features = []
    for row in grid_4326.itertuples(index=False):
        grid_id = _coerce_grid_id(getattr(row, "grid_id", None))
        if grid_id is None:
            raise DomainError(
                "Each grid row must include a numeric grid_id.",
                details={"grid_id": getattr(row, "grid_id", None)},
            )
        feature = ee_module.Feature(
            ee_module.Geometry(mapping(row.geometry)),
            {"grid_id": grid_id},
        )
        features.append(feature)

    return ee_module.FeatureCollection(features)


def _aoi_from_grid(ee_module: Any, grid_geo_df: gpd.GeoDataFrame):
    """
    Derive a rectangular GEE AOI from a grid GeoDataFrame.

    Reprojects the grid to WGS84, takes its total bounds, and wraps the bounding box
    as an ee.Geometry.Rectangle. Raises DomainError if the GeoDataFrame is empty.
    """

    if grid_geo_df.empty:
        raise DomainError("Cannot build AOI from an empty grid.")

    bounds = grid_geo_df.to_crs(epsg=WGS84_EPSG).total_bounds
    return ee_module.Geometry.Rectangle(bounds.tolist())


def _compute_optical_indices(ee_module: Any, image: Any):
    """
    Compute optical vegetation and moisture indices from Sentinel-2 bands.

    Adds these derived bands to the input image:
        ndvi:  Normalized Difference Vegetation Index (B8, B4)
        evi:   Enhanced Vegetation Index (B8, B4, B2)
        savi:  Soil-Adjusted Vegetation Index (B8, B4)
        gndvi: Green NDVI (B8, B3)
        ndre:  Normalized Difference Red Edge (B8, B5)
        ndmi:  Normalized Difference Moisture Index (B8, B11)
        ndwi:  Normalized Difference Water Index, McFeeters (B3, B8)
        ndwi_farmonaut:  NDWI as Farmonaut reports it, crop water (B8, B12)

    Bands are converted to 0-1 reflectance first (EVI's constants assume it), and pixels the
    Scene Classification marks as cloud, cloud shadow or cirrus are masked out.
    """

    scl = image.select("SCL")
    clear = scl.neq(SENTINEL2_CLOUD_SCL_CLASSES[0])
    for scl_class in SENTINEL2_CLOUD_SCL_CLASSES[1:]:
        clear = clear.And(scl.neq(scl_class))
    image = image.updateMask(clear)
    reflectance = image.select(["B2", "B3", "B4", "B5", "B8", "B8A", "B11", "B12"]).divide(
        SENTINEL2_REFLECTANCE_SCALE
    )

    nir = reflectance.select("B8")
    red = reflectance.select("B4")
    green = reflectance.select("B3")
    blue = reflectance.select("B2")
    red_edge = reflectance.select("B5")
    swir = reflectance.select("B11")
    swir22 = reflectance.select("B12")

    ndvi = nir.subtract(red).divide(nir.add(red)).rename("ndvi")
    evi = (
        nir.subtract(red)
        .divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1))
        .multiply(2.5)
        .rename("evi")
    )
    savi = nir.subtract(red).divide(nir.add(red).add(0.5)).multiply(1.5).rename("savi")
    gndvi = nir.subtract(green).divide(nir.add(green)).rename("gndvi")
    ndre = nir.subtract(red_edge).divide(nir.add(red_edge)).rename("ndre")
    ndmi = nir.subtract(swir).divide(nir.add(swir)).rename("ndmi")
    ndwi = green.subtract(nir).divide(green.add(nir)).rename("ndwi")
    ndwi_farmonaut = nir.subtract(swir22).divide(nir.add(swir22)).rename("ndwi_farmonaut")

    return image.addBands([ndvi, evi, savi, gndvi, ndre, ndmi, ndwi, ndwi_farmonaut])


def _compute_sar_indices(ee_module: Any, image: Any):
    """
    Compute SAR-derived indices from Sentinel-1 VV/VH backscatter bands.

    Converts VV and VH from dB to linear scale. Sentinel-1 IW scenes filtered by
    this service contain VV and VH, so these are dual-pol formulas and do not
    require HH.
    """

    vv = image.select("VV")
    vh = image.select("VH")

    vv_linear = ee_module.Image(10).pow(vv.divide(10))
    vh_linear = ee_module.Image(10).pow(vh.divide(10))
    denominator = vv_linear.add(vh_linear)

    rvi = vh_linear.multiply(4).divide(denominator).rename("rvi")
    dprvi = ee_module.Image(1).subtract(vv_linear.divide(denominator)).rename("dprvi")
    dpsvi = vv_linear.subtract(vh_linear).multiply(vh_linear).rename("dpsvi")
    rfdi = vv_linear.subtract(vh_linear).divide(denominator).rename("rfdi")
    csi = vh_linear.divide(vv_linear).rename("csi")

    return image.addBands([rvi, dprvi, dpsvi, rfdi, csi])


def _compute_landsat_lst(ee_module: Any, image: Any):
    """
    Compute Land Surface Temperature from Landsat 8/9 Collection 2 Level-1 bands.

    Uses Band 10 for thermal brightness temperature and Bands 4/5 for NDVI-driven
    emissivity. Earth Engine map functions cannot call local Python packages, so
    this mirrors pylandtemp's mono-window path server-side while using each scene's
    Earth Engine metadata calibration constants for radiance and brightness
    temperature.
    """

    thermal_dn = image.select("B10")
    red = image.select("B4")
    nir = image.select("B5")

    radiance = (
        thermal_dn.multiply(image.getNumber("RADIANCE_MULT_BAND_10"))
        .add(image.getNumber("RADIANCE_ADD_BAND_10"))
        .rename("toa_radiance_b10")
    )
    brightness_temperature = ee_module.Image(image.getNumber("K2_CONSTANT_BAND_10")).divide(
        ee_module.Image(image.getNumber("K1_CONSTANT_BAND_10")).divide(radiance).add(1).log()
    )

    ndvi = nir.subtract(red).divide(nir.add(red)).rename("lst_ndvi")
    mixed_emissivity = ndvi.subtract(0.2).divide(0.3).pow(2).multiply(0.004).add(0.986)
    emissivity = (
        ee_module.Image(0.97)
        .where(ndvi.gte(0.2).And(ndvi.lte(0.5)), mixed_emissivity)
        .where(ndvi.gt(0.5), 0.99)
        .rename("lst_emissivity")
    )

    lst_kelvin = brightness_temperature.divide(
        ee_module.Image(1).add(
            ee_module.Image(PYLANDTEMP_THERMAL_WAVELENGTH_METERS)
            .multiply(brightness_temperature)
            .divide(PYLANDTEMP_PLANCK_RHO)
            .multiply(emissivity.log())
        )
    ).rename("lst_kelvin")
    lst_celsius = (
        lst_kelvin.subtract(273.15)
        .updateMask(lst_kelvin.lte(PYLANDTEMP_MAX_EARTH_TEMP_KELVIN))
        .rename("lst")
    )

    return image.addBands([lst_celsius])


def _landsat_collection_segments(start_date: date, end_date: date) -> list[tuple[str, date, date]]:
    """
    Resolve Landsat 8/9 collection windows based on launch dates.

    Landsat 8 is used from its 2013-02-11 launch until the day before Landsat 9
    launched. Landsat 9 is used from its 2021-09-27 launch onward. Returned
    segment end dates are inclusive.
    """

    segments: list[tuple[str, date, date]] = []
    if end_date >= LANDSAT8_LAUNCH_DATE and start_date < LANDSAT9_LAUNCH_DATE:
        segment_start = max(start_date, LANDSAT8_LAUNCH_DATE)
        segment_end = min(end_date, LANDSAT9_LAUNCH_DATE - timedelta(days=1))
        if segment_start <= segment_end:
            segments.append((LANDSAT8_COLLECTION, segment_start, segment_end))

    if end_date >= LANDSAT9_LAUNCH_DATE:
        segment_start = max(start_date, LANDSAT9_LAUNCH_DATE)
        if segment_start <= end_date:
            segments.append((LANDSAT9_COLLECTION, segment_start, end_date))

    return segments


def _build_landsat_collection(
    ee_module: Any,
    *,
    aoi: Any,
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
):
    """
    Build a Landsat 8/9 raw scene collection for LST processing.

    The collection is split by mission launch dates and then merged so a request
    crossing the Landsat 9 launch date can still produce one median LST composite.
    """

    collection = None
    for collection_name, segment_start, segment_end in _landsat_collection_segments(start_date, end_date):
        segment = (
            ee_module.ImageCollection(collection_name)
            .filterBounds(aoi)
            .filterDate(segment_start.isoformat(), (segment_end + timedelta(days=1)).isoformat())
            .filter(ee_module.Filter.lt("CLOUD_COVER", max_cloud_cover))
        )
        collection = segment if collection is None else collection.merge(segment)

    return collection


def _reduce_regions_mean(
    ee_module: Any,
    image: Any,
    bands: tuple[str, ...],
    grid_feature_collection: Any,
    scale_meters: int,
) -> GridMetrics:
    """
    Reduce selected image bands to per-grid-cell means via GEE reduceRegions.

    Calls ee.Reducer.mean() over the grid FeatureCollection at the given scale, then
    parses returned features into a GridMetrics dict keyed by int-coerced grid_id.
    Malformed features and non-int-coercible grid IDs are skipped. Null or
    non-float-coercible band values are skipped per band.
    """

    reduced = image.select(list(bands)).reduceRegions(
        collection=grid_feature_collection,
        reducer=ee_module.Reducer.mean(),
        scale=scale_meters,
    )

    result_payload = reduced.getInfo()
    features = result_payload.get("features", []) if isinstance(result_payload, dict) else []

    metrics_by_grid_id: GridMetrics = {}
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties", {})
        if not isinstance(properties, dict):
            continue

        grid_id = _coerce_grid_id(properties.get("grid_id"))
        if grid_id is None:
            continue

        values: dict[str, float] = {}
        for band in bands:
            raw_value = properties.get(band)
            if raw_value is None:
                continue
            try:
                values[band] = float(raw_value)
            except (TypeError, ValueError):
                continue
        metrics_by_grid_id[grid_id] = values

    return metrics_by_grid_id


def _fetch_optical_indices_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
    scale_meters: int,
    ee_project_id: str | None,
) -> GridMetrics:
    """
    Fetch per-grid optical vegetation indices from Sentinel-2 via GEE.

    Filters COPERNICUS/S2_SR_HARMONIZED by AOI, date range, and scene-level cloud
    cover, computes optical indices for each image, builds a median composite, and
    reduces selected bands to per-grid-cell means. Returns an empty GridMetrics dict
    if no matching images are found.

    Raises:
        DomainError: On validation failure, GEE initialization failure, or unexpected
            GEE errors while fetching/reducing optical indices.
    """

    _validate_date_range(start_date, end_date)
    _validate_max_cloud_cover(max_cloud_cover)
    _validate_scale(scale_meters)

    ee_module = _load_ee_module()
    _initialize_earth_engine(ee_module, ee_project_id)
    try:
        aoi = _aoi_from_grid(ee_module, grid_geo_df)
        grid_feature_collection = _grid_to_ee_feature_collection(ee_module, grid_geo_df)

        collection = (
            ee_module.ImageCollection(SENTINEL2_COLLECTION)
            .filterBounds(aoi)
            .filterDate(start_date.isoformat(), _exclusive_end(end_date))
            .filter(ee_module.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", max_cloud_cover))
        )
        image_count = int(collection.size().getInfo())
        if image_count == 0:
            return {}

        def map_optical(image):
            return _compute_optical_indices(ee_module, image)

        composite = collection.map(map_optical).median().clip(aoi)
        return _reduce_regions_mean(
            ee_module,
            composite,
            OPTICAL_INDEX_BANDS,
            grid_feature_collection,
            scale_meters,
        )
    except DomainError:
        raise
    except Exception as exc:
        raise DomainError(
            "Failed to fetch optical zonal indices from Google Earth Engine.",
            details={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "max_cloud_cover": max_cloud_cover,
                "error": str(exc),
            },
        ) from exc


def _fetch_landsat_lst_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
    scale_meters: int,
    ee_project_id: str | None,
) -> GridMetrics:
    """
    Fetch per-grid Land Surface Temperature from Landsat 8/9 via GEE.

    Uses Landsat 8 Collection 2 Level-1 raw scenes before the Landsat 9 launch
    date and Landsat 9 Collection 2 Level-1 raw scenes from the launch date
    onward. Band 10, Band 4, and Band 5 are transformed into a Celsius `lst`
    band, then reduced to per-grid means.
    """

    _validate_date_range(start_date, end_date)
    _validate_max_cloud_cover(max_cloud_cover)
    _validate_scale(scale_meters)

    if end_date < LANDSAT8_LAUNCH_DATE:
        return {}

    ee_module = _load_ee_module()
    _initialize_earth_engine(ee_module, ee_project_id)
    try:
        aoi = _aoi_from_grid(ee_module, grid_geo_df)
        grid_feature_collection = _grid_to_ee_feature_collection(ee_module, grid_geo_df)
        collection = _build_landsat_collection(
            ee_module,
            aoi=aoi,
            start_date=start_date,
            end_date=end_date,
            max_cloud_cover=max_cloud_cover,
        )
        if collection is None:
            return {}

        image_count = int(collection.size().getInfo())
        if image_count == 0:
            return {}

        def map_landsat_lst(image):
            return _compute_landsat_lst(ee_module, image)

        composite = collection.map(map_landsat_lst).median().clip(aoi)
        return _reduce_regions_mean(
            ee_module,
            composite,
            LANDSAT_LST_BANDS,
            grid_feature_collection,
            scale_meters,
        )
    except DomainError:
        raise
    except Exception as exc:
        raise DomainError(
            "Failed to fetch Landsat LST zonal metrics from Google Earth Engine.",
            details={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "max_cloud_cover": max_cloud_cover,
                "error": str(exc),
            },
        ) from exc


def _build_sar_collection(ee_module: Any, aoi: Any, start_date: date, end_date: date):
    """
    Build a filtered Sentinel-1 GRD ImageCollection for SAR analysis.

    Filters COPERNICUS/S1_GRD by AOI and date range, then retains only IW-mode
    images containing both VV and VH polarizations.
    """

    return (
        ee_module.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi)
        .filterDate(start_date.isoformat(), _exclusive_end(end_date))
        .filter(ee_module.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee_module.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .filter(ee_module.Filter.eq("instrumentMode", "IW"))
    )


def _add_radar_soil_moisture(ee_module: Any, composite: Any, aoi: Any, end_date: date):
    """
    Add an ``rsm`` band: relative surface soil moisture, 0 (driest) to 1 (wettest).

    Change detection on Sentinel-1 VV backscatter: the pass is placed between the field's own dry
    (5th percentile) and wet (95th percentile) VV response over the year before ``end_date``. It is
    relative to the field, not a volumetric reading, and dense crop canopy weakens the signal.
    Pixels whose dry-to-wet spread is under 1 dB are left empty.
    """

    reference = _build_sar_collection(
        ee_module, aoi, end_date - timedelta(days=RSM_REFERENCE_DAYS), end_date
    ).select("VV")
    bounds = reference.reduce(
        ee_module.Reducer.percentile([RSM_DRY_PERCENTILE, RSM_WET_PERCENTILE])
    )
    dry = bounds.select(f"VV_p{RSM_DRY_PERCENTILE}")
    wet = bounds.select(f"VV_p{RSM_WET_PERCENTILE}")
    spread = wet.subtract(dry)
    rsm = (
        composite.select("VV")
        .subtract(dry)
        .divide(spread)
        .clamp(0, 1)
        .updateMask(spread.gte(RSM_MIN_RANGE_DB))
        .rename("rsm")
    )
    return composite.addBands(rsm)


def _fetch_sar_indices_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    rollback_days: int,
    scale_meters: int,
    ee_project_id: str | None,
) -> SarFetchResult:
    """
    Fetch per-grid SAR vegetation indices from Sentinel-1 via GEE.

    Searches for IW-mode Sentinel-1 VV/VH imagery over the AOI and date range. If
    imagery is found, computes SAR indices per image, builds a median composite, and
    reduces selected bands to per-grid-cell means. If no imagery is found, rolls the
    start date back by rollback_days and retries until the effective start date falls
    before SENTINEL1_FIRST_ACQUISITION.

    Returns:
        SarFetchResult with per-grid metrics, the effective start date that yielded
        imagery, and total days rolled back. metrics_by_grid_id is empty and
        effective_start_date is None if no imagery was found.

    Raises:
        DomainError: On validation failure, GEE initialization failure, or unexpected
            GEE errors while fetching/reducing SAR indices.
    """

    _validate_date_range(start_date, end_date)
    _validate_rollback_days(rollback_days)
    _validate_scale(scale_meters)

    ee_module = _load_ee_module()
    _initialize_earth_engine(ee_module, ee_project_id)
    try:
        aoi = _aoi_from_grid(ee_module, grid_geo_df)
        grid_feature_collection = _grid_to_ee_feature_collection(ee_module, grid_geo_df)

        effective_start_date = start_date
        rolled_back_days = 0

        while effective_start_date >= SENTINEL1_FIRST_ACQUISITION:
            collection = _build_sar_collection(ee_module, aoi, effective_start_date, end_date)
            image_count = int(collection.size().getInfo())
            if image_count > 0:

                def map_sar(image):
                    return _compute_sar_indices(ee_module, image)

                composite = collection.map(map_sar).median().clip(aoi)
                composite = _add_radar_soil_moisture(ee_module, composite, aoi, end_date)
                metrics = _reduce_regions_mean(
                    ee_module,
                    composite,
                    SAR_INDEX_BANDS,
                    grid_feature_collection,
                    scale_meters,
                )
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
    except DomainError:
        raise
    except Exception as exc:
        raise DomainError(
            "Failed to fetch SAR zonal indices from Google Earth Engine.",
            details={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "rollback_days": rollback_days,
                "error": str(exc),
            },
        ) from exc


async def fetch_optical_indices(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = DEFAULT_CLOUD_COVER_MAX,
    scale_meters: int = DEFAULT_REDUCE_SCALE_METERS,
    ee_project_id: str | None = None,
) -> GridMetrics:
    """
    Async wrapper around _fetch_optical_indices_sync.

    Forwards parameters to the synchronous GEE fetcher and offloads the blocking
    earthengine-api work to a worker thread via asyncio.to_thread so the event loop
    is not stalled.
    """
    return await asyncio.to_thread(
        _fetch_optical_indices_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        max_cloud_cover=max_cloud_cover,
        scale_meters=scale_meters,
        ee_project_id=ee_project_id,
    )


async def fetch_landsat_lst(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = DEFAULT_CLOUD_COVER_MAX,
    scale_meters: int = DEFAULT_LANDSAT_REDUCE_SCALE_METERS,
    ee_project_id: str | None = None,
) -> GridMetrics:
    """
    Async wrapper around _fetch_landsat_lst_sync.

    Fetches Landsat-derived land surface temperature in Celsius as the `lst`
    metric and offloads blocking Earth Engine work to a worker thread.
    """

    return await asyncio.to_thread(
        _fetch_landsat_lst_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        max_cloud_cover=max_cloud_cover,
        scale_meters=scale_meters,
        ee_project_id=ee_project_id,
    )


async def fetch_sar_indices(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    rollback_days: int = DEFAULT_ROLLBACK_DAYS,
    scale_meters: int = DEFAULT_REDUCE_SCALE_METERS,
    ee_project_id: str | None = None,
) -> SarFetchResult:
    """
    Async wrapper around _fetch_sar_indices_sync.

    Forwards parameters to the synchronous SAR fetcher and offloads the blocking
    earthengine-api work to a worker thread via asyncio.to_thread so the event loop
    is not stalled.
    """

    return await asyncio.to_thread(
        _fetch_sar_indices_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        rollback_days=rollback_days,
        scale_meters=scale_meters,
        ee_project_id=ee_project_id,
    )


def _epoch_ms_to_date(value: Any) -> date | None:
    try:
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).date()
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _list_acquisitions_sync(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    ee_project_id: str | None,
) -> SatelliteAcquisitions:
    """
    Days in the period with a Sentinel-2 or Sentinel-1 image over the farm, in one Earth Engine call.

    Each optical day carries the percent of the farm's own pixels that Scene Classification marks as
    cloud, cloud shadow or cirrus, which says far more about a small field than the scene-wide
    figure in the image metadata.
    """

    _validate_date_range(start_date, end_date)
    ee_module = _load_ee_module()
    _initialize_earth_engine(ee_module, ee_project_id)
    try:
        aoi = _aoi_from_grid(ee_module, grid_geo_df)
        farm = _grid_to_ee_feature_collection(ee_module, grid_geo_df).geometry()
        optical = (
            ee_module.ImageCollection(SENTINEL2_COLLECTION)
            .filterBounds(aoi)
            .filterDate(start_date.isoformat(), _exclusive_end(end_date))
        )

        def farm_cloud(image):
            scl = image.select("SCL")
            cloudy = scl.eq(SENTINEL2_CLOUD_SCL_CLASSES[0])
            for scl_class in SENTINEL2_CLOUD_SCL_CLASSES[1:]:
                cloudy = cloudy.Or(scl.eq(scl_class))
            fraction = cloudy.rename("cloud").reduceRegion(
                reducer=ee_module.Reducer.mean(),
                geometry=farm,
                scale=SENTINEL2_SCL_SCALE_METERS,
                maxPixels=10**9,
            ).get("cloud")
            return ee_module.Feature(
                None, {"time": image.get("system:time_start"), "cloud": fraction}
            )

        radar = _build_sar_collection(ee_module, aoi, start_date, end_date)
        payload = ee_module.Dictionary(
            {
                "optical": ee_module.FeatureCollection(
                    optical.limit(MAX_ACQUISITIONS).map(farm_cloud)
                ).toList(MAX_ACQUISITIONS),
                "radar": radar.limit(MAX_ACQUISITIONS).aggregate_array("system:time_start"),
            }
        ).getInfo()
    except DomainError:
        raise
    except Exception as exc:
        raise DomainError(
            "Failed to list satellite images from Google Earth Engine.",
            details={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "error": str(exc),
            },
        ) from exc

    payload = payload if isinstance(payload, dict) else {}
    optical_pairs: list[tuple[date, float | None]] = []
    for feature in payload.get("optical") or []:
        properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
        day = _epoch_ms_to_date(properties.get("time"))
        if day is None:
            continue
        cloud = properties.get("cloud")
        cloud_percent = float(cloud) * 100 if isinstance(cloud, (int, float)) else None
        optical_pairs.append((day, cloud_percent))
    radar_days = {
        day for value in payload.get("radar") or [] if (day := _epoch_ms_to_date(value)) is not None
    }
    return SatelliteAcquisitions(
        optical=merge_optical_cloud(optical_pairs), radar=frozenset(radar_days)
    )


async def list_gee_acquisitions(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    ee_project_id: str | None = None,
) -> SatelliteAcquisitions:
    """Async wrapper around _list_acquisitions_sync (Earth Engine calls block)."""

    return await asyncio.to_thread(
        _list_acquisitions_sync,
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        ee_project_id=ee_project_id,
    )


def _merge_grid_metrics(*metric_maps: GridMetrics) -> GridMetrics:
    """
    Merge multiple GridMetrics dictionaries keyed by grid_id.

    For each grid_id, combines metric dictionaries from all inputs. If the same band
    key appears more than once for a grid_id, values from later metric maps overwrite
    earlier ones.
    """

    merged: GridMetrics = {}
    for metric_map in metric_maps:
        for grid_id, values in metric_map.items():
            merged.setdefault(grid_id, {}).update(values)
    return merged


def _gee_source_failure_details(exc: Exception) -> dict[str, Any]:
    details: dict[str, Any] = {
        "type": type(exc).__name__,
        "error": str(exc),
    }
    if isinstance(exc, DomainError):
        details["details"] = exc.details
    return details


async def fetch_gee_zonal_metrics(
    *,
    grid_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    max_cloud_cover: int = DEFAULT_CLOUD_COVER_MAX,
    sar_rollback_days: int = DEFAULT_ROLLBACK_DAYS,
    scale_meters: int = DEFAULT_REDUCE_SCALE_METERS,
    ee_project_id: str | None = None,
    optical_date: date | None = None,
    radar_date: date | None = None,
) -> tuple[GridMetrics, SarFetchResult]:
    """
    Fetch and merge optical and SAR zonal metrics for a grid via GEE.

    Runs optical, Landsat LST, and SAR fetches independently, merges available
    per-grid metrics, and returns both the merged metrics and SAR rollback metadata.
    A failed source is logged and omitted so it does not erase successful sources.

    ``optical_date`` / ``radar_date`` narrow that sensor to the single pass the user chose
    (the scene-wide cloud filter is dropped for it; cloudy pixels are still masked). Without
    them every pass in the period is combined (median). Landsat LST always uses the period.
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
            scale_meters=scale_meters,
            ee_project_id=ee_project_id,
        ),
        fetch_landsat_lst(
            grid_geo_df=grid_geo_df,
            start_date=start_date,
            end_date=end_date,
            max_cloud_cover=max_cloud_cover,
            scale_meters=DEFAULT_LANDSAT_REDUCE_SCALE_METERS,
            ee_project_id=ee_project_id,
        ),
        fetch_sar_indices(
            grid_geo_df=grid_geo_df,
            start_date=sar_start,
            end_date=sar_end,
            rollback_days=sar_rollback_days,
            scale_meters=scale_meters,
            ee_project_id=ee_project_id,
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
        failures["optical"] = _gee_source_failure_details(optical_result)
    else:
        optical_metrics = optical_result

    if isinstance(lst_result, Exception):
        failures["landsat_lst"] = _gee_source_failure_details(lst_result)
    else:
        lst_metrics = lst_result

    if isinstance(sar_result_value, Exception):
        failures["sar"] = _gee_source_failure_details(sar_result_value)
    else:
        sar_result = sar_result_value

    if failures:
        logger.warning(
            "gee_source_metrics_unavailable",
            extra={
                "failed_sources": failures,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        )

    return _merge_grid_metrics(optical_metrics, lst_metrics, sar_result.metrics_by_grid_id), sar_result
