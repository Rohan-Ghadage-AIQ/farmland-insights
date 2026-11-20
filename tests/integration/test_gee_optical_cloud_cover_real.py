from __future__ import annotations

import unittest
from datetime import date

from app.exceptions import DomainError
from app.services import gee_service
from tests.helpers import build_real_gee_test_grid, integration_enabled, is_finite_number


@unittest.skipUnless(
    integration_enabled(),
    "Set RUN_GEE_INTEGRATION_TESTS=1 to run real Earth Engine optical integration tests.",
)
class TestGeeOpticalCloudCoverReal(unittest.IsolatedAsyncioTestCase):
    """
    Live GEE integration test that validates optical index fetching under two cloud-cover thresholds.

    Skipped by default unless RUN_GEE_INTEGRATION_TESTS=1 is set. Fetches real
    Sentinel-2 optical indices for a fixed Santa Cruz County, California AOI over
    the April 1, 2025 to June 30, 2025 window at both 30% and 10% max cloud cover,
    then asserts:

        - Both runs return metrics for grid cell 1.
        - All OPTICAL_INDEX_BANDS are present and finite in both results.
        - The two runs produce measurably different values (delta > 1e-6 for at
        least one band), confirming that cloud-cover filtering has a real effect
        on the composite.

    Gracefully skips rather than fails if GEE credentials or a project ID are
    not configured in the test environment.
    """

    async def test_optical_fetch_with_30_and_10_cloud_cover_real_gee(self):
        grid = build_real_gee_test_grid()
        start_date = date(2025, 4, 1)
        end_date = date(2025, 6, 30)

        try:
            result_30 = await gee_service.fetch_optical_indices(
                grid_geo_df=grid,
                start_date=start_date,
                end_date=end_date,
                max_cloud_cover=30,
            )
            result_10 = await gee_service.fetch_optical_indices(
                grid_geo_df=grid,
                start_date=start_date,
                end_date=end_date,
                max_cloud_cover=10,
            )
        except DomainError as exc:
            self.skipTest(
                f"Earth Engine credentials/project not configured for integration run: {exc}"
            )

        self.assertIn(1, result_30, "No metrics returned for <30% cloud cover.")
        self.assertIn(1, result_10, "No metrics returned for <10% cloud cover.")

        metrics_30 = result_30[1]
        metrics_10 = result_10[1]
        self.assertTrue(metrics_30, "Empty metric payload for <30% cloud cover.")
        self.assertTrue(metrics_10, "Empty metric payload for <10% cloud cover.")

        # Ensure both runs produced numeric values for the optical index set.
        for band in gee_service.OPTICAL_INDEX_BANDS:
            self.assertIn(band, metrics_30, f"Missing band '{band}' for <30% cloud cover.")
            self.assertIn(band, metrics_10, f"Missing band '{band}' for <10% cloud cover.")
            self.assertTrue(is_finite_number(metrics_30[band]), f"Non-finite <30% value for {band}.")
            self.assertTrue(is_finite_number(metrics_10[band]), f"Non-finite <10% value for {band}.")

        # Requirement target: compare the two analysis outputs and verify they differ.
        absolute_deltas = {
            band: abs(float(metrics_30[band]) - float(metrics_10[band]))
            for band in gee_service.OPTICAL_INDEX_BANDS
        }
        self.assertTrue(
            any(delta > 1e-6 for delta in absolute_deltas.values()),
            "Expected a measurable output difference between <30% and <10% cloud-cover fetches.",
        )
