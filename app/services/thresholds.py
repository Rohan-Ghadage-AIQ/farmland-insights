import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.exceptions import DomainError


THRESHOLDS_FILE = Path(__file__).resolve().parent.parent / "data" / "advisory_thresholds.json"


@lru_cache(maxsize=1)
def load_advisory_thresholds() -> dict[str, Any]:
    """
    Load and validate the advisory thresholds JSON file.

    Successful loads are cached for the process lifetime via lru_cache(maxsize=1),
    so subsequent calls return the cached dict without file I/O. Validates that the
    parsed payload contains the required top-level threshold sections.

    Returns:
        Parsed thresholds dict containing "base_thresholds", "sar_thresholds", and
        "derived_thresholds" sections.

    Raises:
        DomainError: If the file does not exist, contains invalid JSON, or is missing
            any required top-level section.
    """

    if not THRESHOLDS_FILE.exists():
        raise DomainError(
            "Advisory thresholds file not found.",
            details={"path": str(THRESHOLDS_FILE)},
        )

    try:
        payload = json.loads(THRESHOLDS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DomainError(
            "Advisory thresholds file is invalid JSON.",
            details={"path": str(THRESHOLDS_FILE), "error": str(exc)},
        ) from exc

    required_sections = {"base_thresholds", "sar_thresholds", "derived_thresholds"}
    missing = sorted(required_sections - set(payload))
    if missing:
        raise DomainError(
            "Advisory thresholds JSON is missing required sections.",
            details={"missing_sections": missing},
        )

    return payload
