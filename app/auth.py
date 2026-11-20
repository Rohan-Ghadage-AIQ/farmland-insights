from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from propelauth_fastapi import FastAPIAuth, init_auth

from app.config import Settings

PROPELAUTH_STATE_KEY = "propelauth_auth"

_bearer_security = HTTPBearer(auto_error=False)


def initialize_propelauth(settings: Settings) -> FastAPIAuth:
    auth_url = (settings.propelauth_auth_url or "").strip()
    api_key = (settings.propelauth_api_key or "").strip()
    missing_env_vars = []
    if not auth_url:
        missing_env_vars.append("PROPELAUTH_AUTH_URL")
    if not api_key:
        missing_env_vars.append("PROPELAUTH_API_KEY")
    if missing_env_vars:
        raise RuntimeError(
            "PropelAuth is not configured. Missing environment variables: "
            + ", ".join(missing_env_vars)
        )

    return init_auth(auth_url=auth_url, api_key=api_key)


def get_propelauth_auth(request: Request) -> FastAPIAuth:
    auth = getattr(request.app.state, PROPELAUTH_STATE_KEY, None)
    if auth is None:
        raise RuntimeError("PropelAuth has not been initialized on application state.")
    return auth


def require_authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_security),
) -> Any:
    auth = get_propelauth_auth(request)
    return auth.require_user(credentials)
