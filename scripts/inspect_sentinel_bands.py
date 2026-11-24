"""
Show the actual Sentinel-2 band values behind a field's indices, pixel by pixel.

Reads the same Sentinel-2 L2A files the app uses (Microsoft Planetary Computer), so every
number can be checked by hand or against the Copernicus Browser. For each 10 m pixel inside the
field it prints the raw digital number (DN) of each band, the reflectance after ESA's correction
((DN - 1000) / 10000 for processing baseline 04.00 and later), the scene class, and NDWI computed
both ways. Everything is also written to a CSV.

    .venv\\Scripts\\python scripts\\inspect_sentinel_bands.py --date 2026-11-14 --geojson field.geojson
    .venv\\Scripts\\python scripts\\inspect_sentinel_bands.py --date 2026-11-14 --lat 17.4883 --lon 74.5341 --size 37

--geojson takes the field boundary (a Polygon, Feature or FeatureCollection, lon/lat). Without it,
a square of --size metres centred on --lat/--lon is used.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path

# A machine-wide PROJ_LIB (PostGIS, QGIS) breaks rasterio's reprojection; use its own data.
for _name in ("PROJ_DATA", "PROJ_LIB"):
    os.environ.pop(_name, None)

import numpy as np  # noqa: E402
import planetary_computer  # noqa: E402
import rasterio  # noqa: E402
from pystac_client import Client  # noqa: E402
from rasterio.features import geometry_mask  # noqa: E402
from rasterio.warp import transform_bounds, transform_geom  # noqa: E402
from rasterio.windows import from_bounds  # noqa: E402
from shapely.geometry import box, mapping, shape  # noqa: E402

CATALOG = "https://planetarycomputer.microsoft.com/api/stac/v1"
BANDS = ("B02", "B03", "B04", "B05", "B08", "B11", "B12")
BAND_NAMES = {
    "B02": "Blue", "B03": "Green", "B04": "Red", "B05": "RedEdge",
    "B08": "NIR", "B11": "SWIR1", "B12": "SWIR2",
}
SCL_NAMES = {
    0: "no data", 1: "saturated", 2: "dark area", 3: "cloud shadow", 4: "vegetation",
    5: "bare soil", 6: "water", 7: "unclassified", 8: "cloud (medium)", 9: "cloud (high)",
    10: "thin cirrus", 11: "snow",
}


def field_geometry(args: argparse.Namespace):
    if args.geojson:
        data = json.loads(Path(args.geojson).read_text(encoding="utf-8"))
        if data.get("type") == "FeatureCollection":
            data = data["features"][0]
        if data.get("type") == "Feature":
            data = data["geometry"]
        return shape(data)
    half_lat = args.size / 2 / 111_320
    half_lon = half_lat / math.cos(math.radians(args.lat))
    return box(args.lon - half_lon, args.lat - half_lat, args.lon + half_lon, args.lat + half_lat)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", required=True, help="image date, YYYY-MM-DD")
    parser.add_argument("--geojson", help="field boundary file")
    parser.add_argument("--lat", type=float)
    parser.add_argument("--lon", type=float)
    parser.add_argument("--size", type=float, default=37.0, help="square side in metres (default 37)")
    parser.add_argument("--csv", help="output CSV (default sentinel_bands_<date>.csv)")
    args = parser.parse_args()
    if not args.geojson and (args.lat is None or args.lon is None):
        parser.error("give --geojson, or --lat and --lon")

    field = field_geometry(args)
    catalog = Client.open(CATALOG, modifier=planetary_computer.sign_inplace)
    items = list(
        catalog.search(
            collections=["sentinel-2-l2a"], intersects=mapping(field), datetime=f"{args.date}/{args.date}"
        ).items()
    )
    if not items:
        sys.exit(f"No Sentinel-2 L2A image covers this field on {args.date}.")
    item = items[0]
    baseline = item.properties.get("s2:processing_baseline", "0")
    offset = 1000.0 if float(baseline) >= 4.0 else 0.0
    print(f"Image     {item.id}")
    print(f"Taken     {item.properties.get('datetime')}")
    print(f"Baseline  {baseline}  ->  reflectance = (DN - {offset:.0f}) / 10000")
    print(f"Tile cloud cover {item.properties.get('eo:cloud_cover'):.1f}%\n")

    # The 10 m NIR band sets the pixel grid; 20 m bands are resampled onto it (SCL by nearest).
    with rasterio.open(item.assets["B08"].href) as src:
        bounds = transform_bounds("EPSG:4326", src.crs, *field.bounds)
        window = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        transform = src.window_transform(window)
        crs = src.crs
        grid_shape = (int(window.height), int(window.width))
    dn = {}
    for band in (*BANDS, "SCL"):
        with rasterio.open(item.assets[band].href) as src:
            w = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
            dn[band] = src.read(
                1, window=w, out_shape=grid_shape,
                resampling=rasterio.enums.Resampling.nearest,
            ).astype(float)

    inside = ~geometry_mask(
        [transform_geom("EPSG:4326", crs, mapping(field))], grid_shape, transform, all_touched=False
    )
    if not inside.any():  # field smaller than a pixel centre grid: take touched pixels
        inside = ~geometry_mask(
            [transform_geom("EPSG:4326", crs, mapping(field))], grid_shape, transform, all_touched=True
        )

    refl = {band: (dn[band] - offset) / 10000.0 for band in BANDS}
    green, nir, swir2 = refl["B03"], refl["B08"], refl["B12"]
    ndwi_water = (green - nir) / (green + nir)  # McFeeters: (B3 - B8) / (B3 + B8)
    ndwi_crop = (nir - swir2) / (nir + swir2)  # crop water: (B8 - B12) / (B8 + B12)
    ndvi = (nir - refl["B04"]) / (nir + refl["B04"])

    out = Path(args.csv or f"sentinel_bands_{args.date}.csv")
    header = (
        ["row", "col", "lon", "lat", "scene_class"]
        + [f"{b}_DN" for b in BANDS]
        + [f"{b}_{BAND_NAMES[b]}_refl" for b in BANDS]
        + ["NDVI", "NDWI_B3_B8", "NDWI_B8_B12"]
    )
    rows = []
    for r, c in zip(*np.nonzero(inside)):
        x, y = transform * (c + 0.5, r + 0.5)
        lon, lat = rasterio.warp.transform(crs, "EPSG:4326", [x], [y])
        scl = int(dn["SCL"][r, c])
        rows.append(
            [r, c, round(lon[0], 6), round(lat[0], 6), f"{scl} {SCL_NAMES.get(scl, '?')}"]
            + [int(dn[b][r, c]) for b in BANDS]
            + [round(float(refl[b][r, c]), 4) for b in BANDS]
            + [round(float(v[r, c]), 4) for v in (ndvi, ndwi_water, ndwi_crop)]
        )
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        writer.writerows(rows)

    print(f"{len(rows)} pixels inside the field\n")
    print(f"{'pixel (lat, lon)':<24}{'class':<14}{'B03 DN':>7}{'B08 DN':>7}{'B12 DN':>7}"
          f"{'Green':>8}{'NIR':>7}{'SWIR2':>7}{'NDWI 3/8':>10}{'NDWI 8/12':>10}")
    for row in rows:
        lat, lon, cls = row[3], row[2], row[4].split(" ", 1)[1]
        d = dict(zip(header, row))
        print(f"{lat:.5f}, {lon:.5f}       {cls:<14}{d['B03_DN']:>7}{d['B08_DN']:>7}{d['B12_DN']:>7}"
              f"{d['B03_Green_refl']:>8.3f}{d['B08_NIR_refl']:>7.3f}{d['B12_SWIR2_refl']:>7.3f}"
              f"{d['NDWI_B3_B8']:>10.3f}{d['NDWI_B8_B12']:>10.3f}")
    print("\nField average")
    for name, values in (("Green (B03)", green), ("NIR (B08)", nir), ("SWIR2 (B12)", swir2),
                         ("NDVI", ndvi), ("NDWI (B3-B8)/(B3+B8)", ndwi_water),
                         ("NDWI (B8-B12)/(B8+B12)", ndwi_crop)):
        print(f"  {name:<24}{float(np.mean(values[inside])):>8.3f}")
    print(f"\nSaved every pixel to {out.resolve()}")


if __name__ == "__main__":
    main()
