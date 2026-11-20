from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock

import geopandas as gpd
import pytest
from pytest_httpx import HTTPXMock
from shapely.geometry import box

from app.exceptions import DomainError
from app.services import weather_service
from tests.helpers import (
    daily_payload as _daily_payload,
    expected_open_meteo_daily_params as _expected_daily_params,
    expected_open_meteo_params as _expected_params,
    hourly_payload as _hourly_payload,
)


@pytest.mark.asyncio
class TestOpenMeteoHttp:
    """
    HTTP-level integration tests for weather_service using pytest-httpx to intercept
    outbound httpx calls without making real network requests.

    test_fetch_weather_telemetry_merges_open_meteo_archive_and_forecast
        Verifies the full fetch_weather_telemetry pipeline across two date windows.
        Stubs resolve_weather_windows to return a one-day archive window and a
        one-day forecast window, registers matching mock responses for both
        Open-Meteo endpoints, and asserts:
            - Scalar weather means are correctly averaged across all 4 hourly readings.
            - The merged hourly payload concatenates archive and forecast temperature
            lists in request/result order.
            - Both archive and forecast URLs were actually requested.

    test_fetch_archive_weather_rejects_missing_hourly_payload
        Verifies that a response containing no "hourly" key raises DomainError
        with a "missing hourly" message.

    test_fetch_archive_weather_rejects_malformed_hourly_payload
        Verifies that a response where "hourly" is a list instead of a dict raises
        DomainError with an "invalid hourly" message before downstream calculations.

    test_open_meteo_retries_retryable_http_status
        Verifies the retry path used by _fetch_open_meteo_weather. Registers a 500
        response followed by a successful response on the same URL, stubs
        asyncio.sleep and _compute_retry_delay_seconds to eliminate real delays,
        and asserts:
            - The successful payload is returned after one retry.
            - asyncio.sleep was called exactly once between attempts.
            - Exactly two HTTP requests were made total.
    """

    async def test_fetch_weather_telemetry_merges_open_meteo_archive_and_forecast(
        self,
        httpx_mock: HTTPXMock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        settings = weather_service.get_settings()
        archive_start = date(2026, 4, 1)
        archive_end = date(2026, 4, 1)
        forecast_start = date(2026, 4, 2)
        forecast_end = date(2026, 4, 2)
        monkeypatch.setattr(
            weather_service,
            "resolve_weather_windows",
            lambda start_date, end_date: (
                (archive_start, archive_end),
                (forecast_start, forecast_end),
            ),
        )

        httpx_mock.add_response(
            method="GET",
            url=settings.open_meteo_archive_url,
            match_params=_expected_params(
                latitude=21.0,
                longitude=11.0,
                start_date=archive_start,
                end_date=archive_end,
            ),
            json=_hourly_payload(
                temperature_2m=[20.0, 22.0],
                relative_humidity_2m=[50.0, 60.0],
                precipitation=[1.0, 3.0],
                soil_moisture_0_to_1cm=[0.2, 0.4],
                soil_temperature_0cm=[18.0, 20.0],
                evapotranspiration=[2.0, 4.0],
            ),
        )
        httpx_mock.add_response(
            method="GET",
            url=settings.open_meteo_forecast_url,
            match_params=_expected_params(
                latitude=21.0,
                longitude=11.0,
                start_date=forecast_start,
                end_date=forecast_end,
            ),
            json=_hourly_payload(
                temperature_2m=[24.0, 26.0],
                relative_humidity_2m=[70.0, 80.0],
                precipitation=[5.0, 7.0],
                soil_moisture_0_to_1cm=[0.6, 0.8],
                soil_temperature_0cm=[22.0, 24.0],
                evapotranspiration=[6.0, 8.0],
            ),
        )

        farm_geo_df = gpd.GeoDataFrame(
            {"geometry": [box(10.0, 20.0, 12.0, 22.0)]},
            crs="EPSG:4326",
        )

        weather_means, hourly_payload = await weather_service.fetch_weather_telemetry(
            farm_geo_df=farm_geo_df,
            start_date=archive_start,
            end_date=forecast_end,
        )

        assert weather_means == pytest.approx(
            {
                "t2m": 23.0,
                "rh": 65.0,
                "precip": 4.0,
                "soil_moist": 0.5,
                "soil_temp": 21.0,
                "et_actual": 5.0,
            }
        )
        assert hourly_payload["hourly"]["temperature_2m"] == [20.0, 22.0, 24.0, 26.0]

        requested_urls = {
            str(request.url.copy_with(query=None))
            for request in httpx_mock.get_requests()
        }
        assert requested_urls == {
            settings.open_meteo_archive_url,
            settings.open_meteo_forecast_url,
        }

    async def test_fetch_archive_weather_rejects_missing_hourly_payload(
        self,
        httpx_mock: HTTPXMock,
    ) -> None:
        settings = weather_service.get_settings()
        start_date = date(2026, 1, 1)
        end_date = date(2026, 1, 2)
        httpx_mock.add_response(
            method="GET",
            url=settings.open_meteo_archive_url,
            match_params=_expected_params(
                latitude=12.5,
                longitude=77.6,
                start_date=start_date,
                end_date=end_date,
                hourly_variables=("temperature_2m",),
            ),
            json={"daily": {}},
        )

        with pytest.raises(DomainError, match="missing hourly"):
            await weather_service.fetch_archive_weather(
                latitude=12.5,
                longitude=77.6,
                start_date=start_date,
                end_date=end_date,
                hourly_variables=("temperature_2m",),
                max_retries=0,
            )

    async def test_fetch_archive_weather_rejects_malformed_hourly_payload(
        self,
        httpx_mock: HTTPXMock,
    ) -> None:
        settings = weather_service.get_settings()
        start_date = date(2026, 1, 1)
        end_date = date(2026, 1, 2)
        httpx_mock.add_response(
            method="GET",
            url=settings.open_meteo_archive_url,
            match_params=_expected_params(
                latitude=12.5,
                longitude=77.6,
                start_date=start_date,
                end_date=end_date,
                hourly_variables=("temperature_2m",),
            ),
            json={"hourly": []},
        )

        with pytest.raises(DomainError, match="invalid hourly"):
            await weather_service.fetch_archive_weather(
                latitude=12.5,
                longitude=77.6,
                start_date=start_date,
                end_date=end_date,
                hourly_variables=("temperature_2m",),
                max_retries=0,
            )

    async def test_fetch_archive_daily_weather_requests_daily_archive_payload(
        self,
        httpx_mock: HTTPXMock,
    ) -> None:
        settings = weather_service.get_settings()
        start_date = date(2020, 6, 1)
        end_date = date(2020, 6, 2)
        httpx_mock.add_response(
            method="GET",
            url=settings.open_meteo_archive_url,
            match_params=_expected_daily_params(
                latitude=12.5,
                longitude=77.6,
                start_date=start_date,
                end_date=end_date,
                daily_variables=("precipitation_sum",),
            ),
            json={"daily": {"time": ["2020-06-01"], "precipitation_sum": [1.0]}},
        )

        result = await weather_service.fetch_archive_daily_weather(
            latitude=12.5,
            longitude=77.6,
            start_date=start_date,
            end_date=end_date,
            daily_variables=("precipitation_sum",),
            max_retries=0,
        )

        assert result["daily"]["precipitation_sum"] == [1.0]

    async def test_calculate_weather_climatology_uses_historical_sample_sd(self) -> None:
        payload = _daily_payload(
            times=[
                "2020-06-01",
                "2020-06-02",
                "2021-06-01",
                "2021-06-02",
                "2022-06-01",
                "2022-06-02",
                "2022-07-01",
            ],
            temperature_2m_mean=[19.0, 21.0, 24.0, 26.0, 29.0, 31.0, 99.0],
            precipitation_sum=[10.0, 20.0, 20.0, 30.0, 30.0, 40.0, 1000.0],
            et0_fao_evapotranspiration=[1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 100.0],
        )

        climatology = weather_service.calculate_weather_climatology(
            payload,
            target_start_date=date(2026, 6, 1),
            target_end_date=date(2026, 6, 2),
            baseline_start_year=2020,
            baseline_end_year=2022,
            min_sample_years=3,
        )

        assert climatology["precip"] == pytest.approx(
            {"mean": 50.0, "sd": 20.0, "sample_years": 3}
        )
        assert climatology["water_balance"] == pytest.approx(
            {"mean": 45.0, "sd": 18.0, "sample_years": 3}
        )
        assert climatology["t2m"] == pytest.approx(
            {"mean": 25.0, "sd": 5.0, "sample_years": 3}
        )

    async def test_open_meteo_retries_retryable_http_status(
        self,
        httpx_mock: HTTPXMock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        url = "https://weather.example.test/open-meteo"
        start_date = date(2026, 1, 1)
        end_date = date(2026, 1, 1)
        match_params = _expected_params(
            latitude=1.0,
            longitude=2.0,
            start_date=start_date,
            end_date=end_date,
            hourly_variables=("temperature_2m",),
        )
        sleep_mock = AsyncMock()
        monkeypatch.setattr(weather_service.asyncio, "sleep", sleep_mock)
        monkeypatch.setattr(
            weather_service,
            "_compute_retry_delay_seconds",
            lambda *, attempt, response: 0.0,
        )
        httpx_mock.add_response(
            method="GET",
            url=url,
            match_params=match_params,
            status_code=500,
            text="temporary upstream failure",
        )
        httpx_mock.add_response(
            method="GET",
            url=url,
            match_params=match_params,
            json={"hourly": {"temperature_2m": [25.0]}},
        )

        result = await weather_service._fetch_open_meteo_weather(
            url=url,
            latitude=1.0,
            longitude=2.0,
            start_date=start_date,
            end_date=end_date,
            hourly_variables=("temperature_2m",),
            timezone="UTC",
            timeout_seconds=5.0,
            max_retries=1,
            client=None,
        )

        assert result == {"hourly": {"temperature_2m": [25.0]}}
        assert sleep_mock.await_count == 1
        assert len(httpx_mock.get_requests()) == 2
