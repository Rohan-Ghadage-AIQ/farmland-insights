from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from datetime import date, datetime, timedelta, timezone as dt_timezone
from email.utils import parsedate_to_datetime
import math
import random
from statistics import fmean
from typing import Any

import geopandas as gpd
import httpx

from app.config import get_settings
from app.exceptions import DomainError

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_RETRIES = 4
RETRY_BASE_DELAY_SECONDS = 0.5
RETRY_MAX_DELAY_SECONDS = 8.0
DEFAULT_CLIMATOLOGY_YEARS = 30
MIN_CLIMATOLOGY_YEARS = 10

# Canonical business metric keys -> accepted Open-Meteo hourly field names.
DEFAULT_WEATHER_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "t2m": ("temperature_2m",),
    "rh": ("relative_humidity_2m",),
    "precip": ("precipitation",),
    "soil_moist": ("soil_moisture_0_to_1cm", "soil_moisture_0_to_7cm"),
    "soil_temp": ("soil_temperature_0cm", "soil_temperature_0_to_7cm"),
    "et_actual": ("evapotranspiration", "et0_fao_evapotranspiration"),
}

DEFAULT_HOURLY_VARIABLES: tuple[str, ...] = (
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "soil_moisture_0_to_1cm",
    "soil_moisture_0_to_7cm",
    "soil_temperature_0cm",
    "soil_temperature_0_to_7cm",
    "evapotranspiration",
    "et0_fao_evapotranspiration",
)

CLIMATOLOGY_DAILY_VARIABLES: tuple[str, ...] = (
    "temperature_2m_mean",
    "precipitation_sum",
    "et0_fao_evapotranspiration",
)


