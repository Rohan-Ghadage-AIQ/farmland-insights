"""Reusable payload samples used by API docs/examples."""

SAMPLE_FARM_ANALYSIS_REQUEST = {
    "farm_geojson": {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "farm-1",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [77.10, 28.60],
                            [77.11, 28.60],
                            [77.11, 28.61],
                            [77.10, 28.61],
                            [77.10, 28.60],
                        ]
                    ],
                },
                "properties": {},
            }
        ],
    },
    "start_date": "2026-04-01",
    "end_date": "2026-04-18",
    "crop_category": "cereals_c3_temperate",
    "grid_size": 50,
}

SAMPLE_FARM_ANALYSIS_RESPONSE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "id": 1,
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [77.100000, 28.600000],
                        [77.100510, 28.600000],
                        [77.100510, 28.600450],
                        [77.100000, 28.600450],
                        [77.100000, 28.600000],
                    ]
                ],
            },
            "properties": {
                "grid_id": 1,
                "raw_metrics": {
                    "ndvi": 0.64,
                    "evi": 0.42,
                    "savi": 0.55,
                    "gndvi": 0.58,
                    "ndre": 0.46,
                    "ndmi": 0.31,
                    "lst": 31.4,
                    "rvi": 0.73,
                    "t2m": 24.8,
                    "rh": 62.4,
                    "precip": 18.6,
                    "soil_moist": 0.34,
                    "soil_temp": 22.1,
                    "et_actual": 4.2,
                },
                "cpi_scores": {
                    "Structural": 0.71,
                    "Chlorophyll": 0.64,
                    "Water_Drought": 0.58,
                    "Environmental": 0.69,
                    "Agro_Meteo": 0.61,
                },
                "advisories": {
                    "ndvi": "Routine scout for pests",
                    "evi": "Check canopy for early rust",
                    "savi": "Monitor canopy vigor",
                    "gndvi": "Maintain current N schedule",
                    "ndre": "No change to N program",
                    "ndmi": "Check drip system pressure",
                    "rvi": "Maintain residue cover",
                    "t2m": "Maintain current irrigation",
                    "rh": "Check airflow in canopy",
                    "precip": "Monitor water balance weekly",
                    "soil_moist": "Monitor soil probes daily",
                    "soil_temp": "Maintain mulching layers",
                    "et_actual": "Standard irrigation routine",
                },
            },
        }
    ],
}
