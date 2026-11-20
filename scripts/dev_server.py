"""LOCAL DEVELOPMENT ONLY. Never deploy this.

Runs the real /api/v1/analyze pipeline (real weather + real satellite data via the STAC
service) without PropelAuth: sign-in is faked so the UI's "Get token" dev login works.
The production app (app.main) is untouched and still enforces PropelAuth.

    uv run uvicorn scripts.dev_server:app --port 8000
"""

from __future__ import annotations

import os

os.environ["SATELLITE_PROVIDER"] = "stac"  # must be set before app settings are read

from fastapi import FastAPI  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app.api.endpoints import analysis  # noqa: E402
from app.auth import require_authenticated_user  # noqa: E402
from app.config import get_settings  # noqa: E402

get_settings.cache_clear()

app = FastAPI(title="Farmland dev server (fake auth, real satellite data)")
app.dependency_overrides[require_authenticated_user] = lambda: {"user_id": "u_dev"}
app.include_router(analysis.router, prefix="/api/v1")


class _Credentials(BaseModel):
    email: str = "dev@example.com"


def _session(email: str) -> dict:
    return {
        "user_id": "u_dev",
        "email": email,
        "access_token": "dev-token",
        "token_type": "bearer",
        "expires_in_minutes": 480,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/auth/token")
@app.post("/api/v1/auth/register")
def issue_token(body: _Credentials | None = None) -> dict:
    return _session(body.email if body else "dev@example.com")


@app.get("/api/v1/auth/whoami")
def whoami() -> dict:
    return {"user_id": "u_dev", "email": "dev@example.com", "active_org_id": None}