async def fetch_weather_telemetry(
    *,
    farm_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
) -> tuple[dict[str, float], dict[str, Any]]:
    """
    Fetch and merge weather telemetry for a farm geometry and date range.

    Splits the requested date range into archive and/or forecast weather windows,
    derives latitude/longitude from the centroid of the unioned farm geometry, and
    fetches hourly Open-Meteo payloads for each resolved window. If both archive and
    forecast windows are needed, the requests are run concurrently. The hourly
    payloads are merged and reduced to scalar weather means.

    Args:
        farm_geo_df: GeoDataFrame containing the farm geometry. Geometry coordinates
            are expected to be longitude/latitude, e.g. EPSG:4326.
        start_date: Inclusive start of the requested weather window.
        end_date: Inclusive end of the requested weather window.

    Returns:
        A tuple containing:
            weather_means: Scalar float means keyed by canonical weather metric.
            merged_hourly_payload: Merged hourly Open-Meteo payload for downstream
                analysis.

    Raises:
        DomainError: If the date range cannot be resolved, weather requests fail,
            payloads are invalid, or required hourly variables are unavailable.
    """

    archive_window, forecast_window = resolve_weather_windows(
        start_date=start_date,
        end_date=end_date,
    )
    if archive_window is None and forecast_window is None:
        raise DomainError(
            "Requested date window cannot be resolved to archive or forecast weather sources.",
            details={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        )

    farm_centroid = farm_geo_df.geometry.union_all().centroid
    weather_latitude = float(farm_centroid.y)
    weather_longitude = float(farm_centroid.x)

    payload_tasks = []
    async with httpx.AsyncClient() as weather_client:
        if archive_window is not None:
            archive_start, archive_end = archive_window
            payload_tasks.append(
                fetch_archive_weather(
                    latitude=weather_latitude,
                    longitude=weather_longitude,
                    start_date=archive_start,
                    end_date=archive_end,
                    client=weather_client,
                )
            )
        if forecast_window is not None:
            forecast_start, forecast_end = forecast_window
            payload_tasks.append(
                fetch_forecast_weather(
                    latitude=weather_latitude,
                    longitude=weather_longitude,
                    start_date=forecast_start,
                    end_date=forecast_end,
                    client=weather_client,
                )
            )

        payloads = await asyncio.gather(*payload_tasks)

    merged_hourly_payload = merge_hourly_payloads(list(payloads))
    weather_means = calculate_weather_means(merged_hourly_payload, strict=True)
    return weather_means, merged_hourly_payload


async def fetch_weather_climatology(
    *,
    farm_geo_df: gpd.GeoDataFrame,
    start_date: date,
    end_date: date,
    baseline_years: int = DEFAULT_CLIMATOLOGY_YEARS,
    min_sample_years: int = MIN_CLIMATOLOGY_YEARS,
) -> dict[str, Any]:
    """
    Fetch Open-Meteo archive data and compute historical mean/SD normals.

    The climatology uses the same calendar month/day window as the requested
    analysis period across previous years. Monthly requests therefore produce
    monthly climatology, while shorter windows are compared against matching
    historical windows.
    """

    if baseline_years <= 1:
        raise DomainError(
            "baseline_years must be greater than one.",
            details={"baseline_years": baseline_years},
        )
    if min_sample_years <= 1:
        raise DomainError(
            "min_sample_years must be greater than one.",
            details={"min_sample_years": min_sample_years},
        )

    _validate_date_range(start_date=start_date, end_date=end_date)
    farm_centroid = farm_geo_df.geometry.union_all().centroid
    latitude = float(farm_centroid.y)
    longitude = float(farm_centroid.x)

    baseline_end_year = start_date.year - 1
    baseline_start_year = baseline_end_year - baseline_years + 1
    if baseline_start_year < 1940:
        baseline_start_year = 1940
    if baseline_end_year < baseline_start_year:
        raise DomainError(
            "No prior historical years are available for weather climatology.",
            details={"start_date": start_date.isoformat()},
        )

    historical_end_date = date(baseline_end_year, 12, 31)
    if (start_date.month, start_date.day) > (end_date.month, end_date.day):
        historical_end_date = date(baseline_end_year + 1, end_date.month, end_date.day)

    payload = await fetch_archive_daily_weather(
        latitude=latitude,
        longitude=longitude,
        start_date=date(baseline_start_year, 1, 1),
        end_date=historical_end_date,
    )
    return calculate_weather_climatology(
        payload,
        target_start_date=start_date,
        target_end_date=end_date,
        baseline_start_year=baseline_start_year,
        baseline_end_year=baseline_end_year,
        min_sample_years=min_sample_years,
    )


async def fetch_archive_weather(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    *,
    hourly_variables: Sequence[str] | None = None,
    timezone: str = "UTC",
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Fetch historical hourly weather from Open-Meteo archive API."""

    settings = get_settings()
    return await _fetch_open_meteo_weather(
        url=settings.open_meteo_archive_url,
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
        hourly_variables=hourly_variables,
        timezone=timezone,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        client=client,
    )


async def fetch_archive_daily_weather(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    *,
    daily_variables: Sequence[str] | None = None,
    timezone: str = "UTC",
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Fetch historical daily weather from Open-Meteo archive API."""

    settings = get_settings()
    return await _fetch_open_meteo_daily_weather(
        url=settings.open_meteo_archive_url,
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
        daily_variables=daily_variables,
        timezone=timezone,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        client=client,
    )


async def fetch_forecast_weather(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    *,
    hourly_variables: Sequence[str] | None = None,
    timezone: str = "UTC",
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Fetch forecast hourly weather from Open-Meteo forecast API."""

    settings = get_settings()
    return await _fetch_open_meteo_weather(
        url=settings.open_meteo_forecast_url,
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
        hourly_variables=hourly_variables,
        timezone=timezone,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        client=client,
    )


def calculate_weather_means(
    payload: Mapping[str, Any],
    *,
    field_aliases: Mapping[str, Sequence[str]] | None = None,
    strict: bool = False,
) -> dict[str, float]:
    """
    Compute mean weather metrics from an Open-Meteo payload (or payload['hourly'] mapping).

    By default this maps Open-Meteo field names into business keys:
    `t2m`, `rh`, `precip`, `soil_moist`, `soil_temp`, `et_actual`.
    """

    hourly = _extract_hourly_payload(payload)
    alias_map = field_aliases or DEFAULT_WEATHER_FIELD_ALIASES
    means: dict[str, float] = {}
    missing_keys: list[str] = []

    for metric_key, accepted_fields in alias_map.items():
        values: list[float] = []

        for field in accepted_fields:
            raw_values = hourly.get(field)
            numeric_values = _coerce_numeric_values(raw_values)
            if len(numeric_values) > len(values):
                values = numeric_values

        if not values:
            missing_keys.append(metric_key)
            continue

        means[metric_key] = float(fmean(values))

    if strict and missing_keys:
        raise DomainError(
            "Missing hourly weather variables required for mean aggregation.",
            details={"missing_metric_keys": missing_keys},
        )

    if not means:
        raise DomainError("No numeric hourly weather values available for aggregation.")

    return means


def calculate_weather_climatology(
    payload: Mapping[str, Any],
    *,
    target_start_date: date,
    target_end_date: date,
    baseline_start_year: int,
    baseline_end_year: int,
    min_sample_years: int = MIN_CLIMATOLOGY_YEARS,
) -> dict[str, Any]:
    """
    Compute historical mean and sample SD for SPI/SPEI/RWI inputs.

    Aggregates daily archive values over the same calendar month/day window in
    each historical year. Returned metric keys are:
    - precip: total precipitation over the window
    - water_balance: total precipitation minus total ET0 over the window
    - t2m: mean 2 m air temperature over the window
    """

    daily = _extract_daily_payload(payload)
    target_month_days = _month_day_set(target_start_date, target_end_date)
    if not target_month_days:
        raise DomainError("No target days available for weather climatology.")
    expected_day_count = len(target_month_days)

    times = daily.get("time")
    if not isinstance(times, Sequence) or isinstance(times, (str, bytes, bytearray)):
        raise DomainError("Open-Meteo daily payload is missing valid time values.")

    precip_values = daily.get("precipitation_sum")
    et_values = daily.get("et0_fao_evapotranspiration")
    t2m_values = daily.get("temperature_2m_mean")

    grouped: dict[int, dict[str, list[float]]] = {}
    for index, raw_day in enumerate(times):
        try:
            day = date.fromisoformat(str(raw_day))
        except ValueError:
            continue
        if (day.month, day.day) not in target_month_days:
            continue

        period_year = _historical_period_year(
            day=day,
            target_start_date=target_start_date,
            target_end_date=target_end_date,
        )
        if period_year < baseline_start_year or period_year > baseline_end_year:
            continue

        period_values = grouped.setdefault(
            period_year,
            {"precip": [], "et": [], "t2m": []},
        )
        precip = _sequence_value_as_float(precip_values, index)
        if precip is not None:
            period_values["precip"].append(precip)
        et = _sequence_value_as_float(et_values, index)
        if et is not None:
            period_values["et"].append(et)
        t2m = _sequence_value_as_float(t2m_values, index)
        if t2m is not None:
            period_values["t2m"].append(t2m)

    precip_samples: list[float] = []
    water_balance_samples: list[float] = []
    t2m_samples: list[float] = []
    for values in grouped.values():
        if len(values["precip"]) == expected_day_count:
            precip_total = sum(values["precip"])
            precip_samples.append(precip_total)
            if len(values["et"]) == expected_day_count:
                water_balance_samples.append(precip_total - sum(values["et"]))
        if len(values["t2m"]) == expected_day_count:
            t2m_samples.append(float(fmean(values["t2m"])))

    climatology: dict[str, Any] = {
        "baseline_start_year": baseline_start_year,
        "baseline_end_year": baseline_end_year,
        "target_start_month_day": f"{target_start_date.month:02d}-{target_start_date.day:02d}",
        "target_end_month_day": f"{target_end_date.month:02d}-{target_end_date.day:02d}",
    }
    for metric_key, samples in (
        ("precip", precip_samples),
        ("water_balance", water_balance_samples),
        ("t2m", t2m_samples),
    ):
        stats = _sample_mean_sd(samples, min_sample_years=min_sample_years)
        if stats is not None:
            climatology[metric_key] = stats

    return climatology


def resolve_weather_windows(
    start_date: date,
    end_date: date,
) -> tuple[tuple[date, date] | None, tuple[date, date] | None]:
    """Split date range into archive-only past and forecast-capable windows."""

    today = date.today()

    archive_window: tuple[date, date] | None = None
    if start_date < today:
        archive_end = min(end_date, today - timedelta(days=1))
        if start_date <= archive_end:
            archive_window = (start_date, archive_end)

    forecast_window: tuple[date, date] | None = None
    if end_date >= today:
        forecast_start = max(start_date, today)
        if forecast_start <= end_date:
            forecast_window = (forecast_start, end_date)

    return archive_window, forecast_window


def merge_hourly_payloads(payloads: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge hourly arrays across multiple Open-Meteo payloads."""

    merged_hourly: dict[str, list[Any]] = {}
    for payload in payloads:
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict):
            raise DomainError(
                "Weather payload is missing a valid hourly section.",
                details={"available_keys": sorted(payload.keys())},
            )

        for variable, values in hourly.items():
            if not isinstance(values, list):
                continue
            merged_hourly.setdefault(variable, []).extend(values)

    if not merged_hourly:
        raise DomainError("No hourly weather values found in Open-Meteo payloads.")

    return {"hourly": merged_hourly}


async def _fetch_open_meteo_weather(
    *,
    url: str,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    hourly_variables: Sequence[str] | None,
    timezone: str,
    timeout_seconds: float,
    max_retries: int,
    client: httpx.AsyncClient | None,
) -> dict[str, Any]:
    """
    Core internal driver for Open-Meteo HTTP requests.

    Validates coordinates, date range, timeout, and retry configuration before
    building the Open-Meteo query parameters. Uses a provided httpx.AsyncClient for
    connection reuse when supplied; otherwise creates a short-lived client scoped to
    this call. Delegates HTTP execution and retry behavior to _request_open_meteo,
    then validates that the response contains a valid "hourly" mapping.

    Args:
        url: Full Open-Meteo endpoint URL.
        latitude: Latitude coordinate, validated to [-90, 90].
        longitude: Longitude coordinate, validated to [-180, 180].
        start_date: Inclusive start of the requested weather window.
        end_date: Inclusive end of the requested weather window.
        hourly_variables: Open-Meteo hourly variable names to request. If None or
            empty, DEFAULT_HOURLY_VARIABLES is used.
        timezone: Timezone string forwarded to Open-Meteo.
        timeout_seconds: Per-request HTTP timeout; must be > 0.
        max_retries: Number of retry attempts after the initial request; must be >= 0.
        client: Optional shared AsyncClient. If None, a client is created and closed
            within this call.

    Returns:
        Raw Open-Meteo response dict containing a valid "hourly" mapping.

    Raises:
        DomainError: On invalid input, failed Open-Meteo requests, invalid JSON,
            non-object responses, missing hourly data, or invalid hourly payload shape.
    """

    _validate_coordinates(latitude=latitude, longitude=longitude)
    _validate_date_range(start_date=start_date, end_date=end_date)

    if timeout_seconds <= 0:
        raise DomainError(
            "timeout_seconds must be greater than zero.",
            details={"timeout_seconds": timeout_seconds},
        )
    if max_retries < 0:
        raise DomainError(
            "max_retries must be greater than or equal to zero.",
            details={"max_retries": max_retries},
        )

    selected_variables = tuple(hourly_variables or DEFAULT_HOURLY_VARIABLES)
    if not selected_variables:
        raise DomainError("At least one hourly weather variable is required.")

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": ",".join(selected_variables),
        "timezone": timezone,
    }

    if client is not None:
        payload = await _request_open_meteo(
            client=client,
            url=url,
            params=params,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )
    else:
        async with httpx.AsyncClient() as async_client:
            payload = await _request_open_meteo(
                client=async_client,
                url=url,
                params=params,
                timeout_seconds=timeout_seconds,
                max_retries=max_retries,
            )

    if "hourly" not in payload:
        raise DomainError(
            "Open-Meteo response is missing hourly data.",
            details={"available_keys": sorted(payload.keys())},
        )
    _extract_hourly_payload(payload)
    return payload


async def _fetch_open_meteo_daily_weather(
    *,
    url: str,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    daily_variables: Sequence[str] | None,
    timezone: str,
    timeout_seconds: float,
    max_retries: int,
    client: httpx.AsyncClient | None,
) -> dict[str, Any]:
    """Core internal driver for Open-Meteo daily archive requests."""

    _validate_coordinates(latitude=latitude, longitude=longitude)
    _validate_date_range(start_date=start_date, end_date=end_date)

    if timeout_seconds <= 0:
        raise DomainError(
            "timeout_seconds must be greater than zero.",
            details={"timeout_seconds": timeout_seconds},
        )
    if max_retries < 0:
        raise DomainError(
            "max_retries must be greater than or equal to zero.",
            details={"max_retries": max_retries},
        )

    selected_variables = tuple(daily_variables or CLIMATOLOGY_DAILY_VARIABLES)
    if not selected_variables:
        raise DomainError("At least one daily weather variable is required.")

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": ",".join(selected_variables),
        "timezone": timezone,
    }

    if client is not None:
        payload = await _request_open_meteo(
            client=client,
            url=url,
            params=params,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )
    else:
        async with httpx.AsyncClient() as async_client:
            payload = await _request_open_meteo(
                client=async_client,
                url=url,
                params=params,
                timeout_seconds=timeout_seconds,
                max_retries=max_retries,
            )

    if "daily" not in payload:
        raise DomainError(
            "Open-Meteo response is missing daily data.",
            details={"available_keys": sorted(payload.keys())},
        )
    _extract_daily_payload(payload)
    return payload


