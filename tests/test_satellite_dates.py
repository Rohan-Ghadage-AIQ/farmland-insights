from __future__ import annotations

import copy
from datetime import date
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.endpoints import analysis
from app.dataclasses import SarFetchResult
from app.main import app
from app.models.requests import FarmAnalysisRequest
from app.services.imagery import SatelliteAcquisitions
from app.utils.payloads import SAMPLE_FARM_ANALYSIS_REQUEST

AUTH = {"Authorization": "Bearer valid-test-token"}
ACQUISITIONS = SatelliteAcquisitions(
    optical={date(2026, 4, 3): 2.0, date(2026, 4, 8): 75.0},
    radar=frozenset({date(2026, 4, 6)}),
)


def _payload(**changes: object) -> dict:
    payload = copy.deepcopy(SAMPLE_FARM_ANALYSIS_REQUEST)
    payload.update(changes)
    return payload


def test_image_date_must_fall_inside_the_period() -> None:
    FarmAnalysisRequest.model_validate(_payload(image_date="2026-04-18"))
    with pytest.raises(ValidationError, match="image_date must fall within"):
        FarmAnalysisRequest.model_validate(_payload(image_date="2026-04-19"))


def test_satellite_dates_lists_passes_newest_first(monkeypatch: pytest.MonkeyPatch) -> None:
    listing = AsyncMock(return_value=ACQUISITIONS)
    monkeypatch.setattr(analysis, "list_satellite_acquisitions", listing)
    body = {key: SAMPLE_FARM_ANALYSIS_REQUEST[key] for key in ("farm_geojson", "start_date", "end_date")}

    with TestClient(app) as client:
        response = client.post("/api/v1/satellite-dates", headers=AUTH, json=body)

    assert response.status_code == 200
    assert response.json() == {
        "dates": [
            {"date": "2026-04-08", "optical": True, "cloud_cover": 75.0, "radar": False},
            {"date": "2026-04-06", "optical": False, "cloud_cover": None, "radar": True},
            {"date": "2026-04-03", "optical": True, "cloud_cover": 2.0, "radar": False},
        ]
    }
    # The farm is listed as a single cell, whatever grid size the analysis will use.
    assert len(listing.await_args.kwargs["grid_geo_df"]) == 1


def test_satellite_dates_requires_sign_in(without_auth_override: None) -> None:
    with TestClient(app) as client:
        response = client.post("/api/v1/satellite-dates", json={})
    assert response.status_code == 401


def test_analyze_uses_the_chosen_passes_and_reports_them(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analysis, "list_satellite_acquisitions", AsyncMock(return_value=ACQUISITIONS))
    satellite = AsyncMock(
        return_value=({}, SarFetchResult(metrics_by_grid_id={}, effective_start_date=None, rolled_back_days=0))
    )
    monkeypatch.setattr(analysis, "fetch_satellite_metrics", satellite)
    monkeypatch.setattr(analysis, "fetch_weather_telemetry", AsyncMock(return_value=({"t2m": 24.0}, {})))
    monkeypatch.setattr(analysis, "fetch_weather_climatology", AsyncMock(return_value=None))

    with TestClient(app) as client:
        response = client.post("/api/v1/analyze", headers=AUTH, json=_payload(image_date="2026-04-06"))

    assert response.status_code == 200, response.text
    # 04-06 is radar-only: radar uses it, optical takes the nearest clear pass (04-03, not cloudy 04-08).
    assert response.json()["imagery"] == {
        "image_date": "2026-04-06",
        "optical_date": "2026-04-03",
        "radar_date": "2026-04-06",
    }
    kwargs = satellite.await_args.kwargs
    assert (kwargs["optical_date"], kwargs["radar_date"]) == (date(2026, 4, 3), date(2026, 4, 6))
