from __future__ import annotations
from collections.abc import Mapping, Sequence
import math
from typing import Any, TypeAlias
from app.dataclasses import (
    AdvisoryResult, 
    GridAnalyticsResult, 
    ParsedRange, 
    ThresholdRule
)
from app.exceptions import DomainError
from app.utils.analytics_constants import (
    CLUSTER_PARAMS, 
    PARAM_TO_CLUSTER, 
    RANGE_PATTERN, 
    T_BASE_BY_CROP_PREFIX
)



GridId: TypeAlias = int | str

EPSILON = 1e-10
DEFAULT_GDD_T_BASE = 5.0
DEFAULT_FIELD_CAPACITY = 0.5



def get_gdd_t_base(crop_category: str) -> float:
    '''
    Purpose:
        Resolve crop-category specific base temperature for GDD calculation.
    Example:
        crop_category = "tubers_temperate"
        get_gdd_t_base(crop_category) -> 7.0
        get_gdd_t_base("unknown_crop") -> 5.0
    '''
    for crop_prefix, t_base in T_BASE_BY_CROP_PREFIX.items():
        if crop_category.startswith(crop_prefix):
            return t_base
    return DEFAULT_GDD_T_BASE


def build_threshold_index(
    threshold_payload: Mapping[str, Any],
    crop_category: str,
) -> dict[str, ThresholdRule]:
    '''
    Build a parameter -> ThresholdRule lookup dict from a structured threshold payload.

    Payload structure:
        base_thresholds:    {crop_category: [[param, v1, ..., v10], ...]}
        sar_thresholds:     {param_name: [v1, ..., v10]}
        derived_thresholds: {param_name: [v1, ..., v10] | {crop_category: [v1, ..., v10]}}

    Rows that are not sequences or have too few columns are skipped.
    Derived threshold maps can be crop-specific; missing crop entries are skipped.
    Later sections overwrite earlier entries on parameter name collision.

    Raises:
        DomainError: if required sections are missing, malformed, or crop_category has no rows.

    Example:
        idx = build_threshold_index(payload, "cereals_c3_temperate")
        idx["ndvi"].min_value  # -> 0.4
        idx["rvi"].high_range  # -> ">0.8"
    '''

    required_sections = {"base_thresholds", "sar_thresholds", "derived_thresholds"}
    missing_sections = sorted(required_sections - set(threshold_payload))
    if missing_sections:
        raise DomainError(
            "Threshold payload is missing required sections.",
            details={"missing_sections": missing_sections},
        )

    base_thresholds = threshold_payload.get("base_thresholds")
    if not isinstance(base_thresholds, Mapping):
        raise DomainError(
            "base_thresholds must be a mapping.",
            details={"received_type": type(base_thresholds).__name__},
        )
    category_rows = base_thresholds.get(crop_category)
    if not isinstance(category_rows, Sequence) or isinstance(category_rows, (str, bytes, bytearray)):
        raise DomainError(
            "No threshold rows found for crop category.",
            details={"crop_category": crop_category},
        )

    threshold_index: dict[str, ThresholdRule] = {}
    for row in category_rows:
        parsed_row = _normalize_threshold_row(row, expected_length=11)
        if parsed_row is None:
            continue
        parameter = parsed_row[0]
        threshold_index[parameter] = _build_threshold_rule(
            crop_category=crop_category,
            parameter=parameter,
            row_values=parsed_row[1:],
        )

    for section_name in ("sar_thresholds", "derived_thresholds"):
        section = threshold_payload.get(section_name)
        if not isinstance(section, Mapping):
            raise DomainError(
                "Threshold section must be a mapping.",
                details={"section": section_name, "received_type": type(section).__name__},
            )
        for parameter, row_values in section.items():
            parameter_name = str(parameter).strip()
            if isinstance(row_values, Mapping):
                row_values = row_values.get(crop_category)
            parsed_values = _normalize_threshold_row(row_values, expected_length=10)
            if not parameter_name or parsed_values is None:
                continue
            threshold_index[parameter_name] = _build_threshold_rule(
                crop_category=crop_category,
                parameter=parameter_name,
                row_values=parsed_values,
            )

    return threshold_index


