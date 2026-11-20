from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ThresholdRule:
    crop_category: str
    parameter: str
    min_value: float | None
    max_value: float | None
    optimal_range: str
    low_range: str
    moderate_range: str
    high_range: str
    low_action: str
    moderate_action: str
    high_action: str
    critical_action: str


@dataclass(frozen=True, slots=True)
class AdvisoryResult:
    parameter: str
    cluster: str
    value: float | None
    condition: str
    recommended_action: str


@dataclass(frozen=True, slots=True)
class GridAnalyticsResult:
    raw_metrics: dict[str, float]
    derived_indices: dict[str, float]
    clusters: dict[str, dict[str, float]]
    cpi_scores: dict[str, float]
    advisories: dict[str, AdvisoryResult]


@dataclass(frozen=True, slots=True)
class ParsedRange:
    lower: float | None
    upper: float | None
    lower_inclusive: bool = True
    upper_inclusive: bool = True

