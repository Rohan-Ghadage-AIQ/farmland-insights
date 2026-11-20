from __future__ import annotations

import re

CLUSTER_PARAMS: dict[str, tuple[str, ...]] = {
    "Structural": ("ndvi", "evi", "savi", "rvi", "dprvi", "dpsvi", "csi"),
    "Chlorophyll": ("gndvi", "ndre"),
    "Water_Drought": ("ndmi", "swdi", "cmi", "ai_dm", "vci", "tci", "vhi", "nddi", "spi", "spei", "rfdi"),
    "Environmental": ("t2m", "lst", "rh", "soil_moist", "soil_temp"),
    "Agro_Meteo": ("crti", "gdd", "rwi", "payout", "precip", "et_actual"),
}

PARAM_TO_CLUSTER: dict[str, str] = {
    parameter: cluster_name
    for cluster_name, parameters in CLUSTER_PARAMS.items()
    for parameter in parameters
}

T_BASE_BY_CROP_PREFIX: dict[str, float] = {
    "cereals_c3": 5.0,
    "cereals_c4": 10.0,
    "legumes": 5.0,
    "tubers": 7.0,
    "oilseeds": 5.0,
    "fruits": 10.0,
    "vegetables": 5.0,
}

RANGE_PATTERN = re.compile(r"^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*-\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$")

