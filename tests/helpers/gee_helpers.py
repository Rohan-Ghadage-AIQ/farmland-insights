from __future__ import annotations

from typing import Any

from tests.dataclasses import FakeFilterExpression


class FakeFilter:
    """
    Test double for ee.Filter that creates inspectable filter expressions.

    Each method mirrors its ee.Filter counterpart but returns a FakeFilterExpression
    capturing the operator, field, and value instead of constructing a real GEE filter.
    The fake collection stores these expressions, allowing tests to assert that the
    correct filters were built without requiring an active Earth Engine session.
    """
    @staticmethod
    def lt(field: str, value: int) -> FakeFilterExpression:
        return FakeFilterExpression(operator="lt", field=field, value=value)

    @staticmethod
    def listContains(field: str, value: str) -> FakeFilterExpression:
        return FakeFilterExpression(operator="listContains", field=field, value=value)

    @staticmethod
    def eq(field: str, value: str) -> FakeFilterExpression:
        return FakeFilterExpression(operator="eq", field=field, value=value)


class FakeReducer:
    """
    Test double for ee.Reducer.

    Returns a plain string label, such as "mean", instead of a real GEE Reducer
    object. This lets tests verify that reduceRegions requested the expected
    reducer without triggering any Earth Engine computation.
    """

    @staticmethod
    def mean() -> str:
        return "mean"


class FakeNumber:
    """
    Test double for ee.Number that returns a preset value without contacting GEE.

    Mimics the .getInfo() call pattern used to resolve GEE server-side numbers,
    such as collection.size(), into plain Python ints without making network requests.
    """

    def __init__(self, value: int):
        self._value = value

    def getInfo(self) -> int:
        return self._value


class FakeImage:
    '''
    Placeholder image passed into fake ImageCollection.map callbacks.

    The production GEE map callback expects an image argument, but these tests
    patch the actual image-processing functions, so no image behavior is needed.
    This could be replaced by object(), but the named class makes the fake flow
    clearer in test failures and helper code.
    '''

    pass


class FakeComposite:
    """
    Test double for a GEE image composite (the result of .map().median()).

    Stores the collection name, cloud-cover threshold, and start date used to build
    the composite instead of processing real satellite imagery. The clip() method
    records the AOI the composite was clipped to and returns self to preserve
    the method-chaining behavior of the real GEE API.
    """

    def __init__(self, *, collection_name: str, max_cloud_cover: int | None, start_date: str | None):
        self.collection_name = collection_name
        self.max_cloud_cover = max_cloud_cover
        self.start_date = start_date
        self.clipped_to: object | None = None

    def clip(self, aoi: object) -> "FakeComposite":
        self.clipped_to = aoi
        return self


class FakeCollection:
    """
    Test double for an ee.ImageCollection that records chained filter/map calls.

    Mirrors the real GEE ImageCollection call pattern without contacting GEE servers.
    Each method records its arguments onto the parent FakeEEModule for later assertions:
        - filterBounds  -> appends (name, aoi) to ee_module.bounds_calls
        - filterDate    -> stores start/end dates and appends to ee_module.date_ranges
        - filter        -> appends the FakeFilterExpression and extracts the cloud-cover threshold when applicable
        - size          -> returns a FakeNumber driven by ee_module.optical_image_count or sar_image_counts_by_start
        - map           -> appends the collection name to ee_module.map_calls and invokes fn on a FakeImage
        - median        -> returns a FakeComposite carrying the collection name, cloud-cover threshold, and start date

    This lets tests simulate empty/populated collections and assert that the service built
    the expected GEE query.
    """

    def __init__(self, ee_module: "FakeEEModule", name: str):
        self._ee_module = ee_module
        self.name = name
        self.max_cloud_cover: int | None = None
        self.start_date: str | None = None
        self.end_date: str | None = None
        self._merged_collections: list["FakeCollection"] = []

    def filterBounds(self, aoi: object) -> "FakeCollection":
        self._ee_module.bounds_calls.append((self.name, aoi))
        return self

    def filterDate(self, start: str, end: str) -> "FakeCollection":
        self.start_date = start
        self.end_date = end
        self._ee_module.date_ranges.append((self.name, start, end))
        return self

    def filter(self, expression: FakeFilterExpression) -> "FakeCollection":
        self._ee_module.filter_expressions.append(expression)
        if expression.operator == "lt" and expression.field in {"CLOUDY_PIXEL_PERCENTAGE", "CLOUD_COVER"}:
            self.max_cloud_cover = int(expression.value)
        return self

    def size(self) -> FakeNumber:
        image_count = self._image_count()
        for collection in self._merged_collections:
            image_count += collection._image_count()
        return FakeNumber(image_count)

    def _image_count(self) -> int:
        if self.name == "COPERNICUS/S2_SR_HARMONIZED":
            return self._ee_module.optical_image_count
        if self.name == "COPERNICUS/S1_GRD":
            return self._ee_module.sar_image_counts_by_start.get(self.start_date, 0)
        return self._ee_module.landsat_image_counts_by_name.get(self.name, 0)

    def merge(self, other: "FakeCollection") -> "FakeCollection":
        self._merged_collections.append(other)
        return self

    def map(self, fn):
        self._ee_module.map_calls.append(self.name)
        fn(FakeImage())
        return self

    def median(self) -> FakeComposite:
        return FakeComposite(
            collection_name=self.name,
            max_cloud_cover=self.max_cloud_cover,
            start_date=self.start_date,
        )


