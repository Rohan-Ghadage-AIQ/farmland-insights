from __future__ import annotations

import os
import socket
import sys
import types
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from rasterio.transform import from_origin
from shapely.geometry import box
import geopandas as gpd

from app.services import stac_service as stac


def test_optical_indices_match_gee_formulas():
    nir = np.array([[0.5]], dtype=np.float32)
    red = np.array([[0.1]], dtype=np.float32)
    green = np.array([[0.2]], dtype=np.float32)
    blue = np.array([[0.05]], dtype=np.float32)
    red_edge = np.array([[0.3]], dtype=np.float32)
    swir = np.array([[0.25]], dtype=np.float32)
    swir22 = np.array([[0.15]], dtype=np.float32)

    out = stac._compute_optical_indices_numpy(nir, red, green, blue, red_edge, swir, swir22)

    assert out["ndvi"][0, 0] == pytest.approx((0.5 - 0.1) / (0.5 + 0.1), rel=1e-4)
    assert out["evi"][0, 0] == pytest.approx(2.5 * 0.4 / (0.5 + 0.6 - 0.375 + 1), rel=1e-4)
    assert out["savi"][0, 0] == pytest.approx(1.5 * 0.4 / (0.6 + 0.5), rel=1e-4)
    assert out["gndvi"][0, 0] == pytest.approx(0.3 / 0.7, rel=1e-4)
    assert out["ndre"][0, 0] == pytest.approx(0.2 / 0.8, rel=1e-4)
    assert out["ndmi"][0, 0] == pytest.approx(0.25 / 0.75, rel=1e-4)
    assert out["ndwi"][0, 0] == pytest.approx((0.2 - 0.5) / (0.2 + 0.5), rel=1e-4)
    assert out["ndwi_farmonaut"][0, 0] == pytest.approx((0.5 - 0.15) / (0.5 + 0.15), rel=1e-4)


def test_sar_indices_match_gee_formulas():
    vv = np.array([[0.2]], dtype=np.float32)
    vh = np.array([[0.05]], dtype=np.float32)

    out = stac._compute_sar_indices_numpy(vv, vh)

    assert out["rvi"][0, 0] == pytest.approx(4 * 0.05 / 0.25, rel=1e-4)
    assert out["dprvi"][0, 0] == pytest.approx(1 - 0.2 / 0.25, rel=1e-4)
    assert out["dpsvi"][0, 0] == pytest.approx((0.2 - 0.05) * 0.05, rel=1e-4)
    assert out["rfdi"][0, 0] == pytest.approx(0.15 / 0.25, rel=1e-4)
    assert out["csi"][0, 0] == pytest.approx(0.05 / 0.2, rel=1e-4)


def test_lst_converts_scaled_kelvin_to_celsius_and_masks_implausible():
    # 0.00341802 * DN + 149 = 300 K  ->  26.85 C
    dn = np.array([[(300.0 - 149.0) / 0.00341802, 65535.0]], dtype=np.float32)
    zeros = np.zeros_like(dn)

    lst = stac._compute_landsat_lst_numpy(dn, zeros, zeros)["lst"]

    assert lst[0, 0] == pytest.approx(26.85, abs=0.05)
    assert np.isnan(lst[0, 1])  # 373 K is above the plausible-Earth cap


def test_rasterize_and_zonal_means_follow_grid_cells():
    grid = gpd.GeoDataFrame(
        {"grid_id": [1, 2]},
        geometry=[box(0, 0, 2, 2), box(2, 0, 4, 2)],
        crs="EPSG:3857",
    ).to_crs(4326)
    # 4x2 pixels over (0..4, 0..2) metres in EPSG:3857, 1 m pixels.
    transform = from_origin(0, 2, 1, 1)
    raster = stac._rasterize_grid(grid, transform, "EPSG:3857", (2, 4))

    assert set(np.unique(raster)) == {1, 2}

    band = np.array([[1, 1, 5, 5], [3, 3, 7, 7]], dtype=np.float32)
    metrics = stac._zonal_means({"ndvi": band}, raster, [1, 2])

    assert metrics[1]["ndvi"] == pytest.approx(2.0)
    assert metrics[2]["ndvi"] == pytest.approx(6.0)


