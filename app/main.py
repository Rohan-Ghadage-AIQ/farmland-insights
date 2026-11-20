from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.endpoints import analysis, auth
from app.auth import PROPELAUTH_STATE_KEY, initialize_propelauth
from app.config import get_settings
from app.exceptions import DomainError
from app.logging import configure_logging, get_logger
from app.models.requests import CropCategory
from app.services.thresholds import load_advisory_thresholds

configure_logging()
logger = get_logger(__name__)
settings = get_settings()

app = FastAPI(title="Farmland Insights API", version="0.1.0")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")


@app.on_event("startup")
async def load_static_data() -> None:
    if getattr(app.state, PROPELAUTH_STATE_KEY, None) is None:
        setattr(app.state, PROPELAUTH_STATE_KEY, initialize_propelauth(settings))

    thresholds = load_advisory_thresholds()
    threshold_categories = set(thresholds["base_thresholds"].keys())
    schema_categories = {category.value for category in CropCategory}

    missing_in_schema = sorted(threshold_categories - schema_categories)
    missing_in_thresholds = sorted(schema_categories - threshold_categories)
    if missing_in_schema or missing_in_thresholds:
        raise RuntimeError(
            "CropCategory schema mismatch with advisory thresholds JSON. "
            f"missing_in_schema={missing_in_schema}, "
            f"missing_in_thresholds={missing_in_thresholds}"
        )

    app.state.advisory_thresholds = thresholds
    logger.info(
        "startup_complete",
        extra={
            "threshold_categories": len(threshold_categories),
            "ee_project_id": settings.ee_project_id,
        },
    )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        duration_ms = round((perf_counter() - started) * 1000, 2)
        logger.info(
            "request_complete",
            extra={
                "path": request.url.path,
                "method": request.method,
                "status_code": status_code,
                "duration_ms": duration_ms,
            },
        )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(DomainError)
async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
    logger.warning(
        "domain_error",
        extra={
            "path": request.url.path,
            "method": request.method,
            "details": exc.details,
        },
    )
    return JSONResponse(
        status_code=400,
        content={
            "error": "bad_request",
            "detail": exc.message,
            "details": exc.details,
        },
    )


@app.exception_handler(Exception)
async def handle_unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "internal_server_error",
        extra={"path": request.url.path, "method": request.method},
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "detail": "An unexpected server error occurred.",
        },
    )