def calculate_derived_indices(
    metrics_by_grid: Mapping[GridId, Mapping[str, Any]],
    *,
    crop_category: str,
    threshold_index: Mapping[str, ThresholdRule],
    hourly_weather: Mapping[str, Any] | None = None,
    weather_climatology: Mapping[str, Any] | None = None,
    analysis_days: int | None = None,
) -> dict[GridId, dict[str, float]]:
    '''
    Compute derived agro-meteorological indices per grid from raw satellite and weather metrics.

    Most indices are computed conditionally: a missing input, missing hourly weather
    value, or missing threshold rule omits that index from the result dict for that grid.

    Shared inputs computed before the per-grid loop:
        - VCI uses ndvi_min/ndvi_max across all grids; collapses to 50.0 if range is zero.
        - TCI uses lst_min/lst_max across all grids; collapses to 50.0 if range is zero.
        - GDD uses hourly temperatures and the crop-specific base temperature.
        - CRTI uses cumulative precip across all grids; missing values contribute 0.0.

    Args:
        metrics_by_grid:  {grid_id: raw metric dict}; values may include ndvi, ndwi,
                        lst, soil_moist, t2m, precip, and et_actual.
        crop_category:    used for GDD base-temperature lookup.
        threshold_index:  provides bounds for payout checks.
        hourly_weather:   optional; drives GDD. Absent means GDD is skipped.
        weather_climatology: optional historical mean/SD normals for SPI, SPEI, and RWI.
        analysis_days:    observation window in days; inferred from hourly_weather
                        if None, or defaults to 1 if hourly_weather is absent.

    Returns:
        {grid_id: {index_name: float}}
        Possible keys: nddi, swdi, cmi, ai_dm, vci, tci, vhi, spi, spei,
        gdd, crti, rwi, payout.
        payout is binary (0.0 or 1.0); all others are continuous.

    Raises:
        DomainError: if resolved analysis_days <= 0.
    '''

    hourly_temps = _extract_hourly_temperatures(hourly_weather)
    gdd_value = _calculate_gdd(hourly_temps, crop_category)

    resolved_days = analysis_days
    if resolved_days is None:
        resolved_days = max(1, math.ceil(len(hourly_temps) / 24)) if hourly_temps else 1
    if resolved_days <= 0:
        raise DomainError(
            "analysis_days must be greater than zero.",
            details={"analysis_days": resolved_days},
        )

    ndvi_values = [
        value
        for value in (_coerce_float(metrics.get("ndvi")) for metrics in metrics_by_grid.values())
        if value is not None
    ]
    ndvi_min = min(ndvi_values) if ndvi_values else None
    ndvi_max = max(ndvi_values) if ndvi_values else None
    ndvi_range = None if ndvi_min is None or ndvi_max is None else (ndvi_max - ndvi_min)

    lst_values = [
        value
        for value in (_coerce_float(metrics.get("lst")) for metrics in metrics_by_grid.values())
        if value is not None
    ]
    lst_min = min(lst_values) if lst_values else None
    lst_max = max(lst_values) if lst_values else None
    lst_range = None if lst_min is None or lst_max is None else (lst_max - lst_min)

    precip_rule = threshold_index.get("precip")
    t2m_rule = threshold_index.get("t2m")
    crti_value = sum(
        _coerce_float(metrics.get("precip")) or 0.0
        for metrics in metrics_by_grid.values()
    )

    derived_by_grid: dict[GridId, dict[str, float]] = {}
    for grid_id, metrics in metrics_by_grid.items():
        ndvi = _coerce_float(metrics.get("ndvi"))
        ndwi = _coerce_float(metrics.get("ndwi"))
        soil_moist = _coerce_float(metrics.get("soil_moist"))
        precip = _coerce_float(metrics.get("precip"))
        et_actual = _coerce_float(metrics.get("et_actual"))
        t2m = _coerce_float(metrics.get("t2m"))
        lst = _coerce_float(metrics.get("lst"))

        derived: dict[str, float] = {}

        if ndvi is not None and ndwi is not None:
            denominator = ndvi + ndwi
            if abs(denominator) > EPSILON:
                derived["nddi"] = _clip((ndvi - ndwi) / denominator, 0.0, 1.0)

        if soil_moist is not None:
            derived["swdi"] = _clip(1.0 - (soil_moist / DEFAULT_FIELD_CAPACITY), 0.0, 1.0)  #Field capacity is assumed to be 0.5 m3/m3; this is a simplification and may not hold for all soil types.

        if precip is not None and et_actual is not None:
            cmi_denom = max(abs(et_actual), 0.1)
            derived["cmi"] = _clip((precip - et_actual) / cmi_denom, -3.0, 3.0)

        if precip is not None and t2m is not None:
            ai_denominator = t2m + 10.0
            if abs(ai_denominator) > EPSILON:
                derived["ai_dm"] = precip / ai_denominator

        if ndvi is not None and ndvi_range is not None:
            if ndvi_range > 1e-6:
                vci = 100.0 * (ndvi - ndvi_min) / ndvi_range if ndvi_min is not None else 50.0
            else:
                vci = 50.0
            derived["vci"] = _clip(vci, 0.0, 100.0)

        if lst is not None and lst_min is not None and lst_max is not None:
            if lst_range is not None and lst_range > 1e-6:
                tci = 100.0 * (lst_max - lst) / lst_range
            else:
                tci = 50.0
            derived["tci"] = _clip(tci, 0.0, 100.0)

        if "vci" in derived and "tci" in derived:
            derived["vhi"] = _clip((0.5 * derived["vci"]) + (0.5 * derived["tci"]), 0.0, 100.0)

        precip_min = precip_rule.min_value if precip_rule is not None else None
        if precip is not None:
            # SPI is a z-score against historical precipitation for this calendar window.
            spi = _standardize_with_climatology(precip, weather_climatology, "precip")
            if spi is not None:
                derived["spi"] = spi

        if precip is not None and et_actual is not None:
            # SPEI standardizes water balance: precipitation minus evapotranspiration.
            spei = _standardize_with_climatology(
                precip - et_actual,
                weather_climatology,
                "water_balance",
            )
            if spei is not None:
                derived["spei"] = spei

        if gdd_value is not None:
            derived["gdd"] = gdd_value

        derived["crti"] = crti_value

        t2m_max = t2m_rule.max_value if t2m_rule is not None else None
        if t2m is not None:
            # RWI is a z-score against historical 2 m air temperature.
            rwi = _standardize_with_climatology(t2m, weather_climatology, "t2m")
            if rwi is not None:
                derived["rwi"] = rwi

        if (
            precip is not None
            and t2m is not None
            and precip_min is not None
            and t2m_max is not None
        ):
            derived["payout"] = float((precip < precip_min) or (t2m > t2m_max))

        derived_by_grid[grid_id] = derived

    return derived_by_grid



