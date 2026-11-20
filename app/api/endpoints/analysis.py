from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from shapely.geometry import mapping

from app.auth import require_authenticated_user
from app.exceptions import DomainError
from app.logging import get_logger
from app.models.requests import FarmAnalysisRequest, SatelliteDatesRequest
from app.models.responses import (
    FarmAnalysisResponse,
    GridAnalysisFeature,
    GridAnalysisProperties,
    CPIScores,
    ImageryInfo,
    SatelliteDatesResponse,
    SatellitePass,
)
from app.services.analytics_service import analyze_grid_metrics, build_grid_metrics_from_sources
from app.config import get_settings
from app.services.gee_service import fetch_gee_zonal_metrics, list_gee_acquisitions
from app.services.imagery import SatelliteAcquisitions, choose_imagery, satellite_passes
from app.services.stac_service import fetch_stac_zonal_metrics, list_stac_acquisitions
from app.services.geometry_service import create_grid, estimate_utm_crs, parse_geojson
from app.services.thresholds import load_advisory_thresholds
from app.services.weather_service import fetch_weather_climatology, fetch_weather_telemetry
from app.utils.payloads import SAMPLE_FARM_ANALYSIS_REQUEST

router = APIRouter()
logger = get_logger(__name__)

OBSERVED_CANOPY_PARAMETERS = (
    "ndvi",
    "evi",
    "savi",
    "rvi",
    "dprvi",
    "dpsvi",
    "csi",
    "gndvi",
    "ndre",
)


async def fetch_satellite_metrics(**kwargs: Any):
    """Dispatch to the configured satellite source (SATELLITE_PROVIDER: stac | gee)."""

    if get_settings().satellite_provider.lower() == "gee":
        return await fetch_gee_zonal_metrics(**kwargs)
    return await fetch_stac_zonal_metrics(**kwargs)


async def list_satellite_acquisitions(**kwargs: Any) -> SatelliteAcquisitions:
    """Dispatch acquisition listing to the configured satellite source."""

    if get_settings().satellite_provider.lower() == "gee":
        return await list_gee_acquisitions(**kwargs)
    return await list_stac_acquisitions(**kwargs)


def unwrap_result(result: Any, *, label: str) -> Any:
    """
    Unwrap a value from an asyncio.gather result.

    Intended for use with asyncio.gather(return_exceptions=True), where failed
    tasks may be returned as Exception instances instead of being raised. If the
    result is an Exception, logs it and re-raises the original exception unchanged.

    Args:
        result: Value or Exception returned by asyncio.gather.
        label: Log message label identifying the failed operation.

    Returns:
        The original result if it is not an Exception.

    Raises:
        Exception: Re-raises the original exception if result is an Exception.
    """

    if isinstance(result, Exception):
        logger.error(label, extra={"error": str(result)})
        raise result
    return result


def lookup_grid_payload(payload: Mapping[Any, Any], grid_id: Any) -> Any | None:
    """
    Look up a grid cell payload by ID with type-coercion fallback.

    Grid IDs may be serialized as strings but stored as ints in a payload mapping,
    or vice versa. Tries the raw key first, then an int cast, then a str cast.

    Args:
        payload: Mapping of grid IDs to associated data.
        grid_id: Grid cell identifier to look up.

    Returns:
        The matched payload value, or None if no raw, int, or str key match exists.
    """

    if grid_id in payload:
        return payload[grid_id]

    try:
        int_grid_id = int(grid_id)
    except (TypeError, ValueError):
        int_grid_id = None

    if int_grid_id is not None and int_grid_id in payload:
        return payload[int_grid_id]

    str_grid_id = str(grid_id)
    if str_grid_id in payload:
        return payload[str_grid_id]

    return None


def build_cpi_scores(cpi_scores: Mapping[str, Any] | None) -> CPIScores:
    """
    Builds a validated CPIScores instance from a raw score mapping.

    Starts from a zero-baseline via CPIScores.zeroed() so any missing keys default
    to 0.0 rather than raising. For each recognised field, accepts int or float
    values and clamps them to [0.0, 1.0]; non-numeric values and unrecognised keys
    are silently ignored.

    Args:
        cpi_scores: Raw mapping of CPI component names to their scores, or None
                    if no scores are available.

    Returns:
        A fully populated CPIScores instance with all fields in [0.0, 1.0].
    """
    normalized = CPIScores.zeroed().model_dump()
    if cpi_scores is not None:
        for key in normalized:
            value = cpi_scores.get(key)
            if isinstance(value, (int, float)):
                normalized[key] = max(0.0, min(1.0, float(value)))
    return CPIScores(**normalized)


