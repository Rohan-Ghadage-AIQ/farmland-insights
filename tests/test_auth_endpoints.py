from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_register_user_returns_access_token() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "new-user@example.com",
                "password": "secret-password",
                "duration_in_minutes": 30,
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-2",
        "email": "new-user@example.com",
        "access_token": "token-for-user-2-30",
        "token_type": "bearer",
        "expires_in_minutes": 30,
    }


def test_register_user_rejects_extra_fields() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "new-user@example.com",
                "password": "secret-password",
                "duration_in_minutes": 30,
                "first_name": "Not Allowed",
            },
        )

    assert response.status_code == 422


def test_generate_token_for_existing_user() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/token",
            json={
                "email": "existing-user@example.com",
                "duration_in_minutes": 45,
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "existing-user",
        "email": "existing-user@example.com",
        "access_token": "token-for-existing-user-45",
        "token_type": "bearer",
        "expires_in_minutes": 45,
    }


def test_generate_token_rejects_unknown_user() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/token",
            json={
                "email": "missing-user@example.com",
                "duration_in_minutes": 45,
            },
        )

    assert response.status_code == 404


def test_whoami_returns_token_user(without_auth_override: None) -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/auth/whoami",
            headers={"Authorization": "Bearer valid-test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "test-user",
        "email": "test-user@example.com",
        "active_org_id": None,
    }


def test_whoami_rejects_missing_token(without_auth_override: None) -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/auth/whoami")

    assert response.status_code == 401


def test_whoami_is_marked_as_bearer_secured_in_openapi() -> None:
    with TestClient(app) as client:
        schema = client.get("/openapi.json").json()

    whoami_operation = schema["paths"]["/api/v1/auth/whoami"]["get"]
    assert whoami_operation["security"] == [{"HTTPBearer": []}]