async def _request_open_meteo(
    *,
    client: httpx.AsyncClient,
    url: str,
    params: Mapping[str, Any],
    timeout_seconds: float,
    max_retries: int,
) -> dict[str, Any]:
    """
    Low-level HTTP executor for Open-Meteo requests with retry and backoff logic.

    Runs a GET request loop for up to max_retries + 1 total attempts. On each attempt:
    - HTTP 429 and 5xx responses are treated as retryable while retries remain.
    - Other HTTP error responses fail immediately.
    - Network-level httpx.RequestError failures are retried while retries remain.
    - Retry delays are computed by _compute_retry_delay_seconds, which honors a
        Retry-After header when present and otherwise uses capped exponential backoff
        with jitter.
    - A successful response is parsed as JSON and type-checked as a dict before
        being returned. Invalid JSON and non-dict JSON responses fail immediately.

    Args:
        client: Shared AsyncClient; caller is responsible for its lifecycle.
        url: Full Open-Meteo endpoint URL.
        params: Query parameters forwarded to the GET request.
        timeout_seconds: Per-attempt HTTP timeout.
        max_retries: Maximum number of retry attempts after the initial request.

    Returns:
        Parsed JSON response as a dict.

    Raises:
        DomainError: On non-retryable HTTP errors, exhausted retryable HTTP/network
            failures, invalid JSON, non-dict JSON, or defensive fallthrough after
            retries are exhausted.
    """

    for attempt in range(max_retries + 1):
        try:
            response = await client.get(url, params=params, timeout=timeout_seconds)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            should_retry = status_code == 429 or 500 <= status_code <= 599
            if should_retry and attempt < max_retries:
                await asyncio.sleep(_compute_retry_delay_seconds(attempt=attempt, response=exc.response))
                continue
            raise DomainError(
                "Open-Meteo returned an error response.",
                details={
                    "url": str(exc.request.url),
                    "status_code": status_code,
                    "response_text": exc.response.text[:500],
                    "attempts": attempt + 1,
                },
            ) from exc
        except httpx.RequestError as exc:
            if attempt < max_retries:
                await asyncio.sleep(_compute_retry_delay_seconds(attempt=attempt, response=None))
                continue
            request_url = str(exc.request.url) if exc.request is not None else url
            raise DomainError(
                "Open-Meteo request failed.",
                details={"url": request_url, "error": str(exc), "attempts": attempt + 1},
            ) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise DomainError(
                "Open-Meteo response is not valid JSON.",
                details={"url": str(response.request.url)},
            ) from exc

        if not isinstance(data, dict):
            raise DomainError(
                "Open-Meteo response JSON must be an object.",
                details={"received_type": type(data).__name__},
            )
        return data

    raise DomainError(
        "Open-Meteo request failed after retries.",
        details={"url": url, "attempts": max_retries + 1},
    )


