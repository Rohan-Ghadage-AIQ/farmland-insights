from __future__ import annotations
from datetime import date, timedelta
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# The longest period one analysis may cover: a year, counting both end days (a leap year has 366).
MAX_PERIOD_DAYS = 366


class CropCategory(str, Enum):
    cereals_c3_temperate = "cereals_c3_temperate"
    cereals_c4_tropical = "cereals_c4_tropical"
    fruits_orchard = "fruits_orchard"
    fruits_tropical = "fruits_tropical"
    legumes_cool_season = "legumes_cool_season"
    legumes_warm_season = "legumes_warm_season"
    oilseeds_cool = "oilseeds_cool"
    oilseeds_warm = "oilseeds_warm"
    tubers_temperate = "tubers_temperate"
    tubers_tropical = "tubers_tropical"
    vegetables_cool = "vegetables_cool"
    vegetables_warm = "vegetables_warm"


SUPPORTED_CROPS: tuple[tuple[str, str, CropCategory], ...] = (
    ("Wheat", "Gehu", CropCategory.cereals_c3_temperate),
    ("Barley", "Jau", CropCategory.cereals_c3_temperate),
    ("Oats", "Jai", CropCategory.cereals_c3_temperate),
    ("Rye", "Rai", CropCategory.cereals_c3_temperate),
    ("Triticale", "Triticale", CropCategory.cereals_c3_temperate),
    ("Maize", "Makka", CropCategory.cereals_c4_tropical),
    ("Sorghum", "Jowar", CropCategory.cereals_c4_tropical),
    ("Pearl Millet", "Bajra", CropCategory.cereals_c4_tropical),
    ("Finger Millet", "Ragi", CropCategory.cereals_c4_tropical),
    ("Sugarcane", "Ganna", CropCategory.cereals_c4_tropical),
    ("Foxtail Millet", "Kangni", CropCategory.cereals_c4_tropical),
    ("Little Millet", "Kutki", CropCategory.cereals_c4_tropical),
    ("Barnyard Millet", "Sanwa", CropCategory.cereals_c4_tropical),
    ("Kodo Millet", "Kodo", CropCategory.cereals_c4_tropical),
    ("Green Peas", "Matar", CropCategory.legumes_cool_season),
    ("Lentils", "Masoor", CropCategory.legumes_cool_season),
    ("Chickpeas", "Chana", CropCategory.legumes_cool_season),
    ("Faba beans", "Bakla", CropCategory.legumes_cool_season),
    ("Grass pea", "Khesari", CropCategory.legumes_cool_season),
    ("Fenugreek (Seeds)", "Methi", CropCategory.legumes_cool_season),
    ("Soybeans", "Soyabean", CropCategory.legumes_warm_season),
    ("Peanuts", "Moongphali", CropCategory.legumes_warm_season),
    ("Cowpeas", "Lobia", CropCategory.legumes_warm_season),
    ("Mung beans", "Moong", CropCategory.legumes_warm_season),
    ("Kidney beans", "Rajma", CropCategory.legumes_warm_season),
    ("Pigeon pea", "Tur / Arhar", CropCategory.legumes_warm_season),
    ("Black gram", "Urad", CropCategory.legumes_warm_season),
    ("Moth bean", "Moth", CropCategory.legumes_warm_season),
    ("Horse gram", "Kulthi", CropCategory.legumes_warm_season),
    ("Potatoes", "Aloo", CropCategory.tubers_temperate),
    ("Beetroot", "Chukandar", CropCategory.tubers_temperate),
    ("Turnip", "Shalgam", CropCategory.tubers_temperate),
    ("Cassava", "Tapioca", CropCategory.tubers_tropical),
    ("Yams", "Suran", CropCategory.tubers_tropical),
    ("Sweet potatoes", "Shakarkand", CropCategory.tubers_tropical),
    ("Taro", "Arbi", CropCategory.tubers_tropical),
    ("Elephant Foot Yam", "Zamikand", CropCategory.tubers_tropical),
    ("Sunflowers", "Surajmukhi", CropCategory.oilseeds_warm),
    ("Sesame", "Til", CropCategory.oilseeds_warm),
    ("Castor beans", "Arandi", CropCategory.oilseeds_warm),
    ("Safflower", "Kusum", CropCategory.oilseeds_warm),
    ("Niger seed", "Ramtil", CropCategory.oilseeds_warm),
    ("Mustard", "Sarson", CropCategory.oilseeds_cool),
    ("Flaxseed", "Alsi", CropCategory.oilseeds_cool),
    ("Rapeseed", "Toria", CropCategory.oilseeds_cool),
    ("Apple", "Seb", CropCategory.fruits_orchard),
    ("Pear", "Nashpati", CropCategory.fruits_orchard),
    ("Peach", "Aadoo", CropCategory.fruits_orchard),
    ("Plum", "Aloo Bukhara", CropCategory.fruits_orchard),
    ("Apricot", "Khubani", CropCategory.fruits_orchard),
    ("Cherry", "Cherry", CropCategory.fruits_orchard),
    ("Walnut", "Akhrot", CropCategory.fruits_orchard),
    ("Banana", "Kela", CropCategory.fruits_tropical),
    ("Mango", "Aam", CropCategory.fruits_tropical),
    ("Pineapple", "Ananas", CropCategory.fruits_tropical),
    ("Papaya", "Papita", CropCategory.fruits_tropical),
    ("Guava", "Amrud", CropCategory.fruits_tropical),
    ("Pomegranate", "Anar", CropCategory.fruits_tropical),
    ("Jackfruit", "Kathal", CropCategory.fruits_tropical),
    ("Sapodilla", "Chikoo", CropCategory.fruits_tropical),
    ("Lychee", "Litchi", CropCategory.fruits_tropical),
    ("Coconut", "Nariyal", CropCategory.fruits_tropical),
    ("Tomato", "Tamatar", CropCategory.vegetables_warm),
    ("Bell Pepper", "Shimla Mirch", CropCategory.vegetables_warm),
    ("Eggplant (Brinjal)", "Baingan", CropCategory.vegetables_warm),
    ("Cucumber", "Kheera", CropCategory.vegetables_warm),
    ("Pumpkin", "Kaddu", CropCategory.vegetables_warm),
    ("Bitter Gourd", "Karela", CropCategory.vegetables_warm),
    ("Bottle Gourd", "Lauki", CropCategory.vegetables_warm),
    ("Ridge Gourd", "Torai", CropCategory.vegetables_warm),
    ("Okra / Ladyfinger", "Bhindi", CropCategory.vegetables_warm),
    ("Green Chilli", "Hari Mirch", CropCategory.vegetables_warm),
    ("Spinach", "Palak", CropCategory.vegetables_cool),
    ("Cabbage", "Patta Gobhi", CropCategory.vegetables_cool),
    ("Cauliflower", "Phool Gobhi", CropCategory.vegetables_cool),
    ("Carrot", "Gajar", CropCategory.vegetables_cool),
    ("Onion", "Pyaz", CropCategory.vegetables_cool),
    ("Radish", "Mooli", CropCategory.vegetables_cool),
    ("Broccoli", "Hari Gobhi", CropCategory.vegetables_cool),
    ("Garlic", "Lehsun", CropCategory.vegetables_cool),
    ("Fenugreek Leaves", "Methi Saag", CropCategory.vegetables_cool),
    ("Coriander Leaves", "Dhaniya", CropCategory.vegetables_cool),
)


