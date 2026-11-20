#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."  # always run from the repo root

host="${HOST:-127.0.0.1}"
port="${PORT:-8000}"
reload="${RELOAD:-1}"

uvicorn_args=(
  app.main:app
  --host "$host"
  --port "$port"
)

if [[ "$reload" == "1" || "$reload" == "true" || "$reload" == "TRUE" ]]; then
  uvicorn_args+=(--reload)
fi

run_tests="${RUN_TESTS:-0}"

# Tests are opt-in (RUN_TESTS=1) and never block server startup.
if [[ "$run_tests" == "1" || "$run_tests" == "true" || "$run_tests" == "TRUE" ]]; then
  echo "Running tests (failures will not block startup)..."
  uv run pytest -q || echo "WARNING: pytest failed; continuing."
fi

echo "Starting Uvicorn server at http://${host}:${port}"
exec uv run uvicorn "${uvicorn_args[@]}"
