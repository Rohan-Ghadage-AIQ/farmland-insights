from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from propelauth_py.errors import (
    BadRequestException,
    CreateUserException,
    RateLimitedException,
    UserNotFoundException,
)

from app.auth import get_propelauth_auth, require_authenticated_user
from app.models.auth import (
    AuthTokenResponse,
    GenerateTokenRequest,
    RegisterUserRequest,
    WhoAmIResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthTokenResponse)
def register_user(request: Request, payload: RegisterUserRequest) -> AuthTokenResponse:
    auth = get_propelauth_auth(request)
    try:
        created_user = auth.create_user(
            email=str(payload.email),
            password=payload.password,
            email_confirmed=True,
            send_email_to_confirm_email_address=False,
        )
        access_token = _create_access_token(
            auth,
            user_id=_extract_required_attr(created_user, "user_id"),
            duration_in_minutes=payload.duration_in_minutes,
        )
    except (CreateUserException, BadRequestException) as exc:
        raise HTTPException(status_code=400, detail=_extract_error_detail(exc)) from exc
    except RateLimitedException as exc:
        raise HTTPException(status_code=429, detail=exc.error_message) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AuthTokenResponse(
        user_id=_extract_required_attr(created_user, "user_id"),
        email=payload.email,
        access_token=access_token,
        expires_in_minutes=payload.duration_in_minutes,
    )


@router.post("/token", response_model=AuthTokenResponse)
def generate_token(request: Request, payload: GenerateTokenRequest) -> AuthTokenResponse:
    auth = get_propelauth_auth(request)
    try:
        user = auth.fetch_user_metadata_by_email(str(payload.email))
        if user is None:
            raise HTTPException(status_code=404, detail="User not found.")
        access_token = _create_access_token(
            auth,
            user_id=_extract_required_attr(user, "user_id"),
            duration_in_minutes=payload.duration_in_minutes,
        )
    except HTTPException:
        raise
    except UserNotFoundException as exc:
        raise HTTPException(status_code=404, detail="User not found.") from exc
    except BadRequestException as exc:
        raise HTTPException(status_code=400, detail=_extract_error_detail(exc)) from exc
    except RateLimitedException as exc:
        raise HTTPException(status_code=429, detail=exc.error_message) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return AuthTokenResponse(
        user_id=_extract_required_attr(user, "user_id"),
        email=payload.email,
        access_token=access_token,
        expires_in_minutes=payload.duration_in_minutes,
    )


@router.get("/whoami", response_model=WhoAmIResponse)
def whoami(user: Any = Depends(require_authenticated_user)) -> WhoAmIResponse:
    return WhoAmIResponse(
        user_id=_extract_required_attr(user, "user_id"),
        email=_extract_optional_attr(user, "email"),
        active_org_id=_extract_optional_attr(user, "active_org_id"),
    )


def _create_access_token(auth: Any, *, user_id: str, duration_in_minutes: int) -> str:
    token_response = auth.create_access_token(
        user_id=user_id,
        duration_in_minutes=duration_in_minutes,
    )
    return _extract_required_attr(token_response, "access_token")


def _extract_required_attr(value: Any, name: str) -> str:
    extracted = _extract_optional_attr(value, name)
    if not extracted:
        raise RuntimeError(f"PropelAuth response is missing required field: {name}")
    return extracted


def _extract_optional_attr(value: Any, name: str) -> str | None:
    if isinstance(value, dict):
        raw_value = value.get(name)
    else:
        raw_value = getattr(value, name, None)
    return str(raw_value) if raw_value is not None else None


def _extract_error_detail(exc: Exception) -> Any:
    return getattr(exc, "field_to_errors", str(exc))
