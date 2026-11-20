from __future__ import annotations

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.models.requests import MAX_PERIOD_DAYS, CropCategory, FarmAnalysisRequest
from app.utils.payloads import SAMPLE_FARM_ANALYSIS_REQUEST


def _analysis_payload_with_crop(crop_value: str) -> dict:
    payload = dict(SAMPLE_FARM_ANALYSIS_REQUEST)
    payload["farm_geojson"] = dict(SAMPLE_FARM_ANALYSIS_REQUEST["farm_geojson"])
    payload["crop_category"] = crop_value
    return payload


@pytest.mark.parametrize(
    ("crop_value", "expected_category"),
    [
        ("cereals_c3_temperate", CropCategory.cereals_c3_temperate),
        ("Wheat", CropCategory.cereals_c3_temperate),
        ("wheat", CropCategory.cereals_c3_temperate),
        ("Gehu", CropCategory.cereals_c3_temperate),
        ("Tomato", CropCategory.vegetables_warm),
        ("Tamatar", CropCategory.vegetables_warm),
        ("Coriander Leaves", CropCategory.vegetables_cool),
        ("Dhaniya", CropCategory.vegetables_cool),
    ],
)
def test_farm_analysis_request_accepts_category_or_crop_name(
    crop_value: str,
    expected_category: CropCategory,
) -> None:
    request = FarmAnalysisRequest.model_validate(_analysis_payload_with_crop(crop_value))

    assert request.crop_category == expected_category


def test_farm_analysis_request_rejects_unknown_crop_name() -> None:
    with pytest.raises(ValidationError):
        FarmAnalysisRequest.model_validate(_analysis_payload_with_crop("Unknown Crop"))


def _payload_for_period(start: date, end: date) -> dict:
    payload = _analysis_payload_with_crop("Wheat")
    payload["start_date"] = start.isoformat()
    payload["end_date"] = end.isoformat()
    return payload


def test_the_longest_period_is_a_year() -> None:
    assert MAX_PERIOD_DAYS == 366


@pytest.mark.parametrize("days", [1, 30, 31, 90, 180, 365, MAX_PERIOD_DAYS])
def test_periods_up_to_a_year_are_accepted(days: int) -> None:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)

    request = FarmAnalysisRequest.model_validate(_payload_for_period(start, end))

    assert (request.end_date - request.start_date).days + 1 == days


@pytest.mark.parametrize("days", [MAX_PERIOD_DAYS + 1, 400, 730, 3650])
def test_periods_longer_than_a_year_are_rejected_with_a_clear_message(days: int) -> None:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)

    with pytest.raises(ValidationError) as error:
        FarmAnalysisRequest.model_validate(_payload_for_period(start, end))

    message = str(error.value)
    assert "cannot be longer than 366 days" in message
    assert f"{days} days were requested" in message


def test_a_year_that_ends_in_the_forecast_window_is_still_checked_for_length() -> None:
    end = date.today() + timedelta(days=10)
    start = end - timedelta(days=MAX_PERIOD_DAYS)  # 367 days inclusive

    with pytest.raises(ValidationError, match="cannot be longer than 366 days"):
        FarmAnalysisRequest.model_validate(_payload_for_period(start, end))


def test_start_after_end_is_still_reported_as_such() -> None:
    today = date.today()
    with pytest.raises(ValidationError, match="start_date must be before or equal to end_date"):
        FarmAnalysisRequest.model_validate(_payload_for_period(today, today - timedelta(days=5)))
