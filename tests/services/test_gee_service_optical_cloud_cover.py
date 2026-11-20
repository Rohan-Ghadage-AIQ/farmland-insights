from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import patch

from app.services import gee_service
from tests.dataclasses import FakeFilterExpression as _FakeFilterExpression
from tests.helpers import FakeEEModule as _FakeEEModule
from tests.helpers import mock_reduce_regions_mean_by_cloud_cover as _mock_reduce_regions_mean


class TestOpticalFetchCloudCover(unittest.IsolatedAsyncioTestCase):
    """
    Verifies that two optical fetches with different cloud-cover thresholds build
    different filter expressions and return different stubbed index values.

    Runs fetch_optical_indices twice against a FakeEEModule: once at 30% and once
    at 10% max cloud cover. _reduce_regions_mean is stubbed via
    mock_reduce_regions_mean_by_cloud_cover to return different metrics per threshold.

    Asserts:
        - Both calls applied an "lt" filter on CLOUDY_PIXEL_PERCENTAGE.
        - The filter values were 30 and 10 respectively, in that order.
        - Both results contain metrics for grid cell 1.
        - The 10% threshold result has higher stubbed ndvi, evi, and ndmi values
        than the 30% threshold result, proving the service passes the threshold
        through to the GEE query/reduction flow.
    """

    async def test_optical_fetch_compares_30_and_10_cloud_cover(self):
        fake_ee = _FakeEEModule()

        with (
            patch.object(gee_service, "_load_ee_module", return_value=fake_ee),
            patch.object(gee_service, "_aoi_from_grid", return_value=object()),
            patch.object(gee_service, "_grid_to_ee_feature_collection", return_value=object()),
            patch.object(gee_service, "_compute_optical_indices", side_effect=lambda _ee, image: image),
            patch.object(gee_service, "_reduce_regions_mean", side_effect=_mock_reduce_regions_mean),
        ):
            result_30 = await gee_service.fetch_optical_indices(
                grid_geo_df=object(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 15),
                max_cloud_cover=30,
            )
            result_10 = await gee_service.fetch_optical_indices(
                grid_geo_df=object(),
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 15),
                max_cloud_cover=10,
            )

        self.assertEqual(
            [expression.operator for expression in fake_ee.filter_expressions],
            ["lt", "lt"],
        )
        self.assertEqual(
            [expression.field for expression in fake_ee.filter_expressions],
            ["CLOUDY_PIXEL_PERCENTAGE", "CLOUDY_PIXEL_PERCENTAGE"],
        )
        self.assertEqual(
            [expression.value for expression in fake_ee.filter_expressions],
            [30, 10],
        )

        self.assertIn(1, result_30)
        self.assertIn(1, result_10)
        self.assertLess(result_30[1]["ndvi"], result_10[1]["ndvi"])
        self.assertLess(result_30[1]["evi"], result_10[1]["evi"])
        self.assertLess(result_30[1]["ndmi"], result_10[1]["ndmi"])