def build_observed_canopy_log_rows(
    metrics_by_grid: Mapping[Any, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Build per-grid Structural/Chlorophyll metric rows for request logs."""

    rows: list[dict[str, Any]] = []
    for grid_id, metrics in metrics_by_grid.items():
        row: dict[str, Any] = {"grid_id": grid_id}
        for parameter in OBSERVED_CANOPY_PARAMETERS:
            row[parameter] = metrics.get(parameter)
        rows.append(row)
    return rows


@router.post(
    "/satellite-dates",
    response_model=SatelliteDatesResponse,
    dependencies=[Depends(require_authenticated_user)],
)
async def satellite_dates(request: SatelliteDatesRequest) -> SatelliteDatesResponse:
    """
    List the days in a period on which a satellite photographed the farm.

    Each day says whether it has a Sentinel-2 optical image (with how much of the farm was under
    cloud) and/or a Sentinel-1 radar image. Pick one and send it as `image_date` to `/analyze`.
    """

    farm_geo_df = parse_geojson(request.farm_geojson)
    # The farm itself is the area of interest; one cell the size of the farm is enough.
    grid_geo_df = create_grid(farm_geo_df, cell_size=_whole_farm_cell_size(farm_geo_df))
    acquisitions = await list_satellite_acquisitions(
        grid_geo_df=grid_geo_df,
        start_date=request.start_date,
        end_date=request.end_date,
    )
    passes = [SatellitePass(**row) for row in satellite_passes(acquisitions)]
    logger.info(
        "satellite_dates_listed",
        extra={
            "start_date": request.start_date.isoformat(),
            "end_date": request.end_date.isoformat(),
            "optical_days": len(acquisitions.optical),
            "radar_days": len(acquisitions.radar),
        },
    )
    return SatelliteDatesResponse(dates=passes)


def _whole_farm_cell_size(farm_geo_df: Any) -> int:
    """A grid cell side (m) at least as large as the farm, so the grid is the farm outline itself."""

    projected = farm_geo_df.to_crs(estimate_utm_crs(farm_geo_df))
    min_x, min_y, max_x, max_y = projected.total_bounds
    return max(1, int(max(max_x - min_x, max_y - min_y)) + 1)


@router.post(
    "/analyze",
    response_model=FarmAnalysisResponse,
    dependencies=[Depends(require_authenticated_user)],
)
async def analyze_farm(
    http_request: Request,
    request: FarmAnalysisRequest = Body(
        ...,
        openapi_examples={
            "valid_polygon_featurecollection": {
                "summary": "Valid farm analysis payload",
                "value": SAMPLE_FARM_ANALYSIS_REQUEST,
            }
        },
    ),
) -> FarmAnalysisResponse:
    """
    Analyze a farm boundary and return grid-level crop intelligence.

    This endpoint validates the submitted farm GeoJSON, date range, crop category,
    and grid size, then returns a stateless GeoJSON `FeatureCollection` for GIS
    and frontend clients.

    ### Processing
    - Dynamically generates square grid cells from the farm boundary using
      `grid_size`, which defaults to a 50 m grid.
    - Fetches Open-Meteo weather telemetry, Open-Meteo historical climatology,
      and Google Earth Engine zonal metrics in parallel for the requested date window.
    - Combines the telemetry into grid-cell metrics before calculating CPI scores
      and threshold-based advisory actions.

    ### Response
    Each returned grid-cell `Feature` includes:
    - `raw_metrics`: documented raw metrics from Open-Meteo and Google Earth
      Engine.
    - `cpi_scores`: 5 normalized CPI scores for Structural, Chlorophyll,
      Water_Drought, Environmental, and Agro_Meteo clusters.
    - `advisories`: human-readable recommended actions keyed by metric.
    """

    farm_geo_df = parse_geojson(request.farm_geojson)
    grid_geo_df = create_grid(farm_geo_df, cell_size=request.grid_size)
    grid_ids = [row.grid_id for row in grid_geo_df.itertuples(index=False)]

    logger.info(
        "farm_analysis_requested",
        extra={
            "input_features": len(request.farm_geojson.features),
            "grid_cells": len(grid_geo_df),
            "start_date": request.start_date.isoformat(),
            "end_date": request.end_date.isoformat(),
            "crop_category": request.crop_category.value,
            "grid_size": request.grid_size,
            "image_date": request.image_date.isoformat() if request.image_date else None,
        },
    )

    imagery: ImageryInfo | None = None
    if request.image_date is not None:
        try:
            acquisitions = await list_satellite_acquisitions(
                grid_geo_df=grid_geo_df,
                start_date=request.start_date,
                end_date=request.end_date,
            )
        except DomainError as exc:
            # Without the list the chosen day is still the best guess for both sensors.
            logger.warning("satellite_dates_unavailable", extra={"details": exc.details})
            acquisitions = SatelliteAcquisitions(
                optical={request.image_date: None}, radar=frozenset({request.image_date})
            )
        choice = choose_imagery(acquisitions, request.image_date)
        imagery = ImageryInfo(
            image_date=request.image_date,
            optical_date=choice.optical_date,
            radar_date=choice.radar_date,
        )

    weather_result, climatology_result, gee_result = await asyncio.gather(
        fetch_weather_telemetry(
            farm_geo_df=farm_geo_df,
            start_date=request.start_date,
            end_date=request.end_date,
        ),
        fetch_weather_climatology(
            farm_geo_df=farm_geo_df,
            start_date=request.start_date,
            end_date=request.end_date,
        ),
        _fetch_chosen_satellite_metrics(
            grid_geo_df=grid_geo_df,
            start_date=request.start_date,
            end_date=request.end_date,
            imagery=imagery,
        ),
        return_exceptions=True,
    )

    weather_means, hourly_weather_payload = unwrap_result(
        weather_result,
        label="weather_telemetry_failed",
    )

    weather_climatology = None
    if isinstance(climatology_result, Exception):
        details = climatology_result.details if isinstance(climatology_result, DomainError) else None
        logger.warning(
            "weather_climatology_unavailable",
            extra={
                "error": str(climatology_result),
                "details": details,
                "start_date": request.start_date.isoformat(),
                "end_date": request.end_date.isoformat(),
            },
        )
    else:
        weather_climatology = climatology_result

    gee_metrics_by_grid: dict[int, dict[str, float]]
    if isinstance(gee_result, DomainError):
        logger.warning(
            "gee_metrics_unavailable",
            extra={
                "details": gee_result.details,
                "start_date": request.start_date.isoformat(),
                "end_date": request.end_date.isoformat(),
            },
        )
        gee_metrics_by_grid = {}
    else:
        gee_metrics_by_grid, sar_result = unwrap_result(
            gee_result,
            label="gee_telemetry_failed",
        )
        logger.info(
            "gee_metrics_fetched",
            extra={
                "grid_count_with_gee_metrics": len(gee_metrics_by_grid),
                "sar_effective_start_date": (
                    sar_result.effective_start_date.isoformat()
                    if sar_result.effective_start_date is not None
                    else None
                ),
                "sar_rolled_back_days": sar_result.rolled_back_days,
            },
        )

    raw_metrics_by_grid = build_grid_metrics_from_sources(
        weather_metrics=weather_means,
        gee_metrics_by_grid=gee_metrics_by_grid,
        grid_ids=grid_ids,
    )
    observed_canopy_rows = build_observed_canopy_log_rows(raw_metrics_by_grid)
    logger.info(
        "analysis_observed_canopy_parameters",
        extra={
            "parameters": OBSERVED_CANOPY_PARAMETERS,
            "grid_count": len(observed_canopy_rows),
            "values_by_grid": observed_canopy_rows,
        },
    )

    threshold_payload = getattr(http_request.app.state, "advisory_thresholds", None)
    if threshold_payload is None:
        threshold_payload = load_advisory_thresholds()

    analytics_by_grid = analyze_grid_metrics(
        metrics_by_grid=raw_metrics_by_grid,
        crop_category=request.crop_category.value,
        threshold_payload=threshold_payload,
        hourly_weather=hourly_weather_payload,
        weather_climatology=weather_climatology,
        analysis_days=(request.end_date - request.start_date).days + 1,
    )

    features: list[GridAnalysisFeature] = []
    for row in grid_geo_df.itertuples(index=False):
        grid_id = row.grid_id
        grid_analytics = lookup_grid_payload(analytics_by_grid, grid_id) or {}
        raw_metrics = lookup_grid_payload(raw_metrics_by_grid, grid_id) or {}
        advisories = {
            parameter: advisory.recommended_action
            for parameter, advisory in (getattr(grid_analytics, "advisories", {}) or {}).items()
        }
        cpi_scores = build_cpi_scores(getattr(grid_analytics, "cpi_scores", None))

        features.append(
            GridAnalysisFeature(
                id=grid_id,
                geometry=mapping(row.geometry),
                properties=GridAnalysisProperties(
                    grid_id=grid_id,
                    raw_metrics=dict(raw_metrics),
                    cpi_scores=cpi_scores,
                    advisories=advisories,
                ),
            )
        )

    return FarmAnalysisResponse(features=features, imagery=imagery)


async def _fetch_chosen_satellite_metrics(
    *, grid_geo_df: Any, start_date: Any, end_date: Any, imagery: ImageryInfo | None
):
    """Satellite metrics for the chosen passes, or every pass in the period when none was chosen."""

    if imagery is None:
        return await fetch_satellite_metrics(
            grid_geo_df=grid_geo_df, start_date=start_date, end_date=end_date
        )
    if imagery.optical_date is None and imagery.radar_date is None:
        raise DomainError(
            "No satellite image covers this farm in the chosen period.",
            details={"image_date": imagery.image_date.isoformat() if imagery.image_date else None},
        )
    return await fetch_satellite_metrics(
        grid_geo_df=grid_geo_df,
        start_date=start_date,
        end_date=end_date,
        optical_date=imagery.optical_date,
        radar_date=imagery.radar_date,
    )