class FakeEEModule:
    """
    Top-level test double for the earthengine-api (ee) module.

    Acts as the single source of truth for GEE interactions in tests and is injected
    wherever the real ee module would be used. Wires together FakeFilter,
    FakeReducer, and FakeCollection into a cohesive fake that mirrors the small
    ee API surface used by the service while recording calls for assertions:

        initialized_projects      - projects passed to ee.Initialize()
        image_collection_names    - collection names passed to ee.ImageCollection()
        filter_expressions        - all FakeFilterExpressions applied via .filter()
        date_ranges               - (collection, start, end) tuples from .filterDate()
        bounds_calls              - (collection, aoi) tuples from .filterBounds()
        map_calls                 - collection names that had .map() invoked

    optical_image_count and sar_image_counts_by_start control how many images
    FakeCollection.size() reports via FakeNumber, allowing tests to simulate empty
    collections, populated collections, and SAR rollback scenarios without any real
    imagery or Earth Engine credentials.
    """
    Filter = FakeFilter
    Reducer = FakeReducer

    def __init__(
        self,
        *,
        optical_image_count: int = 1,
        sar_image_counts_by_start: dict[str, int] | None = None,
        landsat_image_counts_by_name: dict[str, int] | None = None,
    ):
        self.optical_image_count = optical_image_count
        self.sar_image_counts_by_start = sar_image_counts_by_start or {}
        self.landsat_image_counts_by_name = landsat_image_counts_by_name or {}
        self.initialized_projects: list[str | None] = []
        self.image_collection_names: list[str] = []
        self.filter_expressions: list[FakeFilterExpression] = []
        self.date_ranges: list[tuple[str, str, str]] = []
        self.bounds_calls: list[tuple[str, object]] = []
        self.map_calls: list[str] = []

    def Initialize(self, project: str | None = None) -> None:
        self.initialized_projects.append(project)

    def ImageCollection(self, name: str) -> FakeCollection:
        self.image_collection_names.append(name)
        return FakeCollection(self, name)


class FakeReducedRegions:
    """
    Test double for the result of ee.Image.reduceRegions().

    Returns a pre-set dict from getInfo() instead of fetching real zonal
    statistics from GEE servers, allowing tests to inject arbitrary per-grid
    metrics without any satellite computation.
    """
    def __init__(self, payload: dict[str, Any]):
        self._payload = payload

    def getInfo(self) -> dict[str, Any]:
        return self._payload


class FakeReducibleImage:
    """
    Test double for a GEE image that supports band selection and zonal reduction.

    Records the bands passed to select() and the kwargs passed to reduceRegions()
    for later assertion, then returns a FakeReducedRegions pre-loaded with the
    given payload instead of performing real pixel aggregation on GEE servers.
    """
    def __init__(self, payload: dict[str, Any]):
        self._payload = payload
        self.selected_bands: list[str] | None = None
        self.reduce_regions_kwargs: dict[str, Any] | None = None

    def select(self, bands: list[str]) -> "FakeReducibleImage":
        self.selected_bands = bands
        return self

    def reduceRegions(self, **kwargs: Any) -> FakeReducedRegions:
        self.reduce_regions_kwargs = kwargs
        return FakeReducedRegions(self._payload)


def mock_reduce_regions_mean_by_cloud_cover(
    _ee_module: object,
    image: FakeComposite,
    _bands: tuple[str, ...],
    _grid_feature_collection: object,
    _scale_meters: int,
) -> dict[int, dict[str, float]]:
    """
    Test stub for _reduce_regions_mean that returns different per-grid metrics
    based on the cloud cover threshold used to build the composite.

    Allows tests to verify that different max_cloud_cover values produce different
    metric outputs without invoking any real GEE zonal reduction.
    """
    if image.max_cloud_cover == 30:
        return {1: {"ndvi": 0.54, "evi": 0.33, "ndmi": 0.21}}
    if image.max_cloud_cover == 10:
        return {1: {"ndvi": 0.68, "evi": 0.44, "ndmi": 0.29}}
    return {}
