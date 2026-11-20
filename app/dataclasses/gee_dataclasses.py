from __future__ import annotations

from dataclasses import dataclass
from datetime import date

GridMetrics = dict[int, dict[str, float]]


@dataclass(frozen=True)
class SarFetchResult:
    metrics_by_grid_id: GridMetrics
    effective_start_date: date | None
    rolled_back_days: int