def test_merge_grid_metrics_combines_sources_per_cell():
    merged = stac._merge_grid_metrics({1: {"ndvi": 0.5}}, {1: {"lst": 20.0}, 2: {"rvi": 1.0}})
    assert merged == {1: {"ndvi": 0.5, "lst": 20.0}, 2: {"rvi": 1.0}}


# --- network and reading speed -------------------------------------------------------------------


class _Settings:
    def __init__(self, prefer_ipv4: bool) -> None:
        self.stac_prefer_ipv4 = prefer_ipv4


@pytest.fixture
def clean_network_state(monkeypatch):
    """Resets the once-per-process network setup and restores urllib3 afterwards."""
    from urllib3.util import connection

    original = connection.allowed_gai_family
    monkeypatch.setattr(stac, "_network_configured", False)
    yield connection
    connection.allowed_gai_family = original


def test_ipv4_is_preferred_by_default_so_a_dead_ipv6_route_cannot_stall_every_request(
    monkeypatch, clean_network_state
):
    monkeypatch.setattr(stac, "get_settings", lambda: _Settings(prefer_ipv4=True))
    stac._configure_network()
    assert clean_network_state.allowed_gai_family() == socket.AF_INET


def test_ipv4_preference_can_be_switched_off(monkeypatch, clean_network_state):
    before = clean_network_state.allowed_gai_family
    monkeypatch.setattr(stac, "get_settings", lambda: _Settings(prefer_ipv4=False))
    stac._configure_network()
    assert clean_network_state.allowed_gai_family is before


def test_network_setup_runs_only_once(monkeypatch, clean_network_state):
    calls = []
    monkeypatch.setattr(stac, "get_settings", lambda: calls.append(1) or _Settings(True))
    stac._configure_network()
    stac._configure_network()
    assert len(calls) == 1


def test_the_catalogue_is_opened_once_and_reused(monkeypatch):
    opened = []

    class FakeClient:
        @staticmethod
        def open(url, modifier=None):
            opened.append((url, modifier))
            return object()

    monkeypatch.setattr(stac, "_configure_network", lambda: None)
    monkeypatch.setattr(stac, "_lazy_import_pystac_client", lambda: FakeClient)
    fake_pc = types.SimpleNamespace(sign_inplace=lambda item: item)
    monkeypatch.setitem(sys.modules, "planetary_computer", fake_pc)
    stac._catalog.cache_clear()
    try:
        first = stac._catalog()
        second = stac._catalog()
    finally:
        stac._catalog.cache_clear()
    assert first is second
    assert len(opened) == 1
    assert opened[0] == (stac.STAC_API_URL, fake_pc.sign_inplace)


def _fake_reader(shapes, calls):
    def read(href, bounds, target_shape=None):
        calls.append((href, target_shape))
        shape = target_shape or shapes[href]
        return np.full(shape, float(len(calls)), dtype=np.float32), "transform", "crs"

    return read


def test_read_bands_reads_native_bands_together_and_resamples_the_coarser_ones(monkeypatch):
    calls: list = []
    shapes = {"b08": (10, 10), "b04": (10, 10), "b05": (5, 5)}
    monkeypatch.setattr(stac, "_read_band_clipped", _fake_reader(shapes, calls))

    arrays, transform, crs, shape = stac._read_bands(
        {"nir": "b08", "red": "b04", "rededge": "b05"},
        (0, 0, 1, 1),
        native=["nir", "red"],
        resampled=["rededge"],
    )

    assert shape == (10, 10)
    assert (transform, crs) == ("transform", "crs")
    assert set(arrays) == {"nir", "red", "rededge"}
    assert all(array.shape == (10, 10) for array in arrays.values())
    # The coarse band is the only one asked to resample onto the reference grid.
    assert ("b05", (10, 10)) in calls
    assert ("b08", None) in calls and ("b04", None) in calls


