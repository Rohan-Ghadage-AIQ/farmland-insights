"""Live smoke test of satellite-date listing and single-pass fetching (needs EE_PROJECT_ID).

Run from the project root:  EE_PROJECT_ID=<project> PYTHONPATH=. .venv/Scripts/python scripts/check_satellite_dates_live.py
"""

import asyncio
import os
from datetime import date

from app.config import get_settings
from app.models.requests import FarmFeatureCollection
from app.services import gee_service
from app.services.geometry_service import create_grid, parse_geojson
from app.services.imagery import choose_imagery, satellite_passes
from app.utils.payloads import SAMPLE_FARM_ANALYSIS_REQUEST as R


async def main() -> None:
    project = os.environ.get("EE_PROJECT_ID") or get_settings().ee_project_id
    farm = parse_geojson(FarmFeatureCollection(**R["farm_geojson"]))
    grid = create_grid(farm, cell_size=50)
    start, end = date(2026, 9, 1), date(2026, 9, 30)

    acquisitions = await gee_service.list_gee_acquisitions(
        grid_geo_df=grid, start_date=start, end_date=end, ee_project_id=project
    )
    rows = satellite_passes(acquisitions)
    print(f"passes: {len(rows)}")
    for row in rows[:8]:
        print("  ", row)
    if not rows:
        return

    clear = [r for r in rows if r["optical"] and r["cloud_cover"] is not None and r["cloud_cover"] <= 30]
    pick = (clear or rows)[0]["date"]
    choice = choose_imagery(acquisitions, pick)
    print("picked", pick, "->", choice)

    metrics, sar = await gee_service.fetch_gee_zonal_metrics(
        grid_geo_df=grid,
        start_date=start,
        end_date=end,
        ee_project_id=project,
        optical_date=choice.optical_date,
        radar_date=choice.radar_date,
    )
    print(f"cells with metrics: {len(metrics)} of {len(grid)}; sar effective start {sar.effective_start_date}")
    for grid_id, values in list(metrics.items())[:2]:
        shown = {k: round(v, 3) for k, v in values.items() if k in ("ndvi", "evi", "savi", "ndre", "ndwi", "ndmi", "rvi", "rsm")}
        print("  cell", grid_id, shown)


asyncio.run(main())