def merge_metrics_with_derived(
    metrics_by_grid: Mapping[GridId, Mapping[str, Any]],
    derived_by_grid: Mapping[GridId, Mapping[str, Any]],
) -> dict[GridId, dict[str, float]]:
    '''
    Purpose:
        Merge raw metrics and derived metrics into one numeric dictionary per grid id.
    Example:
        raw = {1: {"ndvi": 0.6}, 2: {"ndvi": 0.5}}
        derived = {1: {"swdi": 0.4}, 3: {"swdi": 0.7}}
        merged = merge_metrics_with_derived(raw, derived)
        merged[1] -> {"ndvi": 0.6, "swdi": 0.4}
        merged[3] -> {"swdi": 0.7}
    '''
    merged: dict[GridId, dict[str, float]] = {}

    for grid_id, metrics in metrics_by_grid.items():
        row: dict[str, float] = {}
        for parameter, value in metrics.items():
            numeric_value = _coerce_float(value)
            if numeric_value is None:
                continue
            row[str(parameter)] = numeric_value
        for parameter, value in derived_by_grid.get(grid_id, {}).items():
            numeric_value = _coerce_float(value)
            if numeric_value is None:
                continue
            row[str(parameter)] = numeric_value
        merged[grid_id] = row

    for grid_id, derived_values in derived_by_grid.items():
        row = merged.setdefault(grid_id, {})
        for parameter, value in derived_values.items():
            numeric_value = _coerce_float(value)
            if numeric_value is None:
                continue
            row[str(parameter)] = numeric_value

    return merged


def group_metrics_into_clusters(metrics: Mapping[str, Any]) -> dict[str, dict[str, float]]:
    '''
    Group a flat metrics dict into the five analytical clusters defined by CLUSTER_PARAMS.

    Only parameters listed in CLUSTER_PARAMS are considered; others are ignored.
    Parameters that are missing or non-numeric are silently excluded from their cluster's dict.
    All returned values are floats. All five cluster dicts are always present, but may be empty.

    Example:
        metrics = {"ndvi": 0.6, "gndvi": 0.42, "t2m": 24, "swdi": 0.4, "unknown_key": 99}
        clusters = group_metrics_into_clusters(metrics)
        clusters["Structural"] -> {"ndvi": 0.6}
        clusters["Chlorophyll"] -> {"gndvi": 0.42}
        clusters["Environmental"] -> {"t2m": 24.0}
        clusters["Water_Drought"] -> {"swdi": 0.4}
        # "unknown_key" is dropped; clusters not shown may be empty dicts
    '''

    grouped: dict[str, dict[str, float]] = {cluster_name: {} for cluster_name in CLUSTER_PARAMS}
    for cluster_name, parameters in CLUSTER_PARAMS.items():
        cluster_values = grouped[cluster_name]
        for parameter in parameters:
            value = _coerce_float(metrics.get(parameter))
            if value is None:
                continue
            cluster_values[parameter] = value
    return grouped