def test_read_bands_resamples_a_native_band_that_turns_out_to_be_a_different_size(monkeypatch):
    calls: list = []
    shapes = {"vv": (8, 8), "vh": (4, 4)}
    monkeypatch.setattr(stac, "_read_band_clipped", _fake_reader(shapes, calls))

    arrays, _, _, shape = stac._read_bands(
        {"vv": "vv", "vh": "vh"}, (0, 0, 1, 1), native=["vv", "vh"]
    )

    assert shape == (8, 8)
    assert arrays["vh"].shape == (8, 8)
    assert ("vh", (8, 8)) in calls


def test_read_bands_returns_nothing_when_the_area_misses_the_scene(monkeypatch):
    def read(href, bounds, target_shape=None):
        return np.array([], dtype=np.float32), "transform", "crs"

    monkeypatch.setattr(stac, "_read_band_clipped", read)
    assert stac._read_bands({"a": "a", "b": "b"}, (0, 0, 1, 1), native=["a", "b"]) is None


# --- choosing and combining scenes -------------------------------------------------------------


def _scene(day: date, cloud: float = 10.0, scene_id: str | None = None):
    return types.SimpleNamespace(
        id=scene_id or day.isoformat(),
        datetime=datetime(day.year, day.month, day.day, 5, 30, tzinfo=timezone.utc),
        properties={"eo:cloud_cover": cloud},
    )


START = date(2026, 1, 1)


def _every(days: int, count: int, cloud: float = 10.0):
    return [_scene(START + timedelta(days=days * i), cloud) for i in range(count)]


@pytest.mark.parametrize(
    ("period_days", "expected"),
    [(1, 3), (7, 3), (14, 3), (30, 5), (60, 10), (72, 12), (90, 12), (365, 12), (366, 12)],
)
def test_scene_budget_grows_with_the_period_between_three_and_twelve(period_days, expected):
    end = START + timedelta(days=period_days - 1)
    assert stac.scene_budget(START, end) == expected


def test_all_scenes_are_kept_when_there_are_few():
    scenes = _every(10, 4)
    chosen = stac.select_scenes(scenes, START, START + timedelta(days=364), 12, key=stac._cloud_cover)
    assert [item.id for item in chosen] == [item.id for item in scenes]


def test_scenes_come_back_in_time_order_whatever_order_they_were_given():
    scenes = _every(10, 4)
    shuffled = [scenes[2], scenes[0], scenes[3], scenes[1]]
    chosen = stac.select_scenes(shuffled, START, START + timedelta(days=364), 12, key=stac._cloud_cover)
    assert [item.id for item in chosen] == [item.id for item in scenes]


def test_a_long_period_is_covered_end_to_end_and_not_just_its_busiest_spell():
    # 60 scenes in January alone, then one per month for the rest of the year.
    january = [_scene(START + timedelta(days=i % 28), 5.0, f"jan-{i}") for i in range(60)]
    rest = [_scene(date(2026, month, 15), 20.0, f"m{month}") for month in range(2, 13)]
    end = date(2026, 12, 31)

    chosen = stac.select_scenes(january + rest, START, end, 12, key=stac._cloud_cover)

    # Twelve scenes, one from each month, even though January had far more to offer.
    assert len(chosen) == 12
    assert {item.datetime.month for item in chosen} == set(range(1, 13))


def test_the_clearest_scene_of_each_time_slice_is_chosen():
    # Two slices of 10 days; each has a cloudy and a clear scene.
    cloudy_a, clear_a = _scene(date(2026, 1, 2), 80, "cloudy-a"), _scene(date(2026, 1, 5), 5, "clear-a")
    cloudy_b, clear_b = _scene(date(2026, 1, 12), 70, "cloudy-b"), _scene(date(2026, 1, 15), 9, "clear-b")
    chosen = stac.select_scenes(
        [cloudy_a, clear_a, cloudy_b, clear_b], date(2026, 1, 1), date(2026, 1, 20), 2, key=stac._cloud_cover
    )
    assert [item.id for item in chosen] == ["clear-a", "clear-b"]


