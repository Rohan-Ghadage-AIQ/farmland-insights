from __future__ import annotations

import math
import os

import geopandas as gpd
from shapely.geometry import box


def integration_enabled() -> bool:
    """
    Returns True if live GEE integration tests are enabled via the
    RUN_GEE_INTEGRATION_TESTS environment variable.

    Defaults to False so integration tests are skipped in local and CI
    environments unless explicitly opted in by setting the variable to "1".
    """
    return os.getenv("RUN_GEE_INTEGRATION_TESTS", "0") == "1"


def build_real_gee_test_grid() -> gpd.GeoDataFrame:
    """
    Builds a minimal one-polygon GeoDataFrame for live GEE integration tests.

    Uses a fixed 0.05° x 0.05° bounding box in Santa Clara County, California
    as a stable AOI with expected Sentinel-1 and Sentinel-2 coverage. The returned
    GeoDataFrame has EPSG:4326 coordinates and a single grid_id value of 1.
    """

    geometry = box(-121.9000, 37.0000, -121.8500, 37.0500)
    return gpd.GeoDataFrame(
        {"grid_id": [1], "geometry": [geometry]},
        crs="EPSG:4326",
    )


def is_finite_number(value: object) -> bool:
    """
    Returns True if value can be cast to a finite float.

    Safely handles any input type; returns False for None, non-numeric strings,
    NaN, infinity, and any value that cannot be converted to float. Numeric strings
    such as "12.5" are treated as valid finite numbers.
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number)
