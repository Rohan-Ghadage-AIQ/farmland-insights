from __future__ import annotations

import math
from typing import Any

import geopandas as gpd
from pyproj import CRS
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from app.exceptions import DomainError
from app.models.requests import FarmFeatureCollection

WGS84_EPSG = 4326
_SUPPORTED_GEOMETRY_TYPES = {"Polygon", "MultiPolygon"}


def parse_geojson(farm_geojson: FarmFeatureCollection | dict[str, Any]) -> gpd.GeoDataFrame:
    """
    Parse and validate a GeoJSON FeatureCollection into a GeoDataFrame.

    Accepts a FarmFeatureCollection Pydantic model or a raw dict. Validates the
    FeatureCollection structure, feature objects, geometry presence, supported
    geometry types, polygon validity, and WGS84 coordinate bounds. Returns a
    GeoDataFrame in EPSG:4326 with a source_feature_id column tracking each
    feature's original id, or its 1-based position if no id is present.

    Raises:
        DomainError: On any structural, geometry, or coordinate validation failure.
    """

    payload = (
        farm_geojson.model_dump(mode="json")
        if isinstance(farm_geojson, FarmFeatureCollection)
        else farm_geojson
    )
    if not isinstance(payload, dict):
        raise DomainError(
            "farm_geojson must be a GeoJSON FeatureCollection object.",
            details={"received_type": type(farm_geojson).__name__},
        )

    if payload.get("type") != "FeatureCollection":
        raise DomainError(
            "farm_geojson.type must be FeatureCollection.",
            details={"received_type": payload.get("type")},
        )

    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise DomainError(
            "farm_geojson.features must contain at least one feature.",
            details={"features_type": type(features).__name__ if features is not None else None},
        )

    feature_ids: list[str | int] = []
    for idx, feature in enumerate(features, start=1):
        if not isinstance(feature, dict):
            raise DomainError(
                "Each feature must be an object.",
                details={"feature_index": idx},
            )
        feature_id = feature.get("id")
        feature_ids.append(feature_id if feature_id is not None else idx)

    geo_df = gpd.GeoDataFrame.from_features(features, crs=f"EPSG:{WGS84_EPSG}")
    if geo_df.empty:
        raise DomainError("No geometries could be parsed from farm_geojson.")

    geo_df = geo_df.set_geometry("geometry")
    geo_df["source_feature_id"] = feature_ids

    if geo_df.geometry.isna().any() or geo_df.geometry.is_empty.any():
        raise DomainError("farm_geojson contains null or empty geometries.")

    invalid_types = sorted(
        {
            geometry.geom_type
            for geometry in geo_df.geometry
            if geometry.geom_type not in _SUPPORTED_GEOMETRY_TYPES
        }
    )
    if invalid_types:
        raise DomainError(
            "farm_geojson contains unsupported geometry type(s).",
            details={"supported": sorted(_SUPPORTED_GEOMETRY_TYPES), "received": invalid_types},
        )

    invalid_rows = geo_df.index[~geo_df.geometry.is_valid].tolist()
    if invalid_rows:
        raise DomainError(
            "farm_geojson contains invalid polygon geometry.",
            details={"invalid_feature_indices": invalid_rows},
        )

    geo_df = _ensure_wgs84(geo_df)
    min_x, min_y, max_x, max_y = geo_df.total_bounds
    if min_x < -180 or max_x > 180 or min_y < -90 or max_y > 90:
        raise DomainError(
            "farm_geojson coordinates must be in WGS84 longitude/latitude ranges.",
            details={"bounds": [min_x, min_y, max_x, max_y]},
        )

    return geo_df