def test_a_scene_with_no_date_is_ignored_and_nothing_to_choose_gives_nothing():
    undated = types.SimpleNamespace(id="x", datetime=None, properties={})
    assert stac.select_scenes([undated], START, START + timedelta(days=10), 3, key=stac._cloud_cover) == []
    assert stac.select_scenes([], START, START + timedelta(days=10), 3, key=stac._cloud_cover) == []
    assert stac.select_scenes(_every(2, 3), START, START + timedelta(days=10), 0, key=stac._cloud_cover) == []


def test_a_scene_date_can_come_from_its_properties():
    scene = types.SimpleNamespace(id="p", datetime=None, properties={"datetime": "2026-03-04T10:00:00Z"})
    assert stac._item_date(scene) == date(2026, 3, 4)


def test_median_combine_takes_the_middle_value_per_cell_and_band():
    combined = stac.median_combine(
        [
            {1: {"ndvi": 0.2, "lst": 30.0}, 2: {"ndvi": 0.5}},
            {1: {"ndvi": 0.8, "lst": 34.0}, 2: {"ndvi": 0.7}},
            {1: {"ndvi": 0.4}, 2: {"ndvi": 0.6}},
        ]
    )
    assert combined[1]["ndvi"] == pytest.approx(0.4)
    assert combined[1]["lst"] == pytest.approx(32.0)  # only two scenes had it: mean of two
    assert combined[2]["ndvi"] == pytest.approx(0.6)


def test_median_combine_resists_one_outlier_scene():
    combined = stac.median_combine([{1: {"ndvi": 0.5}}, {1: {"ndvi": 0.52}}, {1: {"ndvi": -0.9}}])
    assert combined[1]["ndvi"] == pytest.approx(0.5)


def test_median_combine_of_one_scene_is_that_scene_and_of_none_is_empty():
    assert stac.median_combine([{1: {"ndvi": 0.5}}]) == {1: {"ndvi": 0.5}}
    assert stac.median_combine([]) == {}
    assert stac.median_combine([{}, {}]) == {}


def test_map_scenes_skips_a_scene_that_fails_and_keeps_the_rest():
    scenes = _every(1, 3)

    def per_scene(item):
        if item.id == scenes[1].id:
            raise RuntimeError("bad file")
        return {1: {"ndvi": 0.5}}

    assert stac._map_scenes(per_scene, scenes) == [{1: {"ndvi": 0.5}}, {1: {"ndvi": 0.5}}]


def test_map_scenes_raises_when_every_scene_fails_so_the_source_is_reported_failed():
    def per_scene(item):
        raise RuntimeError(f"cannot read {item.id}")

    with pytest.raises(RuntimeError, match="cannot read"):
        stac._map_scenes(per_scene, _every(1, 3))


def test_map_scenes_with_no_scenes_does_nothing():
    assert stac._map_scenes(lambda item: {}, []) == []


def test_map_scenes_keeps_results_in_scene_order():
    scenes = _every(1, 5)
    results = stac._map_scenes(lambda item: {int(item.id[-2:]): {"x": 1.0}}, scenes)
    assert [list(r)[0] for r in results] == [1, 2, 3, 4, 5]


def test_cloud_and_shadow_pixels_are_dropped_from_a_scene(monkeypatch):
    grid = gpd.GeoDataFrame(
        {"grid_id": [1, 2]},
        geometry=[box(0, 0, 2, 2), box(2, 0, 4, 2)],
        crs="EPSG:3857",
    ).to_crs(4326)
    transform = from_origin(0, 2, 1, 1)
    bright = np.full((2, 4), 4000.0, dtype=np.float32)  # reflectance 0.4 everywhere
    dark = np.full((2, 4), 1000.0, dtype=np.float32)
    arrays = {
        "nir": bright, "red": dark, "green": dark, "blue": dark,
        "rededge1": dark, "swir16": dark, "swir22": dark,
    }
    monkeypatch.setattr(stac, "_read_bands", lambda *a, **k: (arrays, transform, "EPSG:3857", (2, 4)))
    # Cell 2 (right half) is high-probability cloud (SCL 9); cell 1 is vegetation (SCL 4).
    scl = np.array([[4, 4, 9, 9], [4, 4, 9, 9]], dtype=np.float32)
    reads = []

    def read_scl(href, bounds, shape=None, *, categorical=False):
        reads.append((href, shape, categorical))
        return scl, transform, "EPSG:3857"

    monkeypatch.setattr(stac, "_read_band_clipped", read_scl)
    asset = types.SimpleNamespace
    names = ("B08", "B04", "B03", "B02", "B05", "B11", "B12", "SCL")
    item = types.SimpleNamespace(
        assets={name: asset(href=f"T43QDV_{name}_10m.tif") for name in names},
        properties={"s2:processing_baseline": "03.00"},
    )

    metrics = stac._optical_scene_metrics(item, (0, 0, 1, 1), grid, [1, 2])

    assert reads == [("T43QDV_SCL_10m.tif", (2, 4), True)]  # class codes are never blended
    assert set(metrics) == {1}
    assert metrics[1]["ndvi"] == pytest.approx((0.4 - 0.1) / (0.4 + 0.1), abs=1e-4)