def calculate_grid_cpi_scores(
    metrics: Mapping[str, Any],
    threshold_index: Mapping[str, ThresholdRule],
) -> dict[str, float]:
    '''
    Purpose:
        Calculate per-cluster CPI by min-max normalization and equal-weight averaging.
    Example:
        metrics = {"ndvi": 0.8, "evi": 0.5, "savi": 0.6}
        cpi = calculate_grid_cpi_scores(metrics, threshold_index)
        cpi["Structural"] -> 0.73
        cpi has keys: Structural, Chlorophyll, Water_Drought, Environmental, Agro_Meteo
    '''
    cpi_scores: dict[str, float] = {}
    for cluster_name, parameters in CLUSTER_PARAMS.items():
        normalized_values: list[float] = []
        for parameter in parameters:
            value = _coerce_float(metrics.get(parameter))
            rule = threshold_index.get(parameter)
            if value is None or rule is None or rule.min_value is None or rule.max_value is None:
                continue
            span = rule.max_value - rule.min_value
            normalized = 0.5 if abs(span) <= EPSILON else _clip((value - rule.min_value) / span, 0.0, 1.0)
            normalized_values.append(normalized)
        cpi_scores[cluster_name] = round(sum(normalized_values) / len(normalized_values), 4) if normalized_values else 0.0
    return cpi_scores



def evaluate_parameter_advisories(
    metrics: Mapping[str, Any],
    threshold_index: Mapping[str, ThresholdRule],
) -> dict[str, AdvisoryResult]:
    '''
    Evaluate advisory conditions for all parameters defined in PARAM_TO_CLUSTER.

    Iteration is over PARAM_TO_CLUSTER (not `metrics`), so:
    - Parameters in `metrics` but absent from PARAM_TO_CLUSTER are ignored.
    - Parameters in PARAM_TO_CLUSTER but absent from `threshold_index` are silently omitted from results.

    Condition is one of: "Low", "Moderate", "High", "Unknown".
    "Unknown" is assigned when the parameter value is missing or non-numeric.

    Each AdvisoryResult carries: parameter, cluster, value (float|None), condition, recommended_action.

    Example:
        metrics = {"ndvi": 0.86, "t2m": 16.5, "swdi": 0.72, "unknown_key": 99}
        adv = evaluate_parameter_advisories(metrics, threshold_index)
        adv["ndvi"].condition          -> "High"
        adv["ndvi"].cluster            -> "Structural"
        adv["ndvi"].recommended_action -> "Reduce N topdress by 15%"
        # "unknown_key" is not in PARAM_TO_CLUSTER, so it is absent from results
        # parameters with no matching threshold rule are also absent
    '''
    results: dict[str, AdvisoryResult] = {}
    for parameter in sorted(PARAM_TO_CLUSTER):
        rule = threshold_index.get(parameter)
        if rule is None:
            continue
        value = _coerce_float(metrics.get(parameter))
        condition = _classify_value(value, rule.low_range, rule.moderate_range, rule.high_range)
        action = _condition_to_action(rule, condition)
        results[parameter] = AdvisoryResult(
            parameter=parameter,
            cluster=PARAM_TO_CLUSTER.get(parameter, "Other"),
            value=round(value, 4) if value is not None else None,
            condition=condition,
            recommended_action=action,
        )
    return results


def evaluate_advisory_actions_only(
    metrics: Mapping[str, Any],
    threshold_index: Mapping[str, ThresholdRule],
) -> dict[str, str]:
    '''
    Return only the recommended_action text per parameter from a full advisory evaluation.

    Thin wrapper over evaluate_parameter_advisories — all its scoping rules apply:
    - Iteration is over PARAM_TO_CLUSTER, not `metrics`.
    - Parameters absent from PARAM_TO_CLUSTER or threshold_index are omitted from results.
    - See evaluate_parameter_advisories for full behaviour.

    Example:
        metrics = {"swdi": 0.72, "t2m": 16.5}
        actions = evaluate_advisory_actions_only(metrics, threshold_index)
        actions["swdi"] -> "High soil water deficit; irrigate immediately"
        actions["t2m"] -> "Delay sowing by 5 days"
    '''
    advisory_results = evaluate_parameter_advisories(metrics, threshold_index)
    return {parameter: result.recommended_action for parameter, result in advisory_results.items()}



