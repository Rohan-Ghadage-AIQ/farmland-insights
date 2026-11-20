from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ee_project_id: str | None = Field(default=None, alias="EE_PROJECT_ID")
    satellite_provider: str = Field(default="gee", alias="SATELLITE_PROVIDER")  # "gee" or "stac"
    # On networks that advertise IPv6 but cannot use it, Python waits ~21 s per new connection before
    # falling back to IPv4. Prefer IPv4 for the STAC/Planetary Computer requests (set false to disable).
    stac_prefer_ipv4: bool = Field(default=True, alias="STAC_PREFER_IPV4")
    propelauth_auth_url: str | None = Field(default=None, alias="PROPELAUTH_AUTH_URL")
    propelauth_api_key: str | None = Field(default=None, alias="PROPELAUTH_API_KEY")
    open_meteo_archive_url: str = Field(
        default="https://archive-api.open-meteo.com/v1/archive",
        alias="OPEN_METEO_ARCHIVE_URL",
    )
    open_meteo_forecast_url: str = Field(
        default="https://api.open-meteo.com/v1/forecast",
        alias="OPEN_METEO_FORECAST_URL",
    )
    database_uri: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URI", "DB_URI", "POSTGRES_URI"),
    )
    database_read_uri: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_READ_URI", "READ_DATABASE_URI"),
    )
    database_write_uri: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_WRITE_URI", "WRITE_DATABASE_URI"),
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
