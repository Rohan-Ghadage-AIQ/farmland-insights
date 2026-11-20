from __future__ import annotations
from datetime import date
from app.services import weather_service


def expected_open_meteo_params(
    *,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    hourly_variables: tuple[str, ...] | None = None,
    timezone: str = "UTC",
) -> dict[str, str]:
    """
    Builds the expected Open-Meteo query parameter dict for request assertions.

    Matches the parameter formatting used by _fetch_open_meteo_weather so tests
    can assert that the correct params were sent to the API without repeating that
    formatting inline. Falls back to DEFAULT_HOURLY_VARIABLES if no variables are
    provided.
    """

    selected_variables = hourly_variables or weather_service.DEFAULT_HOURLY_VARIABLES
    return {
        "latitude": str(latitude),
        "longitude": str(longitude),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": ",".join(selected_variables),
        "timezone": timezone,
    }


def expected_open_meteo_daily_params(
    *,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    daily_variables: tuple[str, ...] | None = None,
    timezone: str = "UTC",
) -> dict[str, str]:
    """
    Builds expected Open-Meteo daily archive query parameters for tests.
    """

    selected_variables = daily_variables or weather_service.CLIMATOLOGY_DAILY_VARIABLES
    return {
        "latitude": str(latitude),
        "longitude": str(longitude),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": ",".join(selected_variables),
        "timezone": timezone,
    }


def hourly_payload(
    *,
    temperature_2m: list[float],
    relative_humidity_2m: list[float],
    precipitation: list[float],
    soil_moisture_0_to_1cm: list[float],
    soil_temperature_0cm: list[float],
    evapotranspiration: list[float],
) -> dict[str, dict[str, list[float]]]:
    """
    Builds a minimal Open-Meteo hourly payload dict for tests.

    Constructs the nested {"hourly": {...}} structure returned by Open-Meteo and
    validated by _fetch_open_meteo_weather, allowing tests to inject controlled
    weather data without rebuilding the dict manually in every test case.
    """

    return {
        "hourly": {
            "temperature_2m": temperature_2m,
            "relative_humidity_2m": relative_humidity_2m,
            "precipitation": precipitation,
            "soil_moisture_0_to_1cm": soil_moisture_0_to_1cm,
            "soil_temperature_0cm": soil_temperature_0cm,
            "evapotranspiration": evapotranspiration,
        }
    }


def daily_payload(
    *,
    times: list[str],
    temperature_2m_mean: list[float],
    precipitation_sum: list[float],
    et0_fao_evapotranspiration: list[float],
) -> dict[str, dict[str, list[float] | list[str]]]:
    """
    Builds a minimal Open-Meteo daily payload dict for climatology tests.
    """

    return {
        "daily": {
            "time": times,
            "temperature_2m_mean": temperature_2m_mean,
            "precipitation_sum": precipitation_sum,
            "et0_fao_evapotranspiration": et0_fao_evapotranspiration,
        }
    }