def estimate_utm_crs(geo_df: gpd.GeoDataFrame) -> CRS:
    """
    Estimate the best-fit UTM CRS for a GeoDataFrame based on its unioned centroid.

    Reprojects to WGS84, derives the centroid of the unioned geometry, computes the
    UTM zone number from longitude, and selects the northern (EPSG 326xx) or southern
    (EPSG 327xx) hemisphere EPSG code based on latitude.

    Raises:
        DomainError: If the GeoDataFrame is empty or the centroid falls outside
            valid WGS84 ranges.
    """

    if geo_df.empty:
        raise DomainError("Cannot estimate UTM CRS for empty geometry data.")

    geo_df_wgs84 = _ensure_wgs84(geo_df)
    centroid = geo_df_wgs84.geometry.union_all().centroid

    longitude = float(centroid.x)
    latitude = float(centroid.y)
    if longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90:
        raise DomainError(
            "Geometry centroid is outside valid WGS84 ranges.",
            details={"longitude": longitude, "latitude": latitude},
        )

    zone_number = int((longitude + 180) / 6) + 1
    zone_number = max(1, min(60, zone_number))

    epsg = 32600 + zone_number if latitude >= 0 else 32700 + zone_number
    return CRS.from_epsg(epsg)


def create_grid(geo_df: gpd.GeoDataFrame, cell_size: int = 50) -> gpd.GeoDataFrame:
    """
    Create a clipped square grid in local UTM for metric accuracy, then return in WGS84.

    Parameters
    ----------
    geo_df:
        Farm geometry as a GeoDataFrame. Input can be any CRS.
    cell_size:
        Grid cell side length in meters.
    """

    if cell_size <= 0:
        raise DomainError(
            "grid_size must be greater than zero.",
            details={"grid_size": cell_size},
        )
    if geo_df.empty:
        raise DomainError("Cannot create grid for empty geometry data.")

    farm_wgs84 = _ensure_wgs84(geo_df)
    utm_crs = estimate_utm_crs(farm_wgs84)
    farm_utm = farm_wgs84.to_crs(utm_crs)
    farm_polygon = farm_utm.geometry.union_all()
    if farm_polygon.is_empty:
        raise DomainError("Farm geometry is empty after UTM reprojection.")

    min_x, min_y, max_x, max_y = farm_polygon.bounds
    cols = math.ceil((max_x - min_x) / cell_size)
    rows = math.ceil((max_y - min_y) / cell_size)

    cells: list[dict[str, Any]] = []
    grid_id = 1
    for row in range(rows):
        for col in range(cols):
            x0 = min_x + (col * cell_size)
            y0 = min_y + (row * cell_size)
            cell = box(x0, y0, x0 + cell_size, y0 + cell_size)

            clipped = _extract_polygonal(cell.intersection(farm_polygon))
            if clipped is None or clipped.is_empty:
                continue

            cells.append({"grid_id": grid_id, "geometry": clipped})
            grid_id += 1

    if not cells:
        raise DomainError("No grid cells were produced for the provided farm geometry.")

    grid_utm = gpd.GeoDataFrame(cells, crs=utm_crs, geometry="geometry")
    return grid_utm.to_crs(epsg=WGS84_EPSG)


def _ensure_wgs84(geo_df: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Ensure a GeoDataFrame has WGS84 CRS.

    If CRS is unset, assigns EPSG:4326 without transforming coordinates. Otherwise,
    reprojects from the existing CRS to EPSG:4326.
    """

    if geo_df.crs is None:
        return geo_df.set_crs(epsg=WGS84_EPSG, allow_override=True)
    return geo_df.to_crs(epsg=WGS84_EPSG)


def _extract_polygonal(geometry: BaseGeometry) -> BaseGeometry | None:
    """
    Extract the polygonal component from a geometry.

    Passes Polygon and MultiPolygon through unchanged. For GeometryCollections,
    unions non-empty polygonal members and returns the result only if it is Polygon
    or MultiPolygon. Returns None for empty geometries, non-polygonal types, or
    collections without a valid polygonal result.
    """

    if geometry.is_empty:
        return None

    if geometry.geom_type in _SUPPORTED_GEOMETRY_TYPES:
        return geometry

    if geometry.geom_type == "GeometryCollection":
        polygonal = [
            part
            for part in geometry.geoms
            if not part.is_empty and part.geom_type in _SUPPORTED_GEOMETRY_TYPES
        ]
        if not polygonal:
            return None
        merged = unary_union(polygonal)
        if merged.is_empty or merged.geom_type not in _SUPPORTED_GEOMETRY_TYPES:
            return None
        return merged

    return None
