from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(..., min_length=1)
    duration_in_minutes: int = Field(..., gt=0, strict=True)


class GenerateTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    duration_in_minutes: int = Field(..., gt=0, strict=True)


class AuthTokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str
    email: EmailStr
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class WhoAmIResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str
    email: EmailStr | None = None
    active_org_id: str | None = None
