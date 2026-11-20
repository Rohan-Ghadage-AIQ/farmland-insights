from typing import Any


class DomainError(Exception):
    """Error type for expected business/domain validation failures."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