def _compute_retry_delay_seconds(*, attempt: int, response: httpx.Response | None) -> float:
    """
    Compute the delay in seconds before the next retry attempt.

    Prefers the server-supplied Retry-After header when present and parseable. If no
    valid Retry-After value is available, falls back to capped exponential backoff
    with up to 25% positive jitter. Returned delays are capped at
    RETRY_MAX_DELAY_SECONDS; Retry-After delays are also clamped to zero when they
    parse to a negative value.

    Args:
        attempt: Zero-based failed-attempt index used in the backoff formula:
            RETRY_BASE_DELAY_SECONDS * 2**attempt.
        response: Failed HTTP response, or None for network-level errors. If
            provided, its Retry-After header is checked first.

    Returns:
        Seconds to wait before the next attempt as a float.
    """

    retry_after_header = response.headers.get("Retry-After") if response is not None else None
    retry_after_seconds = _parse_retry_after_seconds(retry_after_header)
    if retry_after_seconds is not None:
        return min(RETRY_MAX_DELAY_SECONDS, max(0.0, retry_after_seconds))

    backoff = min(RETRY_MAX_DELAY_SECONDS, RETRY_BASE_DELAY_SECONDS * (2**attempt))
    jitter = random.uniform(0.0, backoff * 0.25)
    return min(RETRY_MAX_DELAY_SECONDS, backoff + jitter)


