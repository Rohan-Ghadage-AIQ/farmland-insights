from __future__ import annotations

from app.dataclasses.analytics_dataclasses import ThresholdRule


def threshold_rule(
    parameter: str,
    min_value: float | None,
    max_value: float | None,
    *,
    low_range: str = "<0.4",
    moderate_range: str = "0.4-0.8",
    high_range: str = ">0.8",
) -> ThresholdRule:
    """
    Test factory for ThresholdRule instances with sensible defaults.

    Constructs a fully populated ThresholdRule using a fixed crop_category,
    default threshold ranges, and deterministic placeholder action strings.
    Tests can supply only the fields relevant to the scenario, usually
    parameter/min/max values and, when needed, custom low/moderate/high ranges,
    without repeating ThresholdRule boilerplate.
    """

    return ThresholdRule(
        crop_category="cereals_c3_temperate",
        parameter=parameter,
        min_value=min_value,
        max_value=max_value,
        optimal_range="",
        low_range=low_range,
        moderate_range=moderate_range,
        high_range=high_range,
        low_action=f"{parameter} low",
        moderate_action=f"{parameter} moderate",
        high_action=f"{parameter} high",
        critical_action=f"{parameter} critical",
    )