def _normalize_crop_key(value: str) -> str:
    return " ".join(value.strip().casefold().replace("_", " ").split())


_CROP_INPUT_TO_CATEGORY: dict[str, CropCategory] = {
    _normalize_crop_key(category.value): category
    for category in CropCategory
}
for english_name, hindi_name, category in SUPPORTED_CROPS:
    _CROP_INPUT_TO_CATEGORY[_normalize_crop_key(english_name)] = category
    _CROP_INPUT_TO_CATEGORY[_normalize_crop_key(hindi_name)] = category


Position = tuple[float, float] | tuple[float, float, float]
LinearRing = list[Position]
PolygonCoordinates = list[LinearRing]
MultiPolygonCoordinates = list[PolygonCoordinates]


class PolygonGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["Polygon"]
    coordinates: PolygonCoordinates

    @field_validator("coordinates")
    @classmethod
    def validate_polygon_coordinates(cls, coordinates: PolygonCoordinates) -> PolygonCoordinates:
        if not coordinates:
            raise ValueError("Polygon must contain at least one linear ring.")
        for ring in coordinates:
            if len(ring) < 4:
                raise ValueError("Each polygon linear ring must contain at least 4 positions.")
            if ring[0] != ring[-1]:
                raise ValueError("Polygon linear rings must be closed (first position equals last position).")
        return coordinates


class MultiPolygonGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["MultiPolygon"]
    coordinates: MultiPolygonCoordinates

    @field_validator("coordinates")
    @classmethod
    def validate_multipolygon_coordinates(
        cls, coordinates: MultiPolygonCoordinates
    ) -> MultiPolygonCoordinates:
        if not coordinates:
            raise ValueError("MultiPolygon must contain at least one polygon.")
        for polygon in coordinates:
            if not polygon:
                raise ValueError("Each polygon in MultiPolygon must contain at least one linear ring.")
            for ring in polygon:
                if len(ring) < 4:
                    raise ValueError("Each polygon linear ring must contain at least 4 positions.")
                if ring[0] != ring[-1]:
                    raise ValueError(
                        "MultiPolygon linear rings must be closed (first position equals last position)."
                    )
        return coordinates


FarmGeometry = PolygonGeometry | MultiPolygonGeometry


class FarmFeature(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["Feature"] = "Feature"
    geometry: FarmGeometry = Field(..., discriminator="type")
    properties: dict[str, Any] = Field(default_factory=dict)
    id: str | int | None = None


class FarmFeatureCollection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[FarmFeature]

    @field_validator("features")
    @classmethod
    def validate_non_empty_features(cls, features: list[FarmFeature]) -> list[FarmFeature]:
        if not features:
            raise ValueError("FeatureCollection must contain at least one feature.")
        return features


def _validate_period(start_date: date, end_date: date) -> None:
    """The rules every request with a period shares: ordered, at most a year, within the forecast."""

    if start_date > end_date:
        raise ValueError("start_date must be before or equal to end_date.")

    period_days = (end_date - start_date).days + 1
    if period_days > MAX_PERIOD_DAYS:
        raise ValueError(
            f"The period cannot be longer than {MAX_PERIOD_DAYS} days (about a year); "
            f"{period_days} days were requested. Choose a shorter period."
        )

    max_forecast_date = date.today() + timedelta(days=16)
    if end_date > max_forecast_date:
        raise ValueError(
            f"end_date cannot be beyond {max_forecast_date.isoformat()} (maximum forecast horizon is 16 days)."
        )


class SatelliteDatesRequest(BaseModel):
    """Which days a satellite photographed the farm within a period."""

    model_config = ConfigDict(extra="forbid")

    farm_geojson: FarmFeatureCollection
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_date_range(self) -> "SatelliteDatesRequest":
        _validate_period(self.start_date, self.end_date)
        return self


class FarmAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    farm_geojson: FarmFeatureCollection
    start_date: date
    end_date: date
    image_date: date | None = Field(
        default=None,
        description=(
            "The satellite pass to analyse, chosen from POST /satellite-dates for the same period. "
            "Optical indices come from the Sentinel-2 pass on this day (or the nearest clear one) "
            "and radar indices from the Sentinel-1 pass on this day (or the nearest one). "
            "Omit it to combine every pass in the period (median). Weather always covers the "
            "whole period."
        ),
    )
    crop_category: CropCategory = Field(
        ...,
        description=(
            "Crop category key or supported crop name. Examples: "
            "'cereals_c3_temperate', 'Wheat', 'Gehu'."
        ),
    )
    grid_size: int = Field(default=50, gt=0, strict=True)

    @field_validator("crop_category", mode="before")
    @classmethod
    def resolve_crop_category(cls, crop_category: Any) -> Any:
        if isinstance(crop_category, CropCategory):
            return crop_category
        if not isinstance(crop_category, str):
            return crop_category

        normalized = _normalize_crop_key(crop_category)
        resolved = _CROP_INPUT_TO_CATEGORY.get(normalized)
        if resolved is None:
            return crop_category
        return resolved

    @model_validator(mode="after")
    def validate_date_range(self) -> "FarmAnalysisRequest":
        _validate_period(self.start_date, self.end_date)
        if self.image_date is not None and not (self.start_date <= self.image_date <= self.end_date):
            raise ValueError("image_date must fall within start_date and end_date.")
        return self
