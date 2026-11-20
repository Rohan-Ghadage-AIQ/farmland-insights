"""Try the STAC satellite service (Sentinel-1, Sentinel-2, Landsat) on any area and dates.

Needs no PropelAuth or Earth Engine credentials. Run from the repo root:

    uv run python scripts/check_satellite.py --geojson path/to/farm.geojson --start 2024-01-01 --end 2024-02-15
    uv run python scripts/check_satellite.py --bbox 72.400 23.600 72.405 23.605 --start 2024-01-01 --end 2024-02-15
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import geopandas as gpd  # noqa: E402
from shapely.geometry import box  # noqa: E402

from app.services import stac_service as stac  # noqa: E402
from app.services.geometry_service import create_grid  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    area = parser.add_mutually_exclusive_group(required=True)
    area.add_argument("--geojson", help="Farm boundary file (GeoJSON, GPKG, shapefile)")
    area.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"), help="Lon/lat box")
    parser.add_argument("--start", required=True, type=date.fromisoformat, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, type=date.fromisoformat, help="YYYY-MM-DD")
    parser.add_argument("--grid", type=int, default=50, help="Grid cell size in metres (default 50)")
    parser.add_argument("--cloud", type=int, default=30, help="Max cloud cover %% (default 30)")
    args = parser.parse_args()

    if args.geojson:
        farm = gpd.read_file(args.geojson).to_crs(4326)
    else:
        farm = gpd.GeoDataFrame(geometry=[box(*args.bbox)], crs=4326)
    grid = create_grid(farm, cell_size=args.grid)
    bbox = stac._grid_bbox(grid)
    print(f"Grid cells: {len(grid)}   period: {args.start} -> {args.end}\n")

    print("== Scenes available ==")
    for name, collection, cloud in (
        ("Sentinel-2", stac.SENTINEL2_COLLECTION, args.cloud),
        ("Landsat", stac.LANDSAT_C2_L2_COLLECTION, args.cloud),
        ("Sentinel-1", stac.SENTINEL1_RTC_COLLECTION, None),
    ):
        items = stac._stac_search(collection, bbox, args.start, args.end, max_cloud_cover=cloud)
        dates = sorted({str(i.datetime)[:10] for i in items})
        print(f"{name:11s} {len(items):3d} scenes  {', '.join(dates) or '-'}")

    print("\n== Indices (min / mean / max across grid cells) ==")
    metrics, sar = asyncio.run(
        stac.fetch_stac_zonal_metrics(
            grid_geo_df=grid, start_date=args.start, end_date=args.end, max_cloud_cover=args.cloud
        )
    )
    print(f"Cells with data: {len(metrics)}/{len(grid)}   SAR rolled back {sar.rolled_back_days} days\n")
    for group, bands in (
        ("Sentinel-2", stac.OPTICAL_INDEX_BANDS),
        ("Landsat", stac.LANDSAT_LST_BANDS),
        ("Sentinel-1", stac.SAR_INDEX_BANDS),
    ):
        for band in bands:
            values = [m[band] for m in metrics.values() if band in m]
            stats = (
                f"{min(values):9.4f} / {statistics.mean(values):9.4f} / {max(values):9.4f}"
                if values
                else "NO DATA"
            )
            print(f"{group:11s} {band:6s} n={len(values):4d}  {stats}")


if __name__ == "__main__":
    main()