def test_a_proj_database_from_another_install_is_ignored(monkeypatch, tmp_path):
    inside = str(Path(sys.prefix) / "Lib" / "site-packages" / "rasterio" / "proj_data")
    monkeypatch.setenv("PROJ_LIB", str(tmp_path / "postgis" / "proj"))
    monkeypatch.setenv("PROJ_DATA", inside)

    stac._use_bundled_proj_data()

    assert "PROJ_LIB" not in os.environ
    assert os.environ["PROJ_DATA"] == inside


def _labelled_item(**overrides):
    """A Sentinel-2 item whose assets carry ESA's real labels, with some replaced by ``overrides``."""
    real = {
        "B02": ("blue", 0.49), "B03": ("green", 0.56), "B04": ("red", 0.665),
        "B05": ("rededge", 0.704), "B08": ("nir", 0.842), "B11": ("swir16", 1.61),
        "B12": ("swir22", 2.19),
    }
    assets = {}
    for band, (common, wavelength) in real.items():
        name, common, wavelength, file_band = overrides.get(band, (band, common, wavelength, band))
        assets[band] = types.SimpleNamespace(
            href=f"https://x/T43QDV_20261114T053059_{file_band}_10m.tif?sig=1",
            extra_fields={"eo:bands": [{"name": name, "common_name": common, "center_wavelength": wavelength}]},
        )
    return types.SimpleNamespace(assets=assets)


def test_every_colour_reads_its_own_sentinel_band():
    assert stac.SENTINEL2_BAND_MAP == {
        "blue": "B02", "green": "B03", "red": "B04",
        "rededge1": "B05", "nir": "B08", "swir16": "B11", "swir22": "B12",
    }
    stac.check_sentinel2_band_labels(_labelled_item())  # real metadata passes


@pytest.mark.parametrize(
    "override, message",
    [
        ({"B04": ("B04", "green", 0.56, "B04")}, "B04 should be red but is labelled green"),
        ({"B03": ("B03", "green", 0.665, "B03")}, "B03 should be at 0.56"),
        ({"B02": ("B03", "blue", 0.49, "B02")}, "B02 asset is labelled B03"),
        ({"B08": ("B08", "nir", 0.842, "B04")}, "B08 asset points at"),
    ],
)
def test_a_swapped_band_is_refused(override, message):
    with pytest.raises(stac.BandMappingError, match=message):
        stac.check_sentinel2_band_labels(_labelled_item(**override))


def test_removing_an_external_proj_database_twice_is_harmless(monkeypatch, tmp_path):
    # Optical and radar reads run in parallel and both clear the variable; the second must not fail.
    monkeypatch.setenv("PROJ_LIB", str(tmp_path / "postgis" / "proj"))
    real_get = os.environ.get
    monkeypatch.setattr(os.environ, "get", lambda name, default=None: str(tmp_path) if name == "PROJ_LIB" else real_get(name, default))
    os.environ.pop("PROJ_LIB")

    stac._use_bundled_proj_data()  # sees the variable, but another thread already removed it

    assert "PROJ_LIB" not in os.environ
