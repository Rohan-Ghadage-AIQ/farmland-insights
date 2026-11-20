from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.utils.payloads import SAMPLE_FARM_ANALYSIS_REQUEST


def test_analyze_rejects_missing_bearer_token(without_auth_override: None) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/analyze",
            json=SAMPLE_FARM_ANALYSIS_REQUEST,
        )

    assert response.status_code == 401


def test_analyze_rejects_invalid_bearer_token(without_auth_override: None) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/analyze",
            headers={"Authorization": "Bearer invalid-token"},
            json=SAMPLE_FARM_ANALYSIS_REQUEST,
        )

    assert response.status_code == 401
