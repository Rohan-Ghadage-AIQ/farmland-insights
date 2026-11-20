from __future__ import annotations
import datetime as dt
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from app.models.requests import FarmGeometry
from app.utils.payloads import SAMPLE_FARM_ANALYSIS_RESPONSE


class CPIScores(BaseModel):
    model_config = ConfigDict(extra="forbid")

    Structural: float = Field(..., ge=0.0, le=1.0)
    Chlorophyll: float = Field(..., ge=0.0, le=1.0)
    Water_Drought: float = Field(..., ge=0.0, le=1.0)
    Environmental: float = Field(..., ge=0.0, le=1.0)
    Agro_Meteo: float = Field(..., ge=0.0, le=1.0)

    @classmethod
    def zeroed(cls) -> "CPIScores":
        return cls(
            Structural=0.0,
            Chlorophyll=0.0,
            Water_Drought=0.0,
            Environmental=0.0,
            Agro_Meteo=0.0,
        )


class GridAnalysisProperties(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grid_id: str | int
    '''
    We use Field(default_factory=dict) instead of = {} to avoid shared mutable defaults.

    If we used = {}, multiple instances could end up sharing the same dictionary object.
    With default_factory=dict, each new instance gets its own fresh empty dict.
    '''
    raw_metrics: dict[str, float] = Field(default_factory=dict)
    cpi_scores: CPIScores
    advisories: dict[str, str] = Field(default_factory=dict)


class GridAnalysisFeature(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["Feature"] = "Feature"
    geometry: FarmGeometry = Field(..., discriminator="type")
    properties: GridAnalysisProperties
    id: str | int | None = None


class ImageryInfo(BaseModel):
    """Which satellite passes the per-cell indices actually came from."""

    model_config = ConfigDict(extra="forbid")

    image_date: dt.date | None = Field(
        default=None, description="The pass the user chose, or null when every pass was combined."
    )
    optical_date: dt.date | None = Field(
        default=None,
        description="Day of the Sentinel-2 (optical) pass used, or null when none was available or "
        "every pass in the period was combined.",
    )
    radar_date: dt.date | None = Field(
        default=None,
        description="Day of the Sentinel-1 (radar) pass used, or null when none was available or "
        "every pass in the period was combined.",
    )


class FarmAnalysisResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [SAMPLE_FARM_ANALYSIS_RESPONSE]},
    )

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GridAnalysisFeature] = Field(..., min_length=1)
    imagery: ImageryInfo | None = None


class SatellitePass(BaseModel):
    """One day on which a satellite photographed the farm."""

    model_config = ConfigDict(extra="forbid")

    date: dt.date
    optical: bool = Field(..., description="A Sentinel-2 (optical) image exists for this day.")
    cloud_cover: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Percent of the farm under cloud or cloud shadow in the optical image "
        "(the whole satellite scene when the provider cannot measure the farm alone). "
        "Null when there is no optical image or it could not be measured.",
    )
    radar: bool = Field(
        ..., description="A Sentinel-1 (radar) image exists for this day. Radar sees through cloud."
    )


class SatelliteDatesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dates: list[SatellitePass] = Field(default_factory=list, description="Newest first.")
