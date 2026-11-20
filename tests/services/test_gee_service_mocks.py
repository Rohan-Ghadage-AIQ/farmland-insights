from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.dataclasses import SarFetchResult
from app.exceptions import DomainError
from app.services import gee_service
from tests.dataclasses import FakeFilterExpression as _FakeFilterExpression
from tests.helpers import FakeEEModule as _FakeEEModule
from tests.helpers import FakeReducibleImage as _FakeReducibleImage


@pytest.mark.asyncio
class TestGeeServiceEarthEngineMocks:
    """
    Mocked integration and unit tests for gee_service's Earth Engine orchestration layer.

    All tests run locally without GEE credentials by injecting FakeEEModule and
    unittest.mock patches in place of real ee calls.

    TestGeeServiceEarthEngineMocks
        Tests the fetch pipeline for optical indices, SAR indices, and merged zonal
        metrics using FakeEEModule to simulate the small Earth Engine API surface
        used by the service, while Mock/AsyncMock intercept compute and reduce calls.

        test_fetch_optical_indices_uses_cloud_filter_and_reduces_bands
            Verifies that fetch_optical_indices initializes GEE with the correct
            project, targets COPERNICUS/S2_SR_HARMONIZED, applies the cloud-cover
            filter, maps _compute_optical_indices over the collection, and passes
            OPTICAL_INDEX_BANDS to _reduce_regions_mean.

        test_fetch_optical_indices_returns_empty_when_collection_has_no_images
            Verifies that an empty Sentinel-2 collection short-circuits immediately,
            returning {} without invoking compute or reduce.

        test_fetch_sar_indices_rolls_back_until_images_are_available
            Verifies the rollback loop: start date 2026-01-10 yields 0 images,
            so the service rolls back 3 days to 2026-01-07 where 2 images exist.
            Asserts correct effective_start_date, rolled_back_days, both VV/VH
            polarization filters, IW mode filter, and SAR_INDEX_BANDS passed to
            _reduce_regions_mean.

        test_fetch_landsat_lst_uses_landsat9_after_launch_date
            Verifies the Landsat LST path targets Landsat 9 after its launch date,
            applies cloud filtering, computes LST, and reduces the `lst` band.

        test_fetch_gee_zonal_metrics_merges_optical_and_sar_results
            Verifies that fetch_gee_zonal_metrics correctly merges per-grid optical
            LST, and SAR metrics, forwards max_cloud_cover and rollback_days to their
            respective fetch calls, and returns the raw SarFetchResult unchanged.

    TestGeeReduceRegionsMean
        Unit tests for the _reduce_regions_mean parsing layer that converts raw
        GEE FeatureCollection payloads into a typed GridMetrics dict.

        test_reduce_regions_mean_parses_numeric_grid_properties
            Verifies correct handling of mixed-type grid_id keys, dropped None band
            values, dropped unparseable band values, skipped non-integer grid_ids,
            ignored malformed features, and correct bands/kwargs forwarded to
            select/reduceRegions.
    """
    async def test_fetch_optical_indices_uses_cloud_filter_and_reduces_bands(self) -> None:
        fake_ee = _FakeEEModule(optical_image_count=2)
        expected_metrics = {1: {"ndvi": 0.61, "evi": 0.42}}
        reduce_mock = Mock(return_value=expected_metrics)
        compute_mock = Mock(side_effect=lambda _ee, image: image)

        with (
            patch.object(gee_service, "_load_ee_module", return_value=fake_ee),
            patch.object(gee_service, "_aoi_from_grid", return_value="aoi"),
            patch.object(gee_service, "_grid_to_ee_feature_collection", return_value="grid"),
            patch.object(gee_service, "_compute_optical_indices", compute_mock),
            patch.object(gee_service, "_reduce_regions_mean", reduce_mock),
        ):
            result = await gee_service.fetch_optical_indices(
                grid_geo_df=object(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 15),
                max_cloud_cover=30,
                scale_meters=50,
                ee_project_id="test-ee-project",
            )

        assert result == expected_metrics
        assert fake_ee.initialized_projects == ["test-ee-project"]
        assert fake_ee.image_collection_names == ["COPERNICUS/S2_SR_HARMONIZED"]
        assert fake_ee.filter_expressions == [
            _FakeFilterExpression("lt", "CLOUDY_PIXEL_PERCENTAGE", 30)
        ]
        assert fake_ee.map_calls == ["COPERNICUS/S2_SR_HARMONIZED"]
        compute_mock.assert_called_once()
        reduce_mock.assert_called_once()
        assert reduce_mock.call_args.args[2] == gee_service.OPTICAL_INDEX_BANDS

    async def test_fetch_optical_indices_returns_empty_when_collection_has_no_images(self) -> None:
        fake_ee = _FakeEEModule(optical_image_count=0)
        reduce_mock = Mock()
        compute_mock = Mock(side_effect=lambda _ee, image: image)

        with (
            patch.object(gee_service, "_load_ee_module", return_value=fake_ee),
            patch.object(gee_service, "_aoi_from_grid", return_value="aoi"),
            patch.object(gee_service, "_grid_to_ee_feature_collection", return_value="grid"),
            patch.object(gee_service, "_compute_optical_indices", compute_mock),
            patch.object(gee_service, "_reduce_regions_mean", reduce_mock),
        ):
            result = await gee_service.fetch_optical_indices(
                grid_geo_df=object(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 15),
                max_cloud_cover=5,
                scale_meters=50,
            )

        assert result == {}
        compute_mock.assert_not_called()
        reduce_mock.assert_not_called()

    async def test_fetch_sar_indices_rolls_back_until_images_are_available(self) -> None:
        fake_ee = _FakeEEModule(
            sar_image_counts_by_start={
                "2026-01-10": 0,
                "2026-01-07": 2,
            }
        )
        expected_metrics = {1: {"rvi": 0.72, "rfdi": 0.11}}
        reduce_mock = Mock(return_value=expected_metrics)
        compute_mock = Mock(side_effect=lambda _ee, image: image)
        rsm_mock = Mock(side_effect=lambda _ee, composite, _aoi, _end: composite)

        with (
            patch.object(gee_service, "_load_ee_module", return_value=fake_ee),
            patch.object(gee_service, "_aoi_from_grid", return_value="aoi"),
            patch.object(gee_service, "_grid_to_ee_feature_collection", return_value="grid"),
            patch.object(gee_service, "_compute_sar_indices", compute_mock),
            patch.object(gee_service, "_reduce_regions_mean", reduce_mock),
            patch.object(gee_service, "_add_radar_soil_moisture", rsm_mock),
        ):
            result = await gee_service.fetch_sar_indices(
                grid_geo_df=object(),
                start_date=date(2026, 1, 10),
                end_date=date(2026, 1, 15),
                rollback_days=3,
                scale_meters=50,
            )

        assert result.metrics_by_grid_id == expected_metrics
        assert result.effective_start_date == date(2026, 1, 7)
        assert result.rolled_back_days == 3
        # Earth Engine's filterDate end is exclusive, so the day after keeps 2026-01-15 included.
        assert fake_ee.date_ranges == [
            ("COPERNICUS/S1_GRD", "2026-01-10", "2026-01-16"),
            ("COPERNICUS/S1_GRD", "2026-01-07", "2026-01-16"),
        ]
        rsm_mock.assert_called_once()
        assert rsm_mock.call_args.args[3] == date(2026, 1, 15)
        assert (
            _FakeFilterExpression("listContains", "transmitterReceiverPolarisation", "VV")
            in fake_ee.filter_expressions
        )
        assert (
            _FakeFilterExpression("listContains", "transmitterReceiverPolarisation", "VH")
            in fake_ee.filter_expressions
        )
        assert _FakeFilterExpression("eq", "instrumentMode", "IW") in fake_ee.filter_expressions
        compute_mock.assert_called_once()
        reduce_mock.assert_called_once()
        assert reduce_mock.call_args.args[2] == gee_service.SAR_INDEX_BANDS

    async def test_compute_sar_indices_uses_dual_pol_vv_vh_only(self) -> None:
        class FakeSarExpression:
            def __init__(self, name: str = "expr") -> None:
                self.name = name

            def add(self, _other: object) -> "FakeSarExpression":
                return self

            def divide(self, _other: object) -> "FakeSarExpression":
                return self

            def multiply(self, _other: object) -> "FakeSarExpression":
                return self

            def pow(self, _other: object) -> "FakeSarExpression":
                return self

            def rename(self, name: str) -> "FakeSarExpression":
                return FakeSarExpression(name)

            def subtract(self, _other: object) -> "FakeSarExpression":
                return self

        class FakeSarImage:
            def __init__(self) -> None:
                self.selected_bands: list[str] = []
                self.added_band_names: list[str] = []

            def select(self, band: str) -> FakeSarExpression:
                self.selected_bands.append(band)
                return FakeSarExpression(band)

            def addBands(self, bands: list[FakeSarExpression]) -> "FakeSarImage":
                self.added_band_names = [band.name for band in bands]
                return self

        class FakeSarEEModule:
            @staticmethod
            def Image(_value: object) -> FakeSarExpression:
                return FakeSarExpression()

        image = FakeSarImage()

        result = gee_service._compute_sar_indices(FakeSarEEModule(), image)

        assert result is image
        assert image.selected_bands == ["VV", "VH"]
        assert image.added_band_names == ["rvi", "dprvi", "dpsvi", "rfdi", "csi"]

    async def test_fetch_landsat_lst_uses_landsat9_after_launch_date(self) -> None:
        fake_ee = _FakeEEModule(
            landsat_image_counts_by_name={gee_service.LANDSAT9_COLLECTION: 2}
        )
        expected_metrics = {1: {"lst": 31.4}}
        reduce_mock = Mock(return_value=expected_metrics)
        compute_mock = Mock(side_effect=lambda _ee, image: image)

        with (
            patch.object(gee_service, "_load_ee_module", return_value=fake_ee),
            patch.object(gee_service, "_aoi_from_grid", return_value="aoi"),
            patch.object(gee_service, "_grid_to_ee_feature_collection", return_value="grid"),
            patch.object(gee_service, "_compute_landsat_lst", compute_mock),
            patch.object(gee_service, "_reduce_regions_mean", reduce_mock),
        ):
            result = await gee_service.fetch_landsat_lst(
                grid_geo_df=object(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 15),
                max_cloud_cover=20,
                scale_meters=30,
            )

        assert result == expected_metrics
        assert fake_ee.image_collection_names == [gee_service.LANDSAT9_COLLECTION]
        assert fake_ee.date_ranges == [
            (gee_service.LANDSAT9_COLLECTION, "2026-01-01", "2026-01-16")
        ]
        assert _FakeFilterExpression("lt", "CLOUD_COVER", 20) in fake_ee.filter_expressions
        compute_mock.assert_called_once()
        reduce_mock.assert_called_once()
        assert reduce_mock.call_args.args[2] == gee_service.LANDSAT_LST_BANDS

    async def test_fetch_gee_zonal_metrics_merges_optical_and_sar_results(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        optical_mock = AsyncMock(return_value={1: {"ndvi": 0.6}, 2: {"evi": 0.2}})
        lst_mock = AsyncMock(return_value={2: {"lst": 31.4}, 3: {"lst": 29.8}})
        sar_result = SarFetchResult(
            metrics_by_grid_id={1: {"rvi": 0.7}, 3: {"csi": 0.4}},
            effective_start_date=date(2026, 1, 1),
            rolled_back_days=0,
        )
        sar_mock = AsyncMock(return_value=sar_result)
        monkeypatch.setattr(gee_service, "fetch_optical_indices", optical_mock)
        monkeypatch.setattr(gee_service, "fetch_landsat_lst", lst_mock)
        monkeypatch.setattr(gee_service, "fetch_sar_indices", sar_mock)

        metrics, returned_sar_result = await gee_service.fetch_gee_zonal_metrics(
            grid_geo_df=object(),
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 15),
            max_cloud_cover=15,
            sar_rollback_days=5,
            scale_meters=25,
            ee_project_id="test-ee-project",
        )

        assert metrics == {
            1: {"ndvi": 0.6, "rvi": 0.7},
            2: {"evi": 0.2, "lst": 31.4},
            3: {"lst": 29.8, "csi": 0.4},
        }
        assert returned_sar_result is sar_result
        optical_mock.assert_awaited_once()
        lst_mock.assert_awaited_once()
        sar_mock.assert_awaited_once()
        assert optical_mock.await_args.kwargs["max_cloud_cover"] == 15
        assert lst_mock.await_args.kwargs["max_cloud_cover"] == 15
        assert lst_mock.await_args.kwargs["scale_meters"] == gee_service.DEFAULT_LANDSAT_REDUCE_SCALE_METERS
        assert sar_mock.await_args.kwargs["rollback_days"] == 5

    async def test_fetch_gee_zonal_metrics_narrows_each_sensor_to_its_chosen_pass(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        optical_mock = AsyncMock(return_value={1: {"ndvi": 0.6}})
        lst_mock = AsyncMock(return_value={})
        sar_mock = AsyncMock(
            return_value=SarFetchResult(
                metrics_by_grid_id={1: {"rvi": 0.7}},
                effective_start_date=date(2026, 1, 9),
                rolled_back_days=0,
            )
        )
        monkeypatch.setattr(gee_service, "fetch_optical_indices", optical_mock)
        monkeypatch.setattr(gee_service, "fetch_landsat_lst", lst_mock)
        monkeypatch.setattr(gee_service, "fetch_sar_indices", sar_mock)

        await gee_service.fetch_gee_zonal_metrics(
            grid_geo_df=object(),
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 15),
            optical_date=date(2026, 1, 8),
            radar_date=date(2026, 1, 9),
        )

        optical_kwargs = optical_mock.await_args.kwargs
        assert (optical_kwargs["start_date"], optical_kwargs["end_date"]) == (
            date(2026, 1, 8),
            date(2026, 1, 8),
        )
        # The user chose this pass, so the scene-wide cloud filter must not hide it.
        assert optical_kwargs["max_cloud_cover"] == 100
        sar_kwargs = sar_mock.await_args.kwargs
        assert (sar_kwargs["start_date"], sar_kwargs["end_date"]) == (date(2026, 1, 9), date(2026, 1, 9))
        lst_kwargs = lst_mock.await_args.kwargs
        assert (lst_kwargs["start_date"], lst_kwargs["end_date"]) == (date(2026, 1, 1), date(2026, 1, 15))

    async def test_fetch_gee_zonal_metrics_preserves_partial_sources_on_failure(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        optical_mock = AsyncMock(return_value={1: {"ndvi": 0.6, "evi": 0.2}})
        lst_mock = AsyncMock(return_value={1: {"lst": 31.4}})
        sar_mock = AsyncMock(
            side_effect=DomainError(
                "Failed to fetch SAR zonal indices from Google Earth Engine.",
                details={"error": "missing HH"},
            )
        )
        monkeypatch.setattr(gee_service, "fetch_optical_indices", optical_mock)
        monkeypatch.setattr(gee_service, "fetch_landsat_lst", lst_mock)
        monkeypatch.setattr(gee_service, "fetch_sar_indices", sar_mock)

        metrics, sar_result = await gee_service.fetch_gee_zonal_metrics(
            grid_geo_df=object(),
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 15),
        )

        assert metrics == {1: {"ndvi": 0.6, "evi": 0.2, "lst": 31.4}}
        assert sar_result == SarFetchResult(
            metrics_by_grid_id={},
            effective_start_date=None,
            rolled_back_days=0,
        )


class TestGeeReduceRegionsMean:
    def test_reduce_regions_mean_parses_numeric_grid_properties(self) -> None:
        image = _FakeReducibleImage(
            {
                "features": [
                    {"properties": {"grid_id": "1", "ndvi": "0.6", "evi": None, "savi": "bad"}},
                    {"properties": {"grid_id": 2, "ndvi": 0.2, "evi": 0.3}},
                    {"properties": {"grid_id": "not-an-int", "ndvi": 0.9}},
                    {"properties": []},
                    "not-a-feature",
                ]
            }
        )

        result = gee_service._reduce_regions_mean(
            _FakeEEModule(),
            image,
            ("ndvi", "evi", "savi"),
            grid_feature_collection="grid",
            scale_meters=50,
        )

        assert result == {
            1: {"ndvi": 0.6},
            2: {"ndvi": 0.2, "evi": 0.3},
        }
        assert image.selected_bands == ["ndvi", "evi", "savi"]
        assert image.reduce_regions_kwargs == {
            "collection": "grid",
            "reducer": "mean",
            "scale": 50,
        }