def build_grid_metrics_from_sources(
    *,
    weather_metrics: Mapping[str, Any] | None = None,
    gee_metrics_by_grid: Mapping[GridId, Mapping[str, Any]] | None = None,
    grid_ids: Sequence[GridId] | None = None,
) -> dict[GridId, dict[str, float]]:
    '''
    Build per-grid metrics by broadcasting weather metrics across all grids,
    then overlaying per-grid GEE metrics on top.

    Grid set resolution (union, in order):
    1. All IDs from `grid_ids` (preserving order)
    2. Any additional IDs from `gee_metrics_by_grid` keys not already in the list

    Merge behaviour:
    - Weather metrics are broadcast to every grid as the base layer.
    - GEE metrics are overlaid per-grid; GEE values overwrite weather on key collision.
    - Non-numeric values from either source are silently dropped.
    - All args are optional; passing nothing returns {}.

    Example:
        weather_metrics      = {"t2m": 24, "rh": 62}
        gee_metrics_by_grid  = {1: {"ndvi": 0.6, "t2m": 22.5}, 2: {"ndvi": 0.5}}
        rows = build_grid_metrics_from_sources(
            weather_metrics=weather_metrics,
            gee_metrics_by_grid=gee_metrics_by_grid,
            grid_ids=[1, 2, 3],
        )
        rows[1] -> {"t2m": 22.5, "rh": 62.0, "ndvi": 0.6}  # GEE t2m overwrites weather t2m
        rows[2] -> {"t2m": 24.0, "rh": 62.0, "ndvi": 0.5}
        rows[3] -> {"t2m": 24.0, "rh": 62.0}               # grid_ids-only, no GEE data
    '''
    normalized_weather: dict[str, float] = {}
    if weather_metrics is not None:
        for parameter, value in weather_metrics.items():
            numeric_value = _coerce_float(value)
            if numeric_value is None:
                continue
            normalized_weather[str(parameter)] = numeric_value

    resolved_grid_ids: list[GridId] = []
    if grid_ids is not None:
        resolved_grid_ids.extend(grid_ids)
    if gee_metrics_by_grid is not None:
        for grid_id in gee_metrics_by_grid:
            if grid_id not in resolved_grid_ids:
                resolved_grid_ids.append(grid_id)

    metrics_by_grid: dict[GridId, dict[str, float]] = {}
    for grid_id in resolved_grid_ids:
        combined = dict(normalized_weather)
        if gee_metrics_by_grid is not None:
            for parameter, value in gee_metrics_by_grid.get(grid_id, {}).items():
                numeric_value = _coerce_float(value)
                if numeric_value is None:
                    continue
                combined[str(parameter)] = numeric_value
        metrics_by_grid[grid_id] = combined

    return metrics_by_grid



def analyze_weather_and_gee_metrics(
    *,
    crop_category: str,
    threshold_payload: Mapping[str, Any],
    weather_metrics: Mapping[str, Any] | None = None,
    gee_metrics_by_grid: Mapping[GridId, Mapping[str, Any]] | None = None,
    grid_ids: Sequence[GridId] | None = None,
    hourly_weather: Mapping[str, Any] | None = None,
    weather_climatology: Mapping[str, Any] | None = None,
    analysis_days: int | None = None,
) -> dict[GridId, GridAnalyticsResult]:
    '''
    Convenience wrapper: merge weather and GEE sources into per-grid metrics,
    then run full grid analytics (threshold indexing, derived indices, CPI scoring, advisories).

    Pipeline:
        1. build_grid_metrics_from_sources  — broadcast weather, overlay GEE, union grid set
        2. analyze_grid_metrics             — build threshold index, compute derived indices,
                                            score clusters, evaluate advisories

    All args are optional; passing nothing returns {}.
    GEE values overwrite weather values on key collision.
    `lst` values affect TCI; `hourly_weather` affects GDD computation.
    See build_grid_metrics_from_sources and analyze_grid_metrics for full scoping rules.

    Example:
        result = analyze_weather_and_gee_metrics(
            crop_category="cereals_c3_temperate",
            threshold_payload=payload,
            weather_metrics={"t2m": 24, "rh": 62},
            gee_metrics_by_grid={1: {"ndvi": 0.6}},
        )
        result[1].cpi_scores["Structural"]     -> 0.73
        result[1].advisories["ndvi"].condition -> "Moderate"
    '''
    metrics_by_grid = build_grid_metrics_from_sources(
        weather_metrics=weather_metrics,
        gee_metrics_by_grid=gee_metrics_by_grid,
        grid_ids=grid_ids,
    )
    return analyze_grid_metrics(
        metrics_by_grid=metrics_by_grid,
        crop_category=crop_category,
        threshold_payload=threshold_payload,
        hourly_weather=hourly_weather,
        weather_climatology=weather_climatology,
        analysis_days=analysis_days,
    )



