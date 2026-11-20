from __future__ import annotations

import pytest

from app.exceptions import DomainError
from app.services import analytics_service
from app.services.thresholds import load_advisory_thresholds
from tests.helpers import threshold_rule as _rule


class TestAnalyticsMath:
    """
    Unit tests for the core analytics math in analytics_service.

    Covers derived index calculations, GDD base-temperature resolution, clipping,
    missing-input behavior, CPI scoring, and advisory classification boundaries
    without any external API dependencies.

    Test inventory:
        test_get_gdd_t_base_resolves_crop_prefixes
            GDD base temperature resolves correctly for known crop categories
            and falls back to 5.0 for unknown ones.

        test_gdd_uses_full_day_hourly_temperatures
            GDD is computed from 24 hourly temperatures against the crop base temp;
            24 readings of 25.0C with base 5.0C produce 20.0 GDD.

        test_calculate_derived_indices_covers_core_formulas
            Full derived-index assertion across two grid cells covering nddi, swdi,
            cmi, ai_dm, vci, tci, vhi, SD-based spi/spei/rwi, gdd, crti, and
            payout with pytest.approx tolerances.

        test_derived_indices_clip_and_avoid_zero_denominators
            Indices are clamped to valid ranges and omitted rather than producing
            NaN or ZeroDivisionError when denominator-sensitive inputs collapse.

        test_missing_or_non_numeric_inputs_omit_affected_indices
            Invalid or missing metric inputs cause only their dependent indices to
            be omitted; this test uses invalid inputs for all derivable indices.

        test_analysis_days_must_be_positive
            DomainError is raised when analysis_days is not greater than zero.

        test_cpi_scores_use_equal_weight_min_max_normalization
            CPI component scores are normalized to [0, 1] via min-max scaling
            against threshold min/max values and aggregated into named categories.

        test_advisory_classification_boundaries
            Parameter advisories classify values into Low / Moderate / High at
            threshold boundaries, and None inputs produce Unknown / critical action.
    """

    @pytest.mark.parametrize(
        ("crop_category", "expected_base"),
        [
            ("cereals_c3_temperate", 5.0),
            ("tubers_temperate", 7.0),
            ("fruits_orchard", 10.0),
            ("unknown_crop", 5.0),
        ],
    )
    def test_get_gdd_t_base_resolves_crop_prefixes(
        self,
        crop_category: str,
        expected_base: float,
    ) -> None:
        assert analytics_service.get_gdd_t_base(crop_category) == expected_base

    def test_gdd_uses_full_day_hourly_temperatures(self) -> None:
        derived = analytics_service.calculate_derived_indices(
            metrics_by_grid={1: {}},
            crop_category="cereals_c3_temperate",
            threshold_index={},
            hourly_weather={"hourly": {"temperature_2m": [25.0] * 24}},
        )

        assert derived[1]["gdd"] == 20.0

    def test_calculate_derived_indices_covers_core_formulas(self) -> None:
        threshold_index = {
            "precip": _rule("precip", 10.0, 30.0),
            "et_actual": _rule("et_actual", 0.0, 10.0),
            "t2m": _rule("t2m", 10.0, 30.0),
        }
        hourly_weather = {"hourly": {"temperature_2m": [10.0, 20.0, 30.0] * 8}}
        metrics_by_grid = {
            "north": {
                "ndvi": 0.7,
                "ndmi": 0.3,
                "ndwi": 0.3,
                "soil_moist": 0.25,
                "precip": 20.0,
                "et_actual": 5.0,
                "t2m": 20.0,
                "lst": 25.0,
            },
            "south": {
                "ndvi": 0.5,
                "ndmi": 0.4,
                "ndwi": 0.4,
                "soil_moist": 0.6,
                "precip": 2.0,
                "et_actual": 4.0,
                "t2m": 32.0,
                "lst": 35.0,
            },
        }

        derived = analytics_service.calculate_derived_indices(
            metrics_by_grid=metrics_by_grid,
            crop_category="cereals_c3_temperate",
            threshold_index=threshold_index,
            hourly_weather=hourly_weather,
            weather_climatology={
                "precip": {"mean": 20.0, "sd": 10.0},
                "water_balance": {"mean": 0.0, "sd": 10.0},
                "t2m": {"mean": 20.0, "sd": 10.0},
            },
            analysis_days=3,
        )

        assert derived["north"] == pytest.approx(
            {
                "nddi": 0.4,
                "swdi": 0.5,
                "cmi": 3.0,
                "ai_dm": 20.0 / 30.0,
                "vci": 100.0,
                "tci": 100.0,
                "vhi": 100.0,
                "spi": 0.0,
                "spei": 1.5,
                "gdd": 15.0,
                "crti": 22.0,
                "rwi": 0.0,
                "payout": 0.0,
            }
        )
        assert derived["south"] == pytest.approx(
            {
                "nddi": (0.5 - 0.4) / (0.5 + 0.4),
                "swdi": 0.0,
                "cmi": -0.5,
                "ai_dm": 2.0 / 42.0,
                "vci": 0.0,
                "tci": 0.0,
                "vhi": 0.0,
                "spi": -1.8,
                "spei": -0.2,
                "gdd": 15.0,
                "crti": 22.0,
                "rwi": 1.2,
                "payout": 1.0,
            }
        )

    def test_derived_indices_clip_and_avoid_zero_denominators(self) -> None:
        threshold_index = {
            "precip": _rule("precip", 10.0, 10.0),
            "et_actual": _rule("et_actual", 5.0, 5.0),
            "t2m": _rule("t2m", 20.0, 20.0),
        }

        derived = analytics_service.calculate_derived_indices(
            metrics_by_grid={
                "flat": {
                    "ndvi": 0.4,
                    "ndmi": -0.4,
                    "soil_moist": -0.1,
                    "precip": 100.0,
                    "et_actual": 0.0,
                    "t2m": 25.0,
                    "lst": 30.0,
                },
                "bad_ai": {"precip": 5.0, "t2m": -10.0},
            },
            crop_category="cereals_c3_temperate",
            threshold_index=threshold_index,
            hourly_weather={"hourly": {"temperature_2m": [25.0] * 24}},
            weather_climatology={
                "precip": {"mean": 0.0, "sd": 1.0},
                "water_balance": {"mean": 0.0, "sd": 1.0},
                "t2m": {"mean": 0.0, "sd": 1.0},
            },
            analysis_days=1,
        )

        flat = derived["flat"]
        assert "nddi" not in flat
        assert flat["swdi"] == 1.0
        assert flat["cmi"] == 3.0
        assert flat["vci"] == 50.0
        assert flat["tci"] == 50.0
        assert flat["vhi"] == 50.0
        assert flat["spi"] == 2.0
        assert flat["spei"] == 2.0
        assert flat["rwi"] == 2.0
        assert flat["payout"] == 1.0
        assert "ai_dm" not in derived["bad_ai"]

    def test_spi_spei_rwi_require_positive_climatology_sd(self) -> None:
        derived = analytics_service.calculate_derived_indices(
            metrics_by_grid={
                "grid": {
                    "precip": 25.0,
                    "et_actual": 5.0,
                    "t2m": 30.0,
                }
            },
            crop_category="cereals_c3_temperate",
            threshold_index={},
            weather_climatology={
                "precip": {"mean": 20.0, "sd": 0.0},
                "water_balance": {"mean": 10.0},
                "t2m": {"mean": 24.0, "sd": None},
            },
        )

        assert "spi" not in derived["grid"]
        assert "spei" not in derived["grid"]
        assert "rwi" not in derived["grid"]

    def test_missing_or_non_numeric_inputs_omit_affected_indices(self) -> None:
        derived = analytics_service.calculate_derived_indices(
            metrics_by_grid={
                1: {
                    "ndvi": "bad",
                    "ndmi": 0.3,
                    "soil_moist": True,
                    "precip": None,
                    "et_actual": 5.0,
                    "t2m": "bad",
                }
            },
            crop_category="cereals_c3_temperate",
            threshold_index={
                "precip": _rule("precip", 10.0, 30.0),
                "et_actual": _rule("et_actual", 0.0, 10.0),
                "t2m": _rule("t2m", 10.0, 30.0),
            },
        )

        assert derived[1] == {"crti": 0.0}

    def test_analysis_days_must_be_positive(self) -> None:
        with pytest.raises(DomainError, match="analysis_days"):
            analytics_service.calculate_derived_indices(
                metrics_by_grid={1: {"precip": 1.0, "t2m": 20.0}},
                crop_category="cereals_c3_temperate",
                threshold_index={},
                analysis_days=0,
            )

    def test_cpi_scores_use_equal_weight_min_max_normalization(self) -> None:
        '''
        This test uses only three metrics because it is testing the CPI calculation
        logic, not the full list of crop metrics.

        ndvi and evi both belong to the Structural cluster, so they verify that the
        code correctly normalizes multiple values and averages them within one cluster.

        t2m belongs to the Environmental cluster, so it verifies that CPI scoring also
        works for a separate cluster with a single metric.

        The remaining clusters receive no usable metrics, so the test also verifies
        that empty clusters return 0.0.

        These three metrics cover the important CPI rules:
            - single metric normalization
            - averaging multiple metrics in one cluster
            - scoring more than one cluster
            - returning 0.0 for empty clusters

        Adding every possible metric would make the test longer without testing a new
        CPI rule.
        '''

        scores = analytics_service.calculate_grid_cpi_scores(
            metrics={"ndvi": 0.7, "evi": 0.9, "t2m": 20.0},
            threshold_index={
                "ndvi": _rule("ndvi", 0.4, 1.0),
                "evi": _rule("evi", 0.3, 0.9),
                "t2m": _rule("t2m", 10.0, 30.0),
            },
        )

        assert scores["Structural"] == 0.75
        assert scores["Environmental"] == 0.5
        assert scores["Chlorophyll"] == 0.0
        assert scores["Water_Drought"] == 0.0
        assert scores["Agro_Meteo"] == 0.0

    @pytest.mark.parametrize(
        ("value", "expected_condition", "expected_action"),
        [
            (0.39, "Low", "ndvi low"),
            (0.4, "Moderate", "ndvi moderate"),
            (0.8, "Moderate", "ndvi moderate"),
            (0.81, "High", "ndvi high"),
            (None, "Unknown", "ndvi critical"),
        ],
    )
    def test_advisory_classification_boundaries(
        self,
        value: float | None,
        expected_condition: str,
        expected_action: str,
    ) -> None:
        result = analytics_service.evaluate_parameter_advisories(
            metrics={"ndvi": value},
            threshold_index={"ndvi": _rule("ndvi", 0.4, 1.0)},
        )

        assert result["ndvi"].condition == expected_condition
        assert result["ndvi"].recommended_action == expected_action

    @pytest.mark.parametrize(
        ("crop_category", "expected_trigger"),
        [
            ("cereals_c3_temperate", "0.55"),
            ("cereals_c4_tropical", "0.55"),
            ("legumes_cool_season", "0.35"),
            ("legumes_warm_season", "0.50"),
            ("tubers_temperate", "0.35"),
            ("tubers_tropical", "0.35"),
            ("oilseeds_warm", "0.45"),
            ("oilseeds_cool", "0.60"),
            ("fruits_orchard", "0.50"),
            ("fruits_tropical", "0.45"),
            ("vegetables_warm", "0.40"),
            ("vegetables_cool", "0.30"),
        ],
    )
    def test_build_threshold_index_uses_crop_specific_derived_swdi_thresholds(
        self,
        crop_category: str,
        expected_trigger: str,
    ) -> None:
        threshold_index = analytics_service.build_threshold_index(
            load_advisory_thresholds(),
            crop_category,
        )

        swdi_rule = threshold_index["swdi"]
        assert swdi_rule.low_range == f"<{expected_trigger}"
        assert swdi_rule.moderate_range == expected_trigger
        assert swdi_rule.high_range == f">{expected_trigger}"
