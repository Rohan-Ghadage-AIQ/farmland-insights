from __future__ import annotations

from datetime import date

from app.services.imagery import (
    SatelliteAcquisitions,
    choose_imagery,
    merge_optical_cloud,
    satellite_passes,
)

D = date


def test_merge_keeps_the_clearest_tile_per_day_and_prefers_known_values() -> None:
    merged = merge_optical_cloud(
        [
            (D(2026, 1, 5), 40.0),
            (D(2026, 1, 5), 12.5),
            (D(2026, 1, 7), None),
            (D(2026, 1, 7), 80.0),
            (D(2026, 1, 9), None),
        ]
    )
    assert merged == {D(2026, 1, 5): 12.5, D(2026, 1, 7): 80.0, D(2026, 1, 9): None}


def test_the_chosen_day_is_used_for_both_sensors_when_both_flew() -> None:
    acquisitions = SatelliteAcquisitions(
        optical={D(2026, 1, 5): 90.0}, radar=frozenset({D(2026, 1, 5)})
    )
    choice = choose_imagery(acquisitions, D(2026, 1, 5))
    # A cloudy day the user picked on purpose is still honoured.
    assert (choice.optical_date, choice.radar_date) == (D(2026, 1, 5), D(2026, 1, 5))


def test_a_radar_only_day_takes_the_nearest_clear_optical_pass() -> None:
    acquisitions = SatelliteAcquisitions(
        optical={D(2026, 1, 9): 70.0, D(2026, 1, 12): 4.0, D(2026, 1, 2): 10.0},
        radar=frozenset({D(2026, 1, 8)}),
    )
    choice = choose_imagery(acquisitions, D(2026, 1, 8))
    assert choice.radar_date == D(2026, 1, 8)
    # 01-09 is closest but cloudy; 01-12 (4 days) beats 01-02 (6 days).
    assert choice.optical_date == D(2026, 1, 12)


def test_only_cloudy_optical_passes_fall_back_to_the_nearest_one() -> None:
    acquisitions = SatelliteAcquisitions(
        optical={D(2026, 1, 3): 95.0, D(2026, 1, 20): 60.0}, radar=frozenset()
    )
    choice = choose_imagery(acquisitions, D(2026, 1, 6))
    assert (choice.optical_date, choice.radar_date) == (D(2026, 1, 3), None)


def test_equally_near_passes_resolve_to_the_earlier_day() -> None:
    acquisitions = SatelliteAcquisitions(radar=frozenset({D(2026, 1, 4), D(2026, 1, 8)}))
    assert choose_imagery(acquisitions, D(2026, 1, 6)).radar_date == D(2026, 1, 4)


def test_passes_are_listed_newest_first_with_sensor_flags() -> None:
    acquisitions = SatelliteAcquisitions(
        optical={D(2026, 1, 5): 12.345, D(2026, 1, 9): None},
        radar=frozenset({D(2026, 1, 5), D(2026, 1, 7)}),
    )
    assert satellite_passes(acquisitions) == [
        {"date": D(2026, 1, 9), "optical": True, "cloud_cover": None, "radar": False},
        {"date": D(2026, 1, 7), "optical": False, "cloud_cover": None, "radar": True},
        {"date": D(2026, 1, 5), "optical": True, "cloud_cover": 12.3, "radar": True},
    ]