def _parse_retry_after_seconds(retry_after: str | None) -> float | None:
    """
    Parse an HTTP Retry-After header value into seconds.

    Handles both Retry-After formats:
    - Delta-seconds: parsed as a float and returned directly.
    - HTTP-date: converted to seconds remaining from the current UTC time. Naive
        parsed datetimes are treated as UTC.

    Args:
        retry_after: Raw Retry-After header value, or None if absent.

    Returns:
        Seconds to wait as a float, or None if the input is absent, blank, or cannot
        be parsed as either a number or an HTTP date.
    """

    if not retry_after:
        return None

    value = retry_after.strip()
    if not value:
        return None

    try:
        return float(value)
    except ValueError:
        pass

    try:
        retry_after_dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None

    if retry_after_dt is None:
        return None

    if retry_after_dt.tzinfo is None:
        retry_after_dt = retry_after_dt.replace(tzinfo=dt_timezone.utc)
    now = datetime.now(dt_timezone.utc)
    return (retry_after_dt - now).total_seconds()


def _extract_hourly_payload(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    """
    Extract the hourly block from an Open-Meteo payload.

    If the payload contains an "hourly" key, returns its value after validating that
    it is a Mapping. Raises DomainError if the hourly block is present but malformed.
    If no "hourly" key exists, returns the original payload unchanged, allowing
    callers to pass either a full Open-Meteo response or an already-extracted hourly
    mapping.

    Args:
        payload: Parsed Open-Meteo payload or hourly mapping.

    Returns:
        The hourly sub-mapping if present, otherwise the original payload.

    Raises:
        DomainError: If the "hourly" key exists but its value is not a Mapping.
    """

    if "hourly" in payload:
        hourly = payload.get("hourly")
        if not isinstance(hourly, Mapping):
            raise DomainError(
                "Open-Meteo payload contains invalid hourly section.",
                details={"hourly_type": type(hourly).__name__ if hourly is not None else None},
            )
        return hourly

    return payload


def _extract_daily_payload(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    """Extract and validate the daily block from an Open-Meteo payload."""

    if "daily" in payload:
        daily = payload.get("daily")
        if not isinstance(daily, Mapping):
            raise DomainError(
                "Open-Meteo payload contains invalid daily section.",
                details={"daily_type": type(daily).__name__ if daily is not None else None},
            )
        return daily
    return payload


def _sequence_value_as_float(values: Any, index: int) -> float | None:
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes, bytearray)):
        return None
    if index >= len(values):
        return None
    value = values[index]
    if value is None or isinstance(value, bool):
        return None
    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric_value):
        return None
    return numeric_value