def analyze_grid_metrics(
    metrics_by_grid: Mapping[GridId, Mapping[str, Any]],
    *,
    crop_category: str,
    threshold_payload: Mapping[str, Any],
    hourly_weather: Mapping[str, Any] | None = None,
    weather_climatology: Mapping[str, Any] | None = None,
    analysis_days: int | None = None,
) -> dict[GridId, GridAnalyticsResult]:
    '''
    Purpose:
        Run end-to-end analytics on already prepared metrics_by_grid and return structured outputs per grid.
    Example:
        metrics_by_grid = {1: {"ndvi": 0.62, "ndmi": 0.38, "t2m": 24, "precip": 420, "et_actual": 4.2}}
        result = analyze_grid_metrics(metrics_by_grid, crop_category="cereals_c3_temperate", threshold_payload=payload)
        result[1].derived_indices["gdd"] -> 37.8
        result[1].cpi_scores["Water_Drought"] -> 0.55
    '''
    threshold_index = build_threshold_index(
        threshold_payload=threshold_payload,
        crop_category=crop_category,
    )
    derived_by_grid = calculate_derived_indices(
        metrics_by_grid=metrics_by_grid,
        crop_category=crop_category,
        threshold_index=threshold_index,
        hourly_weather=hourly_weather,
        weather_climatology=weather_climatology,
        analysis_days=analysis_days,
    )
    merged_metrics = merge_metrics_with_derived(
        metrics_by_grid=metrics_by_grid,
        derived_by_grid=derived_by_grid,
    )

    analytics_by_grid: dict[GridId, GridAnalyticsResult] = {}
    for grid_id, metrics in merged_metrics.items():
        analytics_by_grid[grid_id] = GridAnalyticsResult(
            raw_metrics=dict(metrics),
            derived_indices=dict(derived_by_grid.get(grid_id, {})),
            clusters=group_metrics_into_clusters(metrics),
            cpi_scores=calculate_grid_cpi_scores(metrics, threshold_index),
            advisories=evaluate_parameter_advisories(metrics, threshold_index),
        )

    return analytics_by_grid


def _normalize_threshold_row(row: Any, *, expected_length: int) -> list[str] | None:
    '''
    Purpose:
        Validate and normalize raw threshold rows into trimmed string lists.
    Example:
        _normalize_threshold_row([" ndvi ", 0.4, 1.0], expected_length=3) -> ["ndvi", "0.4", "1.0"]
        _normalize_threshold_row("bad_row", expected_length=3) -> None

        None becomes empty string ""...
    '''
    if not isinstance(row, Sequence) or isinstance(row, (str, bytes, bytearray)):
        return None
    if len(row) < expected_length:
        return None
    values = [str(value).strip() if value is not None else "" for value in row[:expected_length]]
    return values



def _build_threshold_rule(
    *,
    crop_category: str,
    parameter: str,
    row_values: Sequence[str],
) -> ThresholdRule:
    '''
    Convert a 10-element normalized row into a strongly-typed ThresholdRule.

    Column mapping (row_values indices):
        [0]  min_value        float | None  (non-numeric coerced to None)
        [1]  max_value        float | None  (non-numeric coerced to None)
        [2]  optimal_range    str           e.g. "0.6-0.8"
        [3]  low_range        str           e.g. "<0.4"
        [4]  moderate_range   str           e.g. "0.4-0.8"
        [5]  high_range       str           e.g. ">0.8"
        [6]  low_action       str
        [7]  moderate_action  str
        [8]  high_action      str
        [9]  critical_action  str

    Range and action strings are stored as-is without validation.

    Raises:
        DomainError: if len(row_values) < 10.

    Example:
        rule = _build_threshold_rule(
            crop_category="cereals_c3_temperate",
            parameter="ndvi",
            row_values=["0.4", "1.0", "0.6-0.8", "<0.4", "0.4-0.8", ">0.8", "low", "mod", "high", "critical"],
        )
        rule.min_value   -> 0.4
        rule.high_range  -> ">0.8"
    '''
    if len(row_values) < 10:
        raise DomainError(
            "Threshold row has an invalid column count.",
            details={"parameter": parameter, "row_length": len(row_values)},
        )
    return ThresholdRule(
        crop_category=crop_category,
        parameter=parameter,
        min_value=_coerce_float(row_values[0]),
        max_value=_coerce_float(row_values[1]),
        optimal_range=row_values[2],
        low_range=row_values[3],
        moderate_range=row_values[4],
        high_range=row_values[5],
        low_action=row_values[6],
        moderate_action=row_values[7],
        high_action=row_values[8],
        critical_action=row_values[9],
    )



