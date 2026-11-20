"""
Satellite pass bookkeeping shared by the Earth Engine and STAC providers.

The user picks one day from the passes over their farm. Sentinel-2 (optical) and Sentinel-1 (radar)
fly on different days, so the chosen day decides which pass of each sensor is used: the pass on that
day when there is one, otherwise the nearest one in the period (for optical, the nearest clear one).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date

# An optical pass with more of the farm under cloud than this is only used when the user picked it.
CLEAR_SKY_MAX_CLOUD_PERCENT = 30.0


@dataclass(frozen=True)
class SatelliteAcquisitions:
    """Days with imagery over the farm. ``optical`` maps each day to its cloud % (None if unknown)."""

    optical: Mapping[date, float | None] = field(default_factory=dict)
    radar: frozenset[date] = frozenset()


@dataclass(frozen=True)
class ImageryChoice:
    optical_date: date | None
    radar_date: date | None


def merge_optical_cloud(pairs: Iterable[tuple[date, float | None]]) -> dict[date, float | None]:
    """
    One cloud value per day. Several tiles can cover the farm on the same day; the clearest one is
    kept because the analysis reads the farm's pixels, and a known value beats an unknown one.
    """

    merged: dict[date, float | None] = {}
    for day, cloud in pairs:
        if day not in merged:
            merged[day] = cloud
            continue
        current = merged[day]
        if cloud is not None and (current is None or cloud < current):
            merged[day] = cloud
    return merged


def _nearest(days: Iterable[date], target: date) -> date | None:
    # Ties go to the earlier day so the choice is deterministic.
    return min(days, key=lambda day: (abs((day - target).days), day), default=None)


def choose_imagery(acquisitions: SatelliteAcquisitions, image_date: date) -> ImageryChoice:
    """The optical and radar passes to analyse for the day the user picked."""

    optical = acquisitions.optical
    if image_date in optical:
        optical_date: date | None = image_date
    else:
        clear = [
            day
            for day, cloud in optical.items()
            if cloud is None or cloud <= CLEAR_SKY_MAX_CLOUD_PERCENT
        ]
        optical_date = _nearest(clear, image_date) or _nearest(optical, image_date)

    radar = acquisitions.radar
    radar_date = image_date if image_date in radar else _nearest(radar, image_date)
    return ImageryChoice(optical_date=optical_date, radar_date=radar_date)


def satellite_passes(acquisitions: SatelliteAcquisitions) -> list[dict[str, object]]:
    """Rows for the date picker, newest first."""

    days = set(acquisitions.optical) | set(acquisitions.radar)
    rows: list[dict[str, object]] = []
    for day in sorted(days, reverse=True):
        cloud = acquisitions.optical.get(day)
        rows.append(
            {
                "date": day,
                "optical": day in acquisitions.optical,
                "cloud_cover": None if cloud is None else round(max(0.0, min(100.0, cloud)), 1),
                "radar": day in acquisitions.radar,
            }
        )
    return rows