def _month_day_set(start_date: date, end_date: date) -> set[tuple[int, int]]:
    month_days: set[tuple[int, int]] = set()
    current = start_date
    while current <= end_date:
        month_days.add((current.month, current.day))
        current += timedelta(days=1)
    return month_days


def _historical_period_year(
    *,
    day: date,
    target_start_date: date,
    target_end_date: date,
) -> int:
    start_month_day = (target_start_date.month, target_start_date.day)
    end_month_day = (target_end_date.month, target_end_date.day)
    if start_month_day <= end_month_day:
        return day.year
    return day.year if (day.month, day.day) >= start_month_day else day.year - 1


def _sample_mean_sd(
    samples: Sequence[float],
    *,
    min_sample_years: int,
) -> dict[str, float | int] | None:
    clean_samples = [value for value in samples if math.isfinite(value)]
    if len(clean_samples) < min_sample_years:
        return None
    mean = float(fmean(clean_samples))
    variance = sum((value - mean) ** 2 for value in clean_samples) / (len(clean_samples) - 1)
    sd = math.sqrt(variance)
    if sd <= 0:
        return None
    return {"mean": mean, "sd": sd, "sample_years": len(clean_samples)}


def _coerce_numeric_values(raw_values: Any) -> list[float]:
    """
    Coerce a raw sequence of values into a clean list of floats.

    Silently drops None, booleans, and values that cannot be converted to float.
    This is safe for Open-Meteo hourly arrays where missing observations may be
    represented as nulls. Strings, bytes, bytearrays, and non-Sequence inputs are
    rejected wholesale and return an empty list.

    Args:
        raw_values: Value from an Open-Meteo hourly payload; expected to be a
            sequence of numbers or nulls, but handled defensively.

    Returns:
        Successfully coerced floats in original order, or an empty list if the input
        is not an accepted sequence or contains no coercible values.
    """

    if not isinstance(raw_values, Sequence) or isinstance(raw_values, (str, bytes, bytearray)):
        return []

    numeric_values: list[float] = []
    for value in raw_values:
        if value is None or isinstance(value, bool):
            continue
        try:
            numeric_values.append(float(value))
        except (TypeError, ValueError):
            continue
    return numeric_values


def _validate_coordinates(*, latitude: float, longitude: float) -> None:
    """
    Validate latitude and longitude bounds.

    Args:
        latitude: Latitude value, expected to be between -90 and 90 inclusive.
        longitude: Longitude value, expected to be between -180 and 180 inclusive.

    Raises:
        DomainError: If latitude or longitude falls outside the valid coordinate range.
    """

    if latitude < -90 or latitude > 90:
        raise DomainError("latitude must be between -90 and 90.", details={"latitude": latitude})
    if longitude < -180 or longitude > 180:
        raise DomainError("longitude must be between -180 and 180.", details={"longitude": longitude})


def _validate_date_range(*, start_date: date, end_date: date) -> None:
    """
    Validate that the start date is not after the end date.

    Args:
        start_date: Inclusive start of the requested date range.
        end_date: Inclusive end of the requested date range.

    Raises:
        DomainError: If start_date is after end_date.
    """

    if start_date > end_date:
        raise DomainError(
            "start_date must be before or equal to end_date.",
            details={"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        )