def _extract_hourly_temperatures(hourly_weather: Mapping[str, Any] | None) -> list[float]:
    '''
    Extract a numeric hourly temperature series from a weather payload.

    Supports two payload shapes:
    - Nested: {"hourly": {"t2m": [...] | "temperature_2m": [...]}}
    - Flat:   {"t2m": [...] | "temperature_2m": [...]}

    If `hourly` exists and is a mapping, lookup happens inside `hourly`; otherwise
    lookup happens at the top level.

    Key lookup order within the resolved payload is "t2m" first, then "temperature_2m".
    If both keys exist and "t2m" has valid numeric values, "t2m" is used; otherwise
    the function falls back to "temperature_2m".

    None, booleans, non-numeric values, and non-finite values inside the series are dropped.
    Returns [] if hourly_weather is None or no valid numeric series is found.

    Example:
        _extract_hourly_temperatures({"hourly": {"temperature_2m": [22, 23, None, "24.5"]}}) -> [22.0, 23.0, 24.5]
        _extract_hourly_temperatures({"t2m": [21, 22]}) -> [21.0, 22.0]
        _extract_hourly_temperatures({"hourly": {"t2m": [20.0], "temperature_2m": [99.0]}}) -> [20.0]
        _extract_hourly_temperatures(None) -> []
    '''

    if hourly_weather is None:
        return []

    hourly_payload: Mapping[str, Any]
    nested_hourly = hourly_weather.get("hourly")
    if isinstance(nested_hourly, Mapping):
        hourly_payload = nested_hourly
    else:
        hourly_payload = hourly_weather

    for key in ("t2m", "temperature_2m"):
        series = hourly_payload.get(key)
        numeric_series = _coerce_numeric_sequence(series)
        if numeric_series:
            return numeric_series
    return []



def _coerce_numeric_sequence(values: Any) -> list[float]:
    '''
    Purpose:
        Convert sequence values to clean numeric floats and drop invalid elements.
    Example:
        _coerce_numeric_sequence([1, "2.5", None, "bad", True, float("nan")]) -> [1.0, 2.5]
        _coerce_numeric_sequence("not_a_list") -> []
    '''
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes, bytearray)):
        return []
    numeric_values: list[float] = []
    for value in values:
        numeric_value = _coerce_float(value)
        if numeric_value is not None:
            numeric_values.append(numeric_value)
    return numeric_values



def _calculate_gdd(hourly_temps: Sequence[float], crop_category: str) -> float | None:
    '''
    Purpose:
        Compute Growing Degree Days from hourly temperatures using crop-specific base temperature.
    Example:
        _calculate_gdd([20, 21, 22], "cereals_c3_temperate") -> 2.0
        # base = 5, contributions = 15 + 16 + 17 = 48, divide by 24 = 2.0
    '''
    if not hourly_temps:
        return None
    t_base = get_gdd_t_base(crop_category)
    # Hourly degree-hours / 24 = degree-days.
    gdd_raw = sum(max(0.0, temp - t_base) for temp in hourly_temps)
    return round(gdd_raw / 24, 1)


def _coerce_float(value: Any) -> float | None:
    '''
    Purpose:
        Safely cast a value to finite float, otherwise return None.
    Example:
        _coerce_float("12.5") -> 12.5
        _coerce_float("bad") -> None
        _coerce_float(float("inf")) -> None
    '''
    if value is None or isinstance(value, bool):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def _clip(value: float, lower: float, upper: float) -> float:
    '''
    Purpose:
        Clamp a value into inclusive lower-upper bounds.
    Example:
        _clip(1.4, 0.0, 1.0) -> 1.0
        _clip(-0.2, 0.0, 1.0) -> 0.0
    '''
    return min(upper, max(lower, value))


def _standardize_with_climatology(
    value: float,
    weather_climatology: Mapping[str, Any] | None,
    metric_key: str,
) -> float | None:
    '''
    Compute a clipped z-score from historical climatology mean and sample SD.

    Expects weather_climatology[metric_key] to contain numeric "mean" and "sd"
    entries. Returns None when climatology is absent or the SD is not positive.
    '''

    if weather_climatology is None:
        return None
    metric_stats = weather_climatology.get(metric_key)
    if not isinstance(metric_stats, Mapping):
        return None
    mean = _coerce_float(metric_stats.get("mean"))
    sd = _coerce_float(metric_stats.get("sd"))
    if mean is None or sd is None or sd <= EPSILON:
        return None
    return _clip((value - mean) / sd, -2.0, 2.0)


