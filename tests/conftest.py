from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from propelauth_py.errors import UnauthorizedException

from app.auth import PROPELAUTH_STATE_KEY, require_authenticated_user
from app.main import app


def _mock_authenticated_user() -> dict[str, Any]:
    return {
        "user_id": "test-user",
        "email": "test-user@example.com",
    }


class _TestPropelAuth:
    def __init__(self) -> None:
        self.users_by_email: dict[str, dict[str, str]] = {
            "existing-user@example.com": {
                "user_id": "existing-user",
                "email": "existing-user@example.com",
            }
        }

    def require_user(
        self,
        credentials: HTTPAuthorizationCredentials | None = None,
    ) -> dict[str, Any]:
        if credentials is not None and credentials.credentials == "valid-test-token":
            return _mock_authenticated_user()
        raise HTTPException(status_code=401)

    def create_user(
        self,
        *,
        email: str,
        password: str,
        email_confirmed: bool = True,
        send_email_to_confirm_email_address: bool = False,
    ) -> dict[str, str]:
        user_id = f"user-{len(self.users_by_email) + 1}"
        user = {"user_id": user_id, "email": email}
        self.users_by_email[email] = user
        return user

    def fetch_user_metadata_by_email(self, email: str) -> dict[str, str] | None:
        return self.users_by_email.get(email)

    def create_access_token(
        self,
        *,
        user_id: str,
        duration_in_minutes: int,
    ) -> dict[str, str]:
        return {"access_token": f"token-for-{user_id}-{duration_in_minutes}"}

    def validate_access_token_and_get_user(self, authorization_header: str) -> dict[str, str | None]:
        if authorization_header == "Bearer valid-test-token":
            return {
                "user_id": "test-user",
                "email": "test-user@example.com",
                "active_org_id": None,
            }
        raise UnauthorizedException.invalid_access_token()


setattr(app.state, PROPELAUTH_STATE_KEY, _TestPropelAuth())


@pytest.fixture(autouse=True)
def override_authenticated_user() -> None:
    setattr(app.state, PROPELAUTH_STATE_KEY, _TestPropelAuth())
    app.dependency_overrides[require_authenticated_user] = _mock_authenticated_user
    yield
    app.dependency_overrides.pop(require_authenticated_user, None)


@pytest.fixture
def without_auth_override(override_authenticated_user: None) -> None:
    previous_override = app.dependency_overrides.pop(require_authenticated_user, None)
    try:
        yield
    finally:
        if previous_override is not None:
            app.dependency_overrides[require_authenticated_user] = previous_override