def _parse_range(range_text: str) -> ParsedRange | None:
    '''
    Parse a threshold range string into a ParsedRange, or None if unparseable.

    The input is normalized first by _normalize_range_text.

    Supported formats after normalization:
        "<0.3"     -> upper-bound only, upper_inclusive=False
        ">0.8"     -> lower-bound only, lower_inclusive=False
        "0.3-0.8"  -> closed interval (default inclusivity from ParsedRange)
        "0.5"      -> exact value; lower=upper=0.5

    Returns None if the normalized input is empty, the format is unrecognized,
    or any numeric part fails coercion.

    Example:
        _parse_range("0.3-0.8") -> ParsedRange(lower=0.3, upper=0.8)
        _parse_range("<0.3")    -> ParsedRange(lower=None, upper=0.3, upper_inclusive=False)
        _parse_range(">0.8")    -> ParsedRange(lower=0.8, upper=None, lower_inclusive=False)
        _parse_range("0.5")     -> ParsedRange(lower=0.5, upper=0.5)
        _parse_range("bad")     -> None
    '''

    text = _normalize_range_text(range_text)
    if not text:
        return None

    if text.startswith("<"):
        upper = _coerce_float(text[1:])
        if upper is None:
            return None
        return ParsedRange(lower=None, upper=upper, upper_inclusive=False)

    if text.startswith(">"):
        lower = _coerce_float(text[1:])
        if lower is None:
            return None
        return ParsedRange(lower=lower, upper=None, lower_inclusive=False)

    range_match = RANGE_PATTERN.match(text)
    if range_match:
        lower = _coerce_float(range_match.group(1))
        upper = _coerce_float(range_match.group(2))
        if lower is None or upper is None:
            return None
        return ParsedRange(lower=lower, upper=upper)

    exact = _coerce_float(text)
    if exact is not None:
        return ParsedRange(lower=exact, upper=exact)

    return None


def _normalize_range_text(value: str) -> str:
    '''
    Purpose:
        Normalize range text by removing spaces/quotes and unifying dash variants.
    Example:
        _normalize_range_text(" -0.5 to 0.5 ") -> "-0.5-0.5"
        _normalize_range_text("10-20'") -> "10-20"
    '''
    return (
        value.replace(" ", "")
        .replace("'", "")
        .replace("to", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
        .strip()
    )


def _range_contains(value: float, parsed_range: ParsedRange | None) -> bool:
    '''
    Test whether a value lies inside a parsed range with inclusive/exclusive boundary support.

    None bounds are treated as unbounded (that side always passes).
    Returns False if parsed_range is None.

    Example:
        _range_contains(0.5, ParsedRange(lower=0.3, upper=0.8))                           -> True
        _range_contains(0.8, ParsedRange(lower=0.8, upper=None, lower_inclusive=False))   -> False  # exclusive lower, value == bound
        _range_contains(0.8, ParsedRange(lower=0.8, upper=None, lower_inclusive=True))    -> True   # inclusive lower, value == bound
        _range_contains(0.9, ParsedRange(lower=0.3, upper=None))                          -> True   # unbounded upper
        _range_contains(0.5, None)                                                         -> False
    '''
    if parsed_range is None:
        return False
    if parsed_range.lower is not None:
        if parsed_range.lower_inclusive:
            if value < parsed_range.lower:
                return False
        elif value <= parsed_range.lower:
            return False
    if parsed_range.upper is not None:
        if parsed_range.upper_inclusive:
            if value > parsed_range.upper:
                return False
        elif value >= parsed_range.upper:
            return False
    return True


def _classify_value(
    value: float | None,
    low_range: str,
    moderate_range: str,
    high_range: str,
) -> str:
    '''
    Purpose:
        Classify a numeric value against low, moderate, and high threshold strings.
    Example:
        _classify_value(0.86, "<0.4", "0.4-0.8", ">0.8") -> "High"
        _classify_value(None, "<0.4", "0.4-0.8", ">0.8") -> "Unknown"
    '''
    if value is None:
        return "Unknown"

    low_parsed = _parse_range(low_range)
    high_parsed = _parse_range(high_range)
    moderate_parsed = _parse_range(moderate_range)

    if _range_contains(value, low_parsed):
        return "Low"
    if _range_contains(value, high_parsed):
        return "High"
    if _range_contains(value, moderate_parsed):
        return "Moderate"

    # Legacy behavior falls back to Moderate when ranges are malformed or sparse.
    return "Moderate"


def _condition_to_action(rule: ThresholdRule, condition: str) -> str:
    '''
    Purpose:
        Map condition label to the correct action field from a threshold rule.
    Example:
        _condition_to_action(rule, "Low") -> rule.low_action
        _condition_to_action(rule, "Unknown") -> rule.critical_action
    '''
    if condition == "Low":
        return rule.low_action
    if condition == "High":
        return rule.high_action
    if condition == "Unknown":
        return rule.critical_action
    return rule.moderate_action
